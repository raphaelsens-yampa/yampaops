# Filtro de Origem (4blue / Yampa) que funciona de verdade — realizado + metas

## Por que hoje não funciona

O filtro atual não lê origem de uma base canônica: ele calcula uma **participação estimada** a partir de `metas_price_daily` e aplica esse percentual sobre o realizado geral. Verificado na base: nessa tabela a coluna de origem só foi preenchida entre **07/08 e 19/08/2026** — antes e depois disso está 100% nula. Ou seja, na maior parte dos dias o recorte cai numa estimativa antiga ou some. Além disso as metas nunca respeitaram o filtro.

## O que realmente pode ser filtrado por origem (verificado)

Base cliente-a-cliente `metas_ativos_pagantes_daily` — origem preenchida desde **31/01/2026**, com MRR por empresa e `classificacao_company`:

| Métrica | Fonte por origem | Cobertura |
| --- | --- | --- |
| Total de MRR | soma de `mrr` por origem | desde 31/01/2026 |
| Ativos Pagantes | contagem de empresas por origem | desde 31/01/2026 |
| New MRR / Novos Pagantes | `classificacao_company = novo pagante` | desde 31/01/2026 |
| Recuperados | `classificacao_company = recuperado` | desde 31/01/2026 |
| Upsell | `classificacao_company = upsell` | desde 31/01/2026 |
| Downsell | `classificacao_company = downsell` | desde 31/01/2026 |
| Churn % / Qtd / MRR | `metas_origem_daily` (métricas `churn_*`) | desde 30/06/2026 |
| Net MRR | derivado (increase − decrease por origem) | conforme componentes |
| MRR Increase / Decrease | soma das categorias por origem | conforme componentes |
| Retenção (pré-churn), Trials, Low-touch | **sem origem na base** | mostra “—” |

Sanidade: no snapshot mais recente, 4blue tem New MRR de **R$ 4.615** (71 clientes) e Yampa **R$ 13.112** — coerente com a casa dos R$ 5.000 que você citou.

Observação: a base grava origem como `4blue` e `4Blue`. A comparação será sempre case-insensitive, para não perder linhas.

## Metas por origem (cadastro próprio)

- As metas ganham um campo **Origem**: `Geral` (padrão, comportamento atual), `4blue` e `Yampa`.
- No cadastro de metas (Configurações) é possível registrar a meta de cada categoria para cada origem.
- No Acompanhamento Metas, ao selecionar 4blue ou Yampa, a tela usa a meta cadastrada para aquela origem. Se não houver meta cadastrada para a origem, a linha mostra a meta como “—” com aviso “meta não cadastrada para esta origem” (nunca reaproveita a meta total, para não gerar % de atingimento enganoso).
- Meta Revisada, cenários de crescimento e metas semanais passam a operar sobre o conjunto de metas da origem selecionada.

## Comportamento na tela

- Seletor **Origem** permanece onde está (Visão Geral / 4blue / Yampa).
- Com recorte ativo: realizado, gráfico, tabela mensal e matriz semanal por categoria usam os valores reais da origem — 4blue + Yampa passa a somar a Visão Geral por construção, sem estimativa.
- Categorias sem origem na base ficam com “—” e o aviso curto correspondente.
- Datas anteriores a 31/01/2026 (ou 30/06/2026 no caso de churn) exibem “—” com o aviso do limite de cobertura.

## Detalhes técnicos

- Migração: adicionar `origem_cliente text null` em `goals` (null = meta geral) e índice por (`category_id`, `period_start`, `origem_cliente`); manter as políticas RLS/GRANTs atuais.
- Reescrever `src/lib/origins.ts`: remover a lógica de participação (`buildOriginShares` / `originShareAsOf`) e expor um agregador real por origem, com o mapa `classificacao_company` → categoria e as datas mínimas de cobertura por métrica.
- Novo hook `src/components/goals/useOriginRealized.ts`: consulta paginada (`fetchAllPaged`) de `metas_ativos_pagantes_daily` no snapshot as-of da data escolhida (reaproveitando `resolveSnapshotAsOf`) e de `metas_origem_daily` para churn; devolve realizado por categoria e origem.
- `MetabaseTracking.tsx`: substituir o cálculo de `scopedAgg` por origem pelo hook; filtrar `goals` por `origem_cliente` conforme o seletor; propagar a origem para `computeRevisedTargets`, `applyScenarioToGoals`, `CategoryWeeklyMatrix` e o gráfico.
- Cadastro de metas (`GoalsTracking.tsx` / `TacticalGoalsManager.tsx` conforme a tela usada hoje): campo Origem no formulário e coluna Origem na listagem.
- Testes unitários para o agregador por origem (soma 4blue + Yampa = total do snapshot) e para a seleção de metas por origem.
