## Objetivo

Criar o conceito de **Meta Revisada**: quando um mês fecha (ou está projetado) abaixo da meta, o déficit é redistribuído nos meses restantes **do mesmo trimestre**, sem apagar a meta original. Superávit não abate metas futuras.

## Regra de cálculo

Para cada categoria e cada trimestre:

```text
deficit(mes)  = max(0, meta(mes) - realizado(mes))        // meses já encerrados
meses_restantes = meses do trimestre ainda não encerrados
meta_revisada(m) = meta(m) + (soma dos deficits) / n_meses_restantes
```

- Mês corrente conta como "restante" (recebe parte do déficit dos meses anteriores do tri).
- Último mês do trimestre: se ainda houver déficit e não houver mês seguinte no tri, o déficit fica exposto como "não recuperável no trimestre" (badge), não vaza para o tri seguinte.
- Categorias "menor é melhor" (churn / MRR Decrease): déficit = `max(0, realizado - meta)` e a meta revisada dos meses seguintes é **reduzida** pelo excesso, mantendo a mesma matemática invertida.
- Superávit sempre ignorado (só déficit rebalanceia).

## Acompanhamento Metas (`MetabaseTracking.tsx`)

- Novo hook/util `src/lib/revisedGoals.ts` com `computeRevisedTargets(targetByCatMonth, realizedByCatMonth, categories, refMonth)` retornando `revisedByCatMonth` + `deficitByCatQuarter`.
- KPIs: toggle **Original / Revisada** (Segmented control ao lado do toggle Mês vigente/Acumulado). Em modo Revisada, "Meta do Período" e "Saldo para Meta" usam a meta revisada, com badge `Revisada` e tooltip explicando de onde veio o acréscimo (ex.: "+R$ 3.000 diluídos de Julho").
- Gráfico: mantém `Meta` (linha/barra tracejada, cor muted) + `Realizado`, e adiciona série **`Meta revisada`** (linha sólida na cor primária). No modo barras, a meta revisada entra como linha sobreposta para não poluir.
- Tabela mensal por categoria: em cada célula, valor da meta com o delta revisado em texto pequeno abaixo (`+3.000` em amber quando há acréscimo herdado). Coluna/rodapé de trimestre mostrando déficit acumulado do tri.

## Metas Táticas

- `useTacticalData` passa a expor o consolidado mensal necessário (meta mensal derivada da meta diária × dias úteis do mês, e realizado do mês) para o time/pessoa em foco.
- Nova util `adjustedDailyTarget = max(0, (meta_mes_revisada - realizado_mes) / dias_úteis_restantes)`.
- `MissionToday`: card principal e cards secundários passam a exibir **Meta do dia** (original) e, quando diferente, **Meta ajustada** logo abaixo, com badge `Ritmo necessário` e cor amber quando maior que a original. A barra de progresso continua na meta original; um marcador (tick) indica a meta ajustada.
- `TacticalProgressChart`: adiciona série **`Meta revisada`** (acumulada com o ritmo ajustado a partir de hoje), junto das existentes `Meta` e `Realizado`, controlada por um switch "Mostrar meta revisada" (ligado por padrão).
- `TeamScoreboard`: coluna de meta mostra `realizado / meta` e, em tooltip, a meta ajustada do dia.

## Detalhes técnicos

- Sem mudança de schema: tudo derivado de `metabase_monthly_agg`, `goals`/`goal_categories`, `tactical_goals` e `daily` já carregados.
- Cálculo puro e testável em `src/lib/revisedGoals.ts` (+ teste unitário em `src/test/` cobrindo déficit no tri, categoria inversa e último mês do tri).
- Cores via tokens semânticos existentes (`--primary`, `--muted-foreground`, warning/amber do design system); nenhuma cor hardcoded.
- Estado do toggle Original/Revisada persistido em `localStorage` para não reconfigurar a cada visita.
