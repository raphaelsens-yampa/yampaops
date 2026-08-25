# Filtro de Origem (4blue / Yampa): diagnóstico completo e correções

## Como a regra está implementada hoje

**Fonte única de origem:** apenas `metas_price_daily` tem a coluna `origem_cliente` ("yampa" / "4Blue"), a partir de 07/08/2026 e só para as classificações `novos_pagantes`, `upsell`, `downsell`, `recuperados`. Nenhuma outra base usada nos painéis (`metas_snapshot_diario`, `metabase_monthly_agg`, `metas_daily`, `metas_novos_pagantes_daily`, `stripe_conversions`, `tactical_recoveries`, `tactical_manual_entries`) carrega origem.

**Mecanismo:** `src/lib/origins.ts` não usa `metas_price_daily` como realizado (a ordem de grandeza é outra). Ele calcula uma **participação** (share = origem / total) por dia e classificação e essa participação é multiplicada sobre o realizado canônico. Isso garante que 4blue + Yampa = Visão Geral. Antes de 07/08/2026 usa-se a participação mais antiga conhecida como estimativa; sem histórico da classificação, cai no share agregado do dia.

**Acompanhamento Metas (`MetabaseTracking.tsx`):** o estado de origem é local da aba; o share é aplicado em um único ponto (`sourceAgg`), então KPIs, gráfico, tabela pivot e Meta Revisada herdam o recorte. Categorias sem classificação (Total de MRR, Ativos Pagantes, Churn, Net MRR) são marcadas como indisponíveis e exibem "—".

**Metas Táticas (`TacticalTracking.tsx`):** estado local próprio, propagado para `useTacticalData` e `CategoryWeeklyGoalsPanel`. Painéis que consomem `daily`/`goals` (Missão do Dia, Overview, Scoreboard, Weekly, gráfico acumulado, heatmap) herdam o recorte. `useTacticalRealized` resolve o realizado canônico sem conhecer origem; o rateio acontece depois em `useTacticalData`.

## Onde a regra falha (verificado no código)

1. **`CategoryWeeklyMatrix` ignora o filtro.** É renderizada em `MetabaseTracking.tsx:1747` sem prop de origem e chama `useCategoryWeeklyData(refMonth)` com `origin` no default `"all"`. A matriz semanal por categoria mostra sempre Visão Geral, mesmo com 4blue/Yampa selecionado.
2. **Tabelas táticas de detalhe não recortam.** `TeamConversionsTable`, `TeamRecoveriesTable` e `RecoveryChannelPanel` (via `useRecoveryChannelData`) consultam `stripe_conversions` / `tactical_recoveries` / `tactical_manual_entries` direto, sem origem. Resultado: os cards do topo mudam com o filtro, as tabelas abaixo não — e os totais não conferem com os cards.
3. **Low-touch entra sem rateio em painéis que têm recorte.** `useLowTouchData` não conhece origem, e o valor de `lowTouchSales` é injetado em `TacticalOverview`, `TeamScoreboard` e `WeeklyGoalsPanel`. Com filtro ativo, esses painéis somam um bloco não recortado.
4. **Heurística "Stripe/manual = Yampa" está embutida sem sinalização.** Em `useTacticalData`, o dia vigente (Stripe), overrides e lançamentos manuais de CS são tratados como Yampa por definição. Isso é uma suposição de negócio: no filtro 4blue esses valores desaparecem, e no filtro Yampa podem estar inflados. Hoje isso não é comunicado na UI.
5. **`UnattributedSalesAlert` e `StripeBackupPanel`** (este último dentro de `TacticalSettingsPanel`) operam sempre no total. Para o painel de backup isso é correto por desenho, para o alerta de vendas sem atribuição gera ruído quando o filtro está ativo.
6. **Filtro não é compartilhado entre abas nem persistido.** Cada aba tem seu próprio estado, sempre iniciando em Visão Geral; ao alternar abas o recorte se perde.
7. **Estoque sem quebra continua sem quebra.** Total de MRR, Ativos Pagantes e Churn só existem em Visão Geral porque `metas_snapshot_diario` / `metabase_monthly_agg` / `metas_ativos_pagantes_daily` não gravam `origem_cliente`. Isso é limitação de ingestão, não de UI.

## Correções propostas

**Fase 1 — coerência da UI (frontend, sem banco)**
- Passar `origin` (e o mês) para `CategoryWeeklyMatrix` a partir de `MetabaseTracking`, com badge de origem e aviso nas linhas sem recorte, igual ao painel semanal do tático.
- Propagar `origin` para `TeamConversionsTable`, `TeamRecoveriesTable` e `useRecoveryChannelData`: aplicar o rateio por participação nos totais dessas tabelas e, quando o detalhe por linha não puder ser atribuído a uma origem, manter as linhas visíveis com um rodapé explicando que o total exibido é rateado.
- Aplicar o mesmo share ao `lowTouchSales` antes de injetá-lo em Overview / Scoreboard / Weekly, e zerá-lo quando o filtro for 4blue (as vendas low-touch vêm de Stripe/Yampa).
- Ocultar/atenuar `UnattributedSalesAlert` quando um recorte estiver ativo.

**Fase 2 — transparência da regra**
- Centralizar as mensagens de aviso em `src/lib/origins.ts` e exibir, sempre que o filtro estiver ativo, um único bloco explicativo: "recorte estimado por participação da base de preços; Stripe do dia e lançamentos manuais são considerados Yampa; métricas de estoque só em Visão Geral".
- Marcar visualmente (ícone/tooltip por card) quais números são exatos, quais são rateados por estimativa e quais estão indisponíveis, em vez de só um aviso geral no topo.

**Fase 3 — filtro único**
- Elevar o estado de origem para a página de Metas (`src/pages/Goals.tsx`) e compartilhá-lo entre as duas abas, com persistência em `localStorage`, mantendo um seletor visível em cada aba.

**Fase 4 — origem real na base (opcional, backend)**
- Passar a gravar `origem_cliente` em `metas_snapshot_diario` / `metas_ativos_pagantes_daily` na ingestão, e marcar `stripe_conversions` com a origem no momento da conversão. Só com isso as métricas de estoque (Total de MRR, Ativos, Churn) e as tabelas de detalhe deixam de depender de rateio estimado.

## Detalhes técnicos

- Arquivos da Fase 1: `src/components/goals/MetabaseTracking.tsx`, `src/components/goals/CategoryWeeklyMatrix.tsx`, `src/components/goals/tactical/TacticalTracking.tsx`, `TeamConversionsTable.tsx`, `TeamRecoveriesTable.tsx`, `useRecoveryChannelData.ts`, `useLowTouchData.ts`, `UnattributedSalesAlert.tsx`.
- O rateio reutiliza `buildOriginShares` / `originShareAsOf` de `src/lib/origins.ts`; nenhum novo cálculo de participação será criado.
- Fases 1 a 3 são somente frontend. A Fase 4 exige migração e alteração das Edge Functions de ingestão, e fica para uma etapa separada.
