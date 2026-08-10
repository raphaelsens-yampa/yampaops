# Filtro de Origem (Geral / yampa / 4blue) nas Metas

## O que existe hoje

A base diária importada do Metabase já tem a origem: a tabela `metas_price_daily` traz, por dia e por price_id, o campo `origem_cliente` com os valores `yampa` e `4Blue`, junto de `classificacao` (`novos_pagantes`, `recuperados`, `upsell`, `downsell`) e os acumulados do mês (`qtd_mtd`, `mrr_mtd`). Essa quebra por origem começa em 07/08/2026 — dias anteriores estão com origem vazia.

O que ainda **não** existe:
- Churn por origem (a base de preços só tem downsell; churn vem dos snapshots consolidados, sem origem).
- Origem nos snapshots consolidados (`metas_snapshot_diario`: Total de MRR, Ativos Pagantes, Churn %, Net MRR).
- Origem nas conversões do Stripe e nos lançamentos manuais do painel tático.

## Como o filtro vai funcionar

Um seletor "Origem" com três opções, aplicado tanto em **Metas Táticas** quanto em **Acompanhamento Metas**:

- **Geral**: comportamento atual (yampa + 4blue somados).
- **yampa**: realizado apenas de clientes de origem yampa — é a visão "pura", que casa com as metas cadastradas.
- **4blue**: realizado apenas da origem 4blue, sem meta (as metas continuam sendo só yampa puro).

Regra de meta: as metas cadastradas passam a ser lidas como metas yampa puras. Em "yampa" aparece meta e realizado normalmente; em "4blue" a coluna de meta mostra "—" (só apuração); em "Geral" mostramos a meta yampa com um aviso de que o realizado inclui 4blue.

Quando a métrica não tiver quebra por origem disponível no período (ex.: churn, Total de MRR, Ativos Pagantes, ou dias anteriores a 07/08), a célula mostra "—" com tooltip "sem quebra por origem neste período" em vez de repetir o número consolidado.

## Onde aparece

1. **Metas Táticas** (barra de filtros, ao lado de Time/Data):
   - Cards do dia (MRR do dia, Vendas do dia, Recuperados, Retidos, Upsell, Recuperados FT).
   - Placar por time, gráfico acumulado e Metas semanais do mês.
   - Painel "Metas por categoria — quebra semanal" (New MRR FT, Recuperados FT, Upsell, Downsell, MRR Increase/Decrease).
   - Tabelas de Clientes Convertidos / Recuperados passam a respeitar a origem.
2. **Acompanhamento Metas**: mesmo seletor, aplicado às categorias de fluxo (New MRR FT, Recuperados FT, Upsell, Downsell, MRR Increase/Decrease). Categorias de estoque (Total de MRR, Ativos Pagantes, Churn %, Net MRR) só respondem ao filtro depois que a captura diária passar a enviar esses valores com origem.

## Detalhes técnicos

- **Migração**: adicionar `origem_cliente text` (nulo = consolidado) em `metas_snapshot_diario` e em `metabase_daily_raw`/`metabase_monthly_agg`, com índice por (data/mês, metric_key, origem). Isso abre o caminho para a captura diária mandar churn e estoques separados por origem sem nova mudança de tela. A função `refresh_metabase_monthly_agg` passa a agrupar por origem.
- **Normalização**: `4Blue`/`4blue` tratados como a mesma origem (comparação case-insensitive), assim como `yampa`.
- **Realizado por origem (fluxos)**: novo hook `useOriginRealized` lê `metas_price_daily` no período, converte os acumulados MTD em variação diária por (data, origem, classificacao) e mapeia `classificacao` → slug de categoria (`novos_pagantes`→`new_mrr`, `recuperados`→`recuperados`, `upsell`→`upsell`, `downsell`→`downsell`). Agregadoras (`mrr_increase`/`mrr_decrease`) somam as componentes.
- **Conversões táticas**: `metas_price_daily` fornece o par `stripe_price_id` → `origem_cliente`; esse mapa classifica as linhas de `stripe_conversions` usadas em `useTacticalData`, `TeamConversionsTable` e `LowTouchConversionsTable`. Price_id sem mapa fica como "sem origem" e é excluído dos recortes yampa/4blue (aparece só em Geral), com contador visível para não esconder venda.
- **Lançamentos manuais** (`tactical_manual_entries`, `tactical_recoveries`): recebem coluna `origem_cliente` com default `yampa`, e o seletor de origem aparece nos diálogos de lançamento/edição e importação.
- **Metas**: nenhuma mudança de cadastro; `tactical_goals` e `goals` continuam representando yampa puro. A camada de cálculo apenas oculta a meta no recorte 4blue.
- Componentes tocados: `TacticalTracking.tsx` (estado do filtro), `useTacticalData.ts`, `MissionToday.tsx`, `TeamScoreboard.tsx`, `TacticalProgressChart.tsx`, `WeeklyGoalsPanel.tsx`, `CategoryWeeklyGoalsPanel.tsx`, `useCategoryWeeklyData.ts`, `TeamConversionsTable.tsx`, `TeamRecoveriesTable.tsx`, `MetabaseTracking.tsx`, mais o novo hook de origem.

## Fora do escopo

- Reclassificar retroativamente os dias anteriores a 07/08 (a base não tem origem lá).
- Criar metas específicas para 4blue.
