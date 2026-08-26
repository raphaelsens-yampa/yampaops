# Cohort: cards de retorno real (LTV/CAC e ROI)

## O que muda nos cards

Remover: **Em trial,**  **Encontrados na base** e **Nunca assinaram**.

Linha de cima (esquerda → direita): Total da lista, Ativos, Cancelados, % de retenção, **MRR ativo hoje**.

Linha de baixo: **Receita Acumulada**, **LTV Real**, **LTV/CAC Real**, **ROI Real**.

## Regras dos novos cards

- **LTV/CAC Real** = LTV Real ÷ CAC da campanha (indicador "CAC", valor realizado do cadastro da campanha). Exibido como multiplicador (ex.: `3,4x`). Se o CAC não estiver preenchido ou for zero: "—".
- **ROI Real (payback)**: acumula a receita mês a mês (mesma base cliente a cliente já usada na Receita Acumulada: do mês de ativação até hoje se ativo, ou até o cancelamento) e encontra o primeiro mês em que o acumulado iguala/supera o **Investimento realizado** da campanha (indicador "Investimento", valor realizado).
  - Encontrado: mostra o tempo de payback, ex.: `M3 · 3 meses`.
  - Não atingido ainda: mostra **"Campanha ainda não se pagou"**.
  - Investimento não preenchido: "—".

## Detalhes técnicos

- `src/lib/campaignCohort.ts`
  - `computeLifetimeRevenue` passa a devolver também a série mensal acumulada (`monthly: { month_index, revenue, revenue_cum }[]`), construída somando o MRR de cada cliente nos meses em que ele estava ativo, com base absoluta no mês mais antigo de ativação (offset 0 = M0 do cohort).
  - Nova função `paybackMonth(monthly, investment)` que devolve `{ offset, months } | null` para o primeiro mês em que `revenue_cum >= investment`.
- `src/components/campaign-history/CohortPanel.tsx`
  - Nova query aos valores da campanha (`campaign_history_values` + `campaign_history_metrics`) para ler `actual_value` dos slugs `cac` e `investimento` da campanha selecionada.
  - Ajuste da lista `cards`: remoção de trial/never/encontrados na base, reordenação com `MRR ativo hoje` fechando a primeira linha (grid `lg:grid-cols-6` na primeira faixa e `lg:grid-cols-4` na segunda, mantendo responsividade mobile) e inclusão de LTV/CAC Real e ROI Real.
  - Formatações em PT-BR com `formatBRL` e multiplicador com uma casa decimal.