# Edição manual do MRR no Cohort

Permitir que o usuário corrija pontualmente o MRR de um cliente na aba Cohort, sem que o ajuste seja perdido nos recálculos (Metabase/Stripe).

## Como vai funcionar

- Na tabela "Clientes da campanha", a célula de MRR ganha um botão de lápis. Ao clicar, abre um campo/dialog para digitar o novo valor e uma observação curta opcional.
- Valores ajustados aparecem com um selo "ajustado" e tooltip com o valor original e a nota.
- Botão "Limpar ajuste" volta ao valor calculado automaticamente.
- Todos os indicadores da aba (MRR ativo hoje, Receita Acumulada, LTV Real, LTV/CAC, ROI/payback, ARPA, curva de retenção, exportações CSV/XLSX) passam a usar o MRR efetivo (ajustado quando existir).
- Recalcular cohort e Consultar Stripe **não** sobrescrevem os ajustes manuais.

## Detalhes técnicos

Banco (migração):
- Novas colunas em `campaign_cohort_results`: `mrr_override numeric`, `mrr_override_note text`, `mrr_override_by uuid`, `mrr_override_at timestamptz`.
- Política de escrita: permitir update dessas colunas para os mesmos papéis que já leem a tabela (admin/tático), mantendo o padrão atual de RLS.
- `campaign_cohort_refresh` e `campaign_cohort_stripe_fill`: nos `INSERT ... ON CONFLICT DO UPDATE`, preservar as 4 colunas de override (não incluí-las no SET).
- `campaign_cohort_curve`: usar `COALESCE(mrr_override, mrr, 0)` no somatório de MRR.
- Edge Function `cohort-stripe-live`: no upsert, não tocar nas colunas de override.

Frontend:
- `src/lib/campaignCohort.ts`: adicionar `mrr_override`/`mrr_override_note` ao tipo `CohortResult` e criar helper `effectiveMrr(res)`; substituir todos os usos de `res.mrr` (summarize, computeLifetimeRevenue, matriz de cohort, export) por `effectiveMrr`.
- `src/components/campaign-history/CohortPanel.tsx`: edição inline do MRR (input + salvar/cancelar), selo "ajustado", ação de limpar ajuste, e refetch de `cohort-results` + `cohort-curve` após salvar.
- Export CSV/XLSX: colunas "MRR" (efetivo) e "MRR original".

Sem mudança em outras telas — o override vale só para o Cohort da campanha.
