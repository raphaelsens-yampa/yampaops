# Metas semanais dentro do mês (Metas Táticas)

Nova visão que quebra o mês vigente em semanas (segunda a domingo, truncadas nos limites do mês) para acompanhar meta x realizado semana a semana, sem nunca somar dias de outro mês.

## Como fica na tela

Um novo card **"Metas semanais do mês"**, posicionado logo abaixo dos cards de missão/placar e acima do gráfico de evolução, com:

- Seletor de métrica (mesma lista já usada no gráfico de evolução).
- Uma linha por semana do mês da data de referência:

```text
Semana        Período        Dias úteis   Meta     Realizado   %      Saldo
S1            01–02/08            1        3          2       67%      -1
S2            03–09/08            5       15         14       93%      -1
S3 (atual)    10–16/08            5       15          6       40%      -9
S4            17–23/08            5       15          —        —        —
S5            24–31/08            6       18          —        —        —
Total                            22       66         22       33%     -44
```

- Semana atual destacada; semanas futuras mostram "—" no realizado.
- Barra de progresso por semana e cor no saldo (verde quando bate a meta, vermelho quando falta) — quando o saldo for positivo o rótulo vira "excedente", sem sinal de menos, seguindo o padrão já usado no painel de metas.
- No mobile, cada semana virá como card empilhado em vez de tabela, seguindo o padrão mobile já aplicado no módulo.

No gráfico **"Evolução meta x realizado"** o seletor de granularidade ganha a opção **"Semanas do mês"**: passa a plotar as semanas do mês da data de referência (acumulado dentro do mês), em vez do intervalo de 30/60/90 dias.

## Regras de cálculo

- Semana = segunda a domingo, cortada pelo primeiro e último dia do mês (S1 pode ter 1 dia, a última também).
- Meta da semana = meta diária resolvida (pessoa → time → global, somada pelos membros do escopo) × dias úteis (seg–sex) daquela semana.
- Realizado da semana = soma dos lançamentos diários já agregados (`daily`) dentro do intervalo da semana.
- A linha Total fecha exatamente com a meta mensal atual do painel (meta diária × dias úteis do mês).
- Mês de referência = mês da data de referência já existente no topo da aba; trocar a data troca o mês exibido.

## Escopo de visões

Vale para Visão Geral, cada time e Low-touch. No Low-touch, onde não há meta diária cadastrada, a coluna Meta aparece como "—" e a tabela mostra apenas realizado por semana.

## Detalhes técnicos

- Novos helpers em `src/components/goals/tactical/types.ts`: `weeksOfMonth(ref)` retornando `{ index, start, end, businessDays }` com corte no mês, e `weeklyTargetFor(...)` reaproveitando `resolveDailyTarget` + `businessDaysBetween`.
- Novo componente `src/components/goals/tactical/WeeklyGoalsPanel.tsx` (props: `metrics`, `goals`, `daily`, `memberIds`, `teamId`, `today`), renderizado em `TacticalTracking.tsx` para times/Visão Geral e no ramo Low-touch (versão só-realizado alimentada por `lowTouch.sales`).
- `TacticalProgressChart.tsx`: adicionar `"monthWeeks"` ao tipo `Granularity` e ao seletor, derivando os pontos de `weeksOfMonth(today)` em vez do preset de dias.
- Sem mudanças de banco: usa `tactical_goals` e a agregação `daily` do `useTacticalData`.
