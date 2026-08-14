# Matriz semanal de metas por categoria (Acompanhamento Metas)

Nova tabela na aba **Acompanhamento Metas**: linhas = categorias de meta, colunas = semanas do mês, com seletor de mês (padrão: mês vigente).

## O que aparece

- Cada célula mostra **Esperado** (meta da semana) e **Realizado**, com badge **Meta batida** quando o resultado da semana atinge o esperado. Sem badge = não atingido.
- Semanas futuras ficam neutras ("—"), sem badge.
- Coluna final **Mês** com o acumulado esperado x realizado.
- Categorias "teto" (menor é melhor, ex. MRR Decrease / Churn) ganham a badge quando o realizado fica **abaixo ou igual** ao esperado.
- Cabeçalho de cada semana traz o intervalo de datas (ex. "S2 · 08–14/08") e a semana atual destacada.
- Seletor de mês com navegação anterior/próximo, iniciando no mês vigente.
- Filtro de categorias (multi-seleção) para não poluir a tabela; por padrão todas as categorias com meta cadastrada no mês.
- No mobile, a mesma informação vira cards por categoria com as semanas empilhadas.

## Regras de cálculo (reaproveitadas do painel tático)

- Meta da semana = meta mensal da categoria rateada por **dias úteis** da semana.
- Realizado por semana vem de `metas_snapshot_diario` (delta do MTD entre o fim da semana e o dia anterior ao início), das métricas táticas quando existirem, ou da soma das componentes em categorias agregadoras (MRR Increase / MRR Decrease).
- Categorias de estoque (MRR total, ativos pagantes, churn %) comparam o **nível** do fim da semana com a meta do mês, sem rateio.
- Semana atual é cortada no dia de hoje.

## Detalhes técnicos

- Novo componente `src/components/goals/CategoryWeeklyMatrix.tsx`, renderizado dentro de `MetabaseTracking.tsx` (aba Acompanhamento Metas).
- Reutiliza `useCategoryWeeklyData` (aceita mês de referência), `weeksOfMonth`, `businessDaysBetween`, `toBRDateKey`, `realizedBetween` de `src/components/goals/tactical/types.ts`, além de `STOCK_CATEGORY_SLUGS` / `CATEGORY_TACTICAL_METRIC` e `isBetterBelow` de `src/lib/goalCategories.ts`.
- Estado de mês local ao componente; seleção de categorias persistida em `localStorage`.
- Somente frontend: nenhuma mudança de banco, função ou lógica de ingestão.
