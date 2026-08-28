# Comissionamento com base no Metabase

Passar a origem oficial das conversões de comissão para a importação diária do Metabase, arquivar (sem apagar) o cálculo automático a partir do Stripe e criar uma aba com a fotografia da base Metabase, com fechamento mensal.

## 1. Fonte: `metas_ativos_pagantes_daily` (já alimentada hoje)

Confirmado na base: a tabela existe, tem snapshot diário (últimos dias até 27/08) e é detalhada por cliente, com `company_id`, `email`, `plano`, `nome_oferta`, `stripe_price_id`, `mrr`, `origem_cliente`, `data_inicio`, `recorrencia_pagamento` e `classificacao_company`. As classificações presentes são `novo pagante`, `recuperado`, `upsell`, `downsell` e `regular`. No snapshot de 27/08 há 127 novos pagantes (R$ 18,3 mil), 40 recuperados (R$ 6,5 mil) e 8 upsells (R$ 1,5 mil). Dá certo por este caminho — com três ajustes obrigatórios:

1. **Não tem coluna de vendedor.** O caminho é resolver o vendedor por cascata a partir de `email`/`company_id`: mapa de vendedor por price ID, `ac_owner_seller_map`, oportunidade ganha do contato, histórico de `stripe_conversions`/comissões do mesmo cliente. Sem match, a linha cai na aba "Sem vendedor" para atribuição manual (e a atribuição fica gravada para o próximo reprocesso).
2. **A classificação é janela móvel, não mês fechado.** As linhas classificadas trazem `data_inicio` de até ~30 dias atrás (no snapshot de 27/08 começa em 29/07). O mês da venda para comissão vem de `data_inicio` (fuso São Paulo), não de `mes_ref` do snapshot.
3. **Upsell não traz o MRR anterior.** O delta será calculado comparando o `mrr` do mesmo `company_id` no snapshot anterior (a tabela guarda a série diária) e, quando não houver snapshot anterior, pelo `previous_mrr` já existente em `stripe_conversions`. Sem nenhuma das duas referências, a linha entra como pendência de revisão em vez de comissionar o MRR cheio.

Não será criada tabela nova de conversões: a ingestão diária que já existe continua igual.

## 2. Cálculo da comissão a partir dessa base

- Nova rotina `apply_commissions_from_metabase(p_month)` que lê as linhas de `metas_ativos_pagantes_daily` do snapshot mais recente (ou do snapshot fechado do mês) e gera/atualiza as linhas de comissão com origem `metabase`.
- Comissiona apenas `novo pagante`, `recuperado` e `upsell` (este último só sobre o delta de MRR). `downsell` e `regular` ficam de fora.
- Deduplicação por `company_id` + `stripe_price_id` + mês da venda, para o snapshot diário não gerar linha repetida.
- Mantém tudo que já existe: percentuais por plano/periodicidade, mapa de preços (price ID → plano/área), elegibilidade e multiplicadores por tipo de conversão, base líquida/bruta, pagamento T+N.
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

- Rotina diária: ao virar o mês, copia/marca a fotografia do último dia do mês anterior de `metas_ativos_pagantes_daily` como referência fechada daquele mês, usada nas consultas históricas.
- Botão manual de admin na aba para forçar/refazer o fechamento de um mês.

## Detalhes técnicos

- Migração: tabela de snapshot mensal fechado (`metas_ativos_pagantes_monthly`, mesma estrutura da diária + `mes_fechado`) com GRANTs e RLS (leitura autenticada, escrita service role); origem `metabase` nas linhas de comissão; funções `apply_commissions_from_metabase(p_month)` e de fechamento de snapshot; índices por `data_snapshot`, `classificacao_company` e `company_id`.
- Sem alteração na edge function de ingestão: a tabela já é alimentada hoje.
- Frontend: novo componente `ComissionamentoMetabaseBase.tsx`, remoção do trigger/aba `stripe` em `src/pages/Comissionamento.tsx`.
- Resolução de vendedor reaproveita `resolve_stripe_seller` e `ac_owner_seller_map`, com atribuição manual persistida.

