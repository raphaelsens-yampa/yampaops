# Gráfico Meta x Realizado por dia — Metas Operacionais

## O que muda na tela
Novo quadro entre o painel principal (New MRR / Churn MRR) e o Relatório do mês, seguindo a aba escolhida (Sales ou CS), o mês e o filtro de Origem.

- **Eixo X:** dias do mês (1 a 31).
- **Barras:** realizado de cada dia (Sales = New MRR; CS = Churn MRR).
- **Linha:** meta do dia (zero em fins de semana/feriados, como hoje no painel).
- **Alternância "Diário / Acumulado":** no acumulado, linhas de meta acumulada e realizado acumulado até hoje.
- **Sales:** botão para alternar entre MRR e Quantidade de vendas (meta x realizado de vendas).
- Cor do realizado indica se bateu a meta do dia (no CS, bater = ficar abaixo da meta de churn).
- Dica ao passar o mouse: meta, realizado, diferença e % da meta do dia.
- Dias futuros aparecem só com a meta.
- Não aparece no link da TV.

## Fonte dos números (a mesma do quadro de cima)
- Dias fechados: base oficial do Metabase.
- Hoje e dias após a última base: pagamentos confirmados da Stripe (mesma regra já usada).
- CS com Origem Yampa/4blue: dias sem base fechada ficam vazios (limitação já existente).
- Assim, a soma das barras bate com o Realizado do mês mostrado acima.

## Detalhes técnicos
- Novo helper puro `src/lib/operationalDailyChart.ts` que monta a série diária (meta, realizado, acumulados) a partir de `series`/`buildOperationalPeriodModel`, `stripeOpenDays`, `salesGoals` e `salesCountByDay` já carregados em `OperationalGoals.tsx`; teste em `src/test/operationalDailyChart.test.ts` (soma do realizado = realizado do mês; meta zero em dias não úteis).
- Novo componente `src/components/goals/OperationalDailyChart.tsx` (Recharts ComposedChart, tokens de cor do tema), renderizado em `OperationalGoals.tsx` antes de `OperationalMonthReport`, oculto quando `tvArea`.
- Sem mudanças no banco.
