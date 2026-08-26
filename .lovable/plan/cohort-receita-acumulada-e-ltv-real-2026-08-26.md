# Cohort: Receita Acumulada e LTV Real

## O que muda

1. **Remover o card "MRR perdido"** do painel de Cohort.
2. **Novo card "Receita Acumulada"** no lugar: soma do MRR de todos os meses do cohort (M0 + M1 + M2 + ... da linha consolidada), ou seja, a receita total gerada pelos clientes da campanha até hoje.
3. **Novo card "LTV Real"**: Receita Acumulada ÷ número de clientes que efetivamente assinaram (ativos + cancelados).
4. **Tabela consolidada (M0, M1, M2...)** ganha as linhas acumuladas:
   - Ativos (mês) — já existe
   - MRR (mês) — já existe
   - Retenção — já existe
   - **Ativos acumulados** (soma corrida) + **% sobre M0**
   - **MRR acumulado** (soma corrida) + **% sobre o total acumulado final**
   Assim é possível ler mês a mês a evolução e comparar com o valor consolidado exibido nos cards.

## Detalhes técnicos

- `src/lib/campaignCohort.ts`
  - Em `CohortSummary`: manter `mrrActive`, remover uso de `mrrLost` na UI (campo pode continuar existindo, sem exibição) e adicionar `revenueAccumulated` e `ltvReal`, calculados a partir da curva consolidada (`CurvePoint[]`) — nova função `summarizeCurve(curve, subscribers)` que devolve total acumulado e séries cumulativas.
  - `CurvePoint` ganha campos derivados opcionais: `active_cum`, `mrr_cum`, `active_cum_pct`, `mrr_cum_pct` (preenchidos em `buildCurve`).
- `src/components/campaign-history/CohortPanel.tsx`
  - Troca do card e inclusão do card LTV Real; ambos usam a curva (`curveQ`) e `summary.active + summary.canceled` como base do LTV.
  - Se a curva estiver vazia, os dois cards mostram "—".
- `src/components/campaign-history/CohortRetentionChart.tsx`
  - Adiciona as linhas de acumulado e percentuais na tabela "Consolidado", com formatação BRL/percentual e `tabular-nums`, mantendo o layout responsivo com scroll horizontal.
