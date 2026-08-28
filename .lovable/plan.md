# Comissionamento com base no Metabase

Passar a origem oficial das conversões de comissão para a importação diária do Metabase, arquivar (sem apagar) o cálculo automático a partir do Stripe e criar uma aba com a fotografia da base Metabase, com fechamento mensal.

## 1. Fonte: `metas_ativos_pagantes_daily` (já alimentada hoje)

Confirmado na base: a tabela existe, tem snapshot diário (até 27/08) e é detalhada por cliente, com `company_id`, `email`, `plano`, `nome_oferta`, `stripe_price_id`, `mrr`, `origem_cliente`, `data_inicio`, `recorrencia_pagamento` e `classificacao_company`. As classificações presentes são `novo pagante`, `recuperado`, `upsell`, `downsell` e `regular`. No snapshot de 27/08: 127 novos pagantes (R$ 18,3 mil), 40 recuperados (R$ 6,5 mil) e 8 upsells (R$ 1,5 mil). O caminho funciona.

Um ponto de ajuste na ingestão: hoje a tabela **não guarda** `previous_mrr` nem data de pagamento — a função de ingestão que puxa o card do Metabase mapeia só `New Mrr`, `Status_pagamento` e as demais colunas. Como esses campos existem na origem, serão adicionadas duas colunas à tabela (`previous_mrr` e `data_pagamento`) e ao mapeamento da ingestão. Sem isso não há como calcular o delta de upsell nem recortar o mês vigente por data de pagamento.

Regras confirmadas:

1. **Vendedor:** resolvido exclusivamente pelo mapa de vendedor por Price ID. Sem correspondência, a linha cai na aba "Sem vendedor" para atribuição manual, e a atribuição fica gravada para o próximo reprocesso (não é sobrescrita).
2. **Recorte do mês:** mês vigente pelo campo de **data de pagamento** (fuso São Paulo), não por `mes_ref` do snapshot nem por `data_inicio`. Linhas da janela móvel cujo pagamento caiu em mês anterior entram no mês correto.
3. **Upsell:** comissiona só a diferença `mrr - previous_mrr`. Se o delta for zero ou negativo, não gera comissão; se `previous_mrr` vier vazio, a linha fica como pendência de revisão em vez de comissionar o MRR cheio.

## 2. Cálculo da comissão a partir dessa base

- Nova rotina `apply_commissions_from_metabase(p_month)` que lê as linhas de `metas_ativos_pagantes_daily` do snapshot mais recente do mês (ou do snapshot fechado, para meses passados) e gera/atualiza as linhas de comissão com origem `metabase`.
- Comissiona apenas `novo pagante`, `recuperado` e `upsell` (este só no delta). `downsell` e `regular` ficam de fora.
- Deduplicação por `company_id` + `stripe_price_id` + mês de pagamento, para o snapshot diário não gerar linha repetida.
- Mantém tudo que já existe: percentuais por plano/periodicidade, mapa de preços (price ID → plano/área/vendedor), elegibilidade e multiplicadores por tipo de conversão, base líquida/bruta, pagamento T+N.
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

- Migração: colunas `previous_mrr` (numeric) e `data_pagamento` (date) em `metas_ativos_pagantes_daily`; tabela de snapshot mensal fechado (`metas_ativos_pagantes_monthly`, mesma estrutura + `mes_fechado`) com GRANTs e RLS (leitura autenticada, escrita service role); origem `metabase` nas linhas de comissão; funções `apply_commissions_from_metabase(p_month)` e de fechamento de snapshot; índices por `data_snapshot`, `data_pagamento`, `classificacao_company` e `company_id`.
- Edge function `ativos-ingest`: mapear as colunas `Previous Mrr` e a data de pagamento do card do Metabase para as novas colunas (reprocesso de dias anteriores fica disponível).
- Frontend: novo componente `ComissionamentoMetabaseBase.tsx`, remoção do trigger/aba `stripe` em `src/pages/Comissionamento.tsx`.
- Vendedor: apenas `commission_price_map` (price ID → vendedor) + atribuição manual persistida; sem cascata por e-mail/oportunidade.


