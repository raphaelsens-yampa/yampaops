# Auditoria do heatmap do Cohort — Workshop FC 03/2026

## Como o heatmap é calculado hoje

O heatmap não usa nenhum histórico mês a mês. Ele é montado no navegador (`buildCohortMatrix`, em `src/lib/campaignCohort.ts`) a partir de **uma única linha por cliente** em `campaign_cohort_results`:

1. Cada cliente entra na linha (cohort) do **mês da data de ativação** informada na lista importada.
2. A coluna M0, M1, M2… é o mês relativo a essa ativação; o número de colunas vai até o mês atual.
3. Em cada célula, o cliente é considerado ativo se **não tem data de cancelamento** ou se o cancelamento é posterior ao mês daquela coluna (no mês do cancelamento ele já sai).
4. O MRR da célula é a soma do **MRR atual (último conhecido) de cada cliente ainda ativo** — o mesmo valor é repetido em todos os meses.

Ou seja: a persistência do MRR é uma projeção retroativa do valor atual, não o MRR real de cada mês. Upgrades, downgrades, descontos temporários e valor no momento da venda não aparecem.

## O que isso produziu nesta campanha

Campanha Workshop FC de 03/2026 (ref. 2026-03-01), 16 contatos, todos com ativação em março/26 — logo só existe **uma linha (mar/26)** com colunas M0 a M6.

- **M0 = 15 de 16 ativos (94%)**, e não 100%: o registro de `diretoria@mybossdobrasil.com.br` tem cancelamento em **22/12/2025**, anterior à ativação de março/26 (é uma assinatura antiga do mesmo e-mail). Como o cancelamento é anterior ao mês da coluna, ele nasce cancelado no M0.
- **MRR de M0 ≈ R$ 8.523**, somando o MRR atual de todos. Mas vários desses valores são de assinaturas cujo `started_at` é agosto/26 (ex.: `betofell@hotmail.com` R$ 599, `msuzuki180602` R$ 799,90, `marcosmourasbs512` R$ 799,90). Em março esses valores eram outros (ou nem existiam nesse patamar) — o M0 está inflado.
- Cancelados carregam o **último MRR conhecido** em todos os meses até o cancelamento (ex.: `concrelupi` R$ 799,90 de M0 a M2), mesmo que na época o valor fosse menor.
- Nenhum cliente desta campanha tem ajuste manual de MRR, então o heatmap reflete 100% o dado importado do Metabase.

## Correção proposta

1. **MRR real por mês**: criar uma RPC que devolva, para cada e-mail da campanha e cada mês do cohort, o MRR do cliente no **snapshot daquele mês** (base `metas_ativos_pagantes_daily`, último dia disponível do mês, fuso São Paulo). O heatmap passa a somar o MRR daquele mês, não o atual.
2. **Fallback controlado**: mês sem snapshot para o cliente → usa o MRR mais antigo conhecido do próprio cliente (nunca o atual), e a célula sinaliza no tooltip que o valor é estimado.
3. **Ajustes manuais preservados**: quando existir override de MRR do cliente, ele continua prevalecendo sobre o valor do snapshot em todos os meses.
4. **Cancelamento anterior à ativação**: registros cujo `canceled_at` é anterior ao mês de ativação passam a ser tratados como assinatura antiga (ignorado para churn), evitando cliente "nascer cancelado" e a queda indevida no M0.
5. **Consistência**: a curva (`campaign_cohort_curve`), os cards de Receita Acumulada/LTV e as exportações passam a usar a mesma série mês a mês, para não divergirem do heatmap.

## Detalhes técnicos

- Nova RPC `campaign_cohort_mrr_by_month(p_campaign_id uuid)` retornando `(email_norm, year_month date, mrr numeric, source text)`, `SECURITY DEFINER`, restrita a `is_tatico_or_admin(auth.uid())`, lendo o último snapshot de cada mês em `metas_ativos_pagantes_daily`.
- `buildCohortMatrix` passa a receber um mapa `email_norm → {mês → mrr}`; `active`/`retention_pct` seguem a lógica atual (corrigida no item 4), só o MRR muda de fonte.
- `computeLifetimeRevenue` e `summarizeCurve` consomem a mesma série mensal; `cohortRowsToMatrix` ganha coluna de MRR do mês de ativação.
- Leituras via `fetchAllPaged`; nenhuma alteração nas Edge Functions de refresh/Stripe.
