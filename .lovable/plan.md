# Base histórica de churn para o Cohort

## Situação atual (verificada)

- O cohort busca cancelamento em `metas_ativos_pagantes_daily` (linhas `cancelado`) e em `stripe_churn_events`.
- `stripe_churn_events` está vazia (0 linhas).
- Existe apenas 1 dia de snapshot (2026-08-23), com 101 cancelados — todos com data entre 01/08 e 23/08/2026.

Conclusão: hoje só há churn de agosto/2026. Quem cancelou antes cai como "Nunca assinou" ou fica sem data, e a matriz de cohort fica incorreta.

## O que será construído

### 1. Tabela histórica de cancelamentos

Nova tabela `metas_churn_historico`, uma linha por assinatura cancelada:
e-mail normalizado, company id, plano/oferta, MRR perdido, data de início,
data de cancelamento, motivo/tipo de churn, origem do registro (metabase ou planilha),
atualizada de forma idempotente (sem duplicar reprocessamentos).

### 2. Carga a partir do Metabase (últimos 24 meses)

Ampliar a ingestão de cancelados para uma janela de 24 meses e gravar em
`metas_churn_historico`, além de manter o snapshot diário atual intacto.
A carga diária passa a acumular churn em vez de só refletir o mês corrente.

### 3. Importação manual por planilha

Novo importador (XLSX/CSV) na aba de configurações do Cohort para complementar
o que o Metabase não tiver: e-mail, data de cancelamento, motivo, plano e MRR.
Preview com contagem de válidos, inválidos e duplicados antes de confirmar,
igual ao padrão de importação já usado no projeto.

### 4. Cohort passa a usar a base histórica

O recálculo do cohort passa a resolver o cancelamento nesta ordem:
snapshot do dia (cliente ainda presente) → `metas_churn_historico` (Metabase)
→ registro manual da planilha → Stripe. A matriz mostra a fonte da data de churn
e o painel exibe quantos contatos ainda estão sem data de cancelamento confiável.

## Detalhes técnicos

- Migration: tabela `metas_churn_historico` com unique em (email_norm, data_cancelamento) para upsert idempotente, GRANTs para `authenticated`/`service_role` e RLS restrita a tático/admin.
- Edge Function de ingestão de cancelados: parametrizar a janela do card do Metabase para 24 meses e fazer upsert na nova tabela.
- `public.campaign_cohort_refresh`: novo CTE lendo `metas_churn_historico` com precedência sobre `stripe_churn_events`; grava `source_churn` no resultado.
- Front-end: novo diálogo de importação de churn reutilizando os helpers de parsing de `src/lib/campaignCohort.ts`; badge de fonte do churn e contador de "sem data de churn" no `CohortPanel`.
