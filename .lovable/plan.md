# Corte semanal domingo–sábado nas Metas

## Situação atual (verificada no código)

O corte de semana hoje é **segunda a domingo** em três lugares:

- `weeksOfMonth` (semanas do mês) fecha a semana no **domingo** — usada pelos painéis Metas Semanais, Metas por categoria x semana, Matriz Categoria x Semana e o gráfico acumulado tático.
- `startOfWeek`/`endOfWeek` na aba Acompanhamento Metas usam **segunda como início**.
- O seletor "Semanal" do navegador de período usa `weekStartsOn: 1` (segunda).

Com isso, o relatório gerado no sábado enxerga uma semana ainda aberta (falta o domingo), em vez da semana fechada até sexta.

## O que muda

Passar todo o recorte semanal da seção Metas para **domingo (início) → sábado (fim)**:

1. Semanas do mês (`weeksOfMonth`): a semana começa no domingo e termina no sábado, seguindo truncada nos limites do mês (nenhuma semana mistura dias de outro mês). Os rótulos de faixa (ex. `16–22/08`) passam a refletir o novo corte.
2. Aba **Acompanhamento Metas** (período "Semana"): janela passa a ser domingo→sábado.
3. Navegador de período (visão "Semanal" em Acompanhamento): domingo→sábado.
4. Rateio por **dias úteis** continua contando segunda a sexta dentro da nova janela — assim a semana fechada no sábado já contempla exatamente os dias úteis até sexta.
5. Rótulos de dia da semana em painéis táticos (placar por dia, heatmap, gráfico acumulado) reordenados para iniciar em **Dom** e terminar em **Sáb**, alinhados ao novo corte.

Efeito prático: rodando o relatório no sábado, a semana corrente já está completa em dias úteis (dom→sáb, últimos lançamentos na sexta), e os comparativos Meta x Realizado por semana fecham com esse recorte.

## Observações

- Nenhuma mudança em banco de dados: as metas continuam mensais e o rateio semanal é calculado na leitura. Não há reprocessamento de dados nem perda de histórico.
- As metas semanais "vivas" (rebalanceamento entre semanas) continuam funcionando; apenas a definição de fronteira de semana muda, o que pode alterar levemente os valores por semana já exibidos no mês corrente.

## Detalhes técnicos

- `src/components/goals/tactical/types.ts`: `weeksOfMonth` — trocar o cálculo de fim de semana (`daysToSunday`) por fim no sábado (`(6 - getDay() + 7) % 7`).
- `src/components/goals/MetabaseTracking.tsx`: `startOfWeek`/`endOfWeek` — usar `getDay()` direto (domingo = 0) em vez de `(getDay()+6)%7`.
- `src/components/goals/PeriodNavigator.tsx`: `weekStartsOn: 1` → `0` (nas 3 chamadas).
- `src/components/goals/tactical/TeamScoreboard.tsx` e `TacticalProgressChart.tsx`: ajustar índice de dia da semana (`(getDay()+6)%7` → `getDay()`) e a ordem dos rótulos.
- Consumidores de `weeksOfMonth` (`WeeklyGoalsPanel`, `CategoryWeeklyGoalsPanel`, `CategoryWeeklyMatrix`, `TacticalProgressChart`) herdam o novo corte sem alteração própria.
