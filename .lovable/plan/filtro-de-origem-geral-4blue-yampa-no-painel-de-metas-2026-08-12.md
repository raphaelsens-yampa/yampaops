# Filtro de origem (Geral / 4blue / Yampa) no painel de Metas

Adicionar um seletor de origem nas abas **Acompanhamento Metas** e **Metas Táticas**, permitindo enxergar os resultados separados entre 4blue e Yampa, com base na marcação `origem_cliente` que já vem do Metabase.

## O que existe hoje (verificado na base)

- `metas_price_daily` é a única base com origem preenchida: `origem_cliente` = `yampa` ou `4Blue`, disponível a partir de **07/08/2026**, com valores acumulados no mês (`qtd_mtd`, `mrr_mtd`) por `stripe_price_id` e `classificacao` (novos_pagantes, upsell, downsell, recuperados), em snapshots `parcial` e `fechamento`.
- `metas_snapshot_diario` e `metabase_monthly_agg` possuem a coluna `origem_cliente`, mas ela está **100% nula** — ou seja, Total de MRR, Ativos Pagantes e Churn ainda não têm quebra por origem.
- `metas_daily` (histórico usado no tático) não tem coluna de origem.
- Trials ficam fora deste escopo, conforme definido.

## Comportamento do filtro

- Seletor com três opções: **Visão Geral** (padrão), **4blue**, **Yampa**.
- Um seletor por aba, independentes entre si, sempre iniciando em Visão Geral.
- Em **Visão Geral** nada muda em relação ao comportamento atual.
- Com 4blue ou Yampa selecionado:
  - Métricas que têm recorte na base (Novos Pagantes/New MRR, Upsell, Downsell, Recuperados) passam a ler de `metas_price_daily`, somando `mrr_mtd`/`qtd_mtd` da origem escolhida.
  - Métricas sem recorte (Total de MRR, Ativos Pagantes, Churn %, Churn Qtd, Churn MRR, Net MRR e agregadoras que dependem delas) exibem `—` com um aviso curto: "sem recorte por origem na base".
  - Datas anteriores a 07/08/2026 exibem `—` com o aviso "origem disponível a partir de 07/08/2026", já que a base não marca origem nesse período.
- As **metas** (targets) continuam sendo as metas totais cadastradas; ao aplicar um recorte de origem, a coluna de meta é exibida com indicação de que não é rateada por origem, evitando comparação enganosa de % de atingimento.

## Aba Acompanhamento Metas

- Novo `Select` "Origem" na mesma linha dos filtros existentes (Produto / Incluir 2.0 / categoria).
- Quando o recorte está ativo, o realizado das categorias suportadas vem de `metas_price_daily` respeitando a data de referência ("as-of") já usada hoje: pega o último snapshot `<=` data escolhida dentro do mês.
- O gráfico e a tabela seguem o mesmo recorte; linhas sem recorte ficam vazias e recebem o aviso.

## Aba Metas Táticas

- Novo `Select` "Origem" na barra de filtros (ao lado de Time / Colaborador / data / Revisada).
- Com recorte ativo, os realizados de MRR do dia, Vendas do dia, Upsell e Recuperados FT passam a vir de `metas_price_daily` (delta entre o MTD do dia e o MTD do dia anterior), no lugar do Stripe ao vivo / `metas_daily`, porque essas duas fontes não carregam origem.
- Métricas manuais de CS (Recuperados / Retidos) e a visão Low-touch não têm origem na base: ficam visíveis apenas em Visão Geral, com aviso quando um recorte estiver ativo.
- Painel de Backup do Stripe, lançamento manual e configuração de metas continuam operando sempre sobre o total (independentes do recorte), para não criar dados parciais.

## Detalhes técnicos

- Novo hook `src/components/goals/tactical/useOriginRealized.ts` (nome sugerido) que consulta `metas_price_daily` por intervalo de datas e devolve, por dia e por `classificacao`, os totais MTD e os deltas diários, filtrados por `origem_cliente` (comparação case-insensitive: `4blue` / `yampa`).
- Constante compartilhada em `src/lib/goalCategories.ts` (ou novo `src/lib/origins.ts`) com o tipo `OriginFilter = "all" | "4blue" | "yampa"`, o rótulo de cada opção, a data mínima de cobertura (`2026-08-07`) e o mapa `classificacao` → categoria/métrica tática.
- `MetabaseTracking.tsx`: novo estado de origem; no cálculo de `scopedAgg`/realizado, quando origem ≠ `all`, substituir o valor das categorias suportadas pelo resultado do novo hook e marcar as demais como indisponíveis.
- `useTacticalData.ts` / `useTacticalRealized.ts`: aceitar o parâmetro de origem e, quando ativo, resolver os realizados automáticos pelo novo hook em vez de Stripe ao vivo / `metas_daily`.
- `TacticalTracking.tsx`: adicionar o seletor e propagar a origem para os componentes de visão (Missão do Dia, Overview, Scoreboard, gráficos, painéis semanais).
- Nenhuma migração de banco é necessária. Se no futuro a ingestão passar a preencher `origem_cliente` em `metas_snapshot_diario` e `metabase_monthly_agg`, o recorte das métricas de estoque (Total de MRR, Ativos, Churn) passa a ser habilitado sem mudança de UI.
