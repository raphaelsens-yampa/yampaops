# Comissionamento com base no Metabase

Passar a origem oficial das conversões de comissão para a importação diária do Metabase, arquivar (sem apagar) o cálculo automático a partir do Stripe e criar uma aba com a fotografia da base Metabase, com fechamento mensal.

## 1. Nova base detalhada do Metabase

Hoje a ingestão diária grava apenas totais acumulados no mês (`metas_daily`, `metas_price_daily`), com `vendedor = "todos"`. Isso não permite comissão por vendedor. Será criada uma tabela nova para o payload detalhado, uma linha por venda:

- Identificação do cliente (nome/e-mail/company id), `stripe_price_id`, plano/oferta
- Classificação: `novos_pagantes`, `recuperados`, `upsell`, `downsell`
- Vendedor (texto do Metabase), área, origem do cliente
- Data da venda, MRR bruto e MRR líquido (valor final com cupom), periodicidade
- Campos de controle: data de captura, fonte, tipo de snapshot (parcial/fechado)

A função de ingestão passa a aceitar essa tabela na lista de tabelas permitidas, mantendo o comportamento idempotente (apaga o dia e reinsere) e o log bruto auditável.

## 2. Cálculo da comissão a partir dessa base

- Nova rotina que lê as linhas detalhadas de um mês e gera/atualiza as linhas de comissão marcadas com origem `metabase`.
- Mantém tudo que já existe: percentuais por plano/periodicidade, mapa de preços (price ID → plano/área), elegibilidade e multiplicadores por tipo de conversão, upsell por delta, base líquida/bruta, pagamento T+N.
- Vendedor resolvido pelo nome vindo do Metabase contra os perfis; sem correspondência, a linha cai na aba "Sem vendedor" para atribuição.
- Price ID sem de-para vira pendência, reaproveitando o reprocesso automático que já existe ao mapear um preço.
- Overrides manuais e linhas importadas por planilha são preservados: o reprocesso nunca sobrescreve linha com revisão manual, nem mexe em mês fechado.

## 3. Arquivar o caminho Stripe

- Remover a aba "Stripe" da tela de Comissionamento (componentes e funções ficam no projeto/banco, sem uso na interface).
- Desativar o gatilho automático que gera comissão quando entra conversão do Stripe, conforme escolhido.
- As 604 linhas já geradas via Stripe permanecem como histórico, com um botão admin de "Reprocessar mês pela base Metabase" que substitui as linhas daquele mês (preservando overrides manuais e respeitando meses fechados).

## 4. Nova aba "Base Metabase"

- Cabeçalho com a data da última fotografia, tipo (parcial/fechado) e fonte.
- Cards de Novos Pagantes, Recuperados, Upsell e Downsell (quantidade e MRR), por mês selecionado.
- Tabelas: por classificação/área, por vendedor e por plano/price ID, com exportação CSV/XLSX.
- Seletor de mês para consultar fotografias anteriores; meses passados mostram a foto fechada.
- Alerta de price IDs sem de-para e de vendedores não reconhecidos, com atalho para correção.
- Botão admin "Recalcular comissões do mês a partir desta base".

## 5. Fechamento mensal da fotografia

- Rotina diária: ao virar o mês, marca a fotografia do último dia do mês anterior como `fechado`, que passa a ser a referência para consultas históricas.
- Botão manual de admin na aba para forçar/refazer o fechamento de um mês.

## Detalhes técnicos

- Migração: nova tabela detalhada (`metas_conversoes_daily`) com GRANTs, RLS (leitura para autenticados, escrita via service role), índices por data/mês/classificação e chave de deduplicação; nova coluna de origem `metabase` nas linhas de comissão; função `apply_commissions_from_metabase(p_month)`; função de fechamento de snapshot.
- Edge function `metabase-snapshot-ingest`: incluir a nova tabela em `ALLOWED_TABLES`.
- Frontend: novo componente `ComissionamentoMetabaseBase.tsx`, remoção do trigger/aba `stripe` em `src/pages/Comissionamento.tsx`.
- Ao final, documentar o formato do payload detalhado esperado do Claude/Metabase.
