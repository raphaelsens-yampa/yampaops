# Pacing e Comparativo de Churn (Metas Táticas)

Um painel novo, logo abaixo do "Pacing & Comparativo de New MRR", com os mesmos controles e o mesmo visual. Aqui, quanto menor o número, melhor.

## O que terá
- **Modos:** "Mês atual" (dia a dia até hoje) e "Comparar meses" (dois meses fechados lado a lado).
- **Métrica:** "Churn MRR" (R$ perdido) ou "Cancelamentos" (quantidade de clientes).
- **Visão:** Acumulado ou Diário.
- **Composição:** Total, Cancelamentos ou Downgrade.
- **Linhas:** mês atual, Tendência (onde o mês deve fechar no ritmo atual), mês anterior, um mês de comparação à escolha, Média 90d e Meta (meta de Churn MRR do mês dividida pelos dias úteis).
- **Legenda clicável** para esconder ou mostrar linhas. Ao abrir, todas aparecem.
- **Dois cards:** "Churn MRR previsto" e "Cancelamentos previstos". Cada um mostra o realizado até hoje, a comparação com o mesmo período do mês passado e com o mês passado fechado, o ritmo por dia útil e três cenários: Otimista (menos churn), Atual e Pessimista.
  - O cenário Otimista é o "melhor caso", ou seja, o de menor churn. Isso inverte a lógica do painel de vendas.
- Uma tabela dia a dia abaixo do gráfico, igual à do painel de New MRR.
- O filtro de Origem segue a tela.

## De onde vêm os números
- **Dias com a base oficial do Metabase:** o churn diário oficial.
- **Hoje e dias sem base oficial (como 01–11/11):** cancelamentos e downgrades da Stripe. É a mesma regra das Metas Operacionais, para que os números batam com o painel de CS.
- **Com Yampa ou 4blue selecionado,** os cancelamentos da Stripe não informam a origem do cliente. Nesses dias o gráfico mostra apenas os dias com base oficial e avisa isso abaixo do gráfico.

## Detalhes técnicos
- Generalizar os helpers de `src/lib/newMrrPacing.ts` com uma opção "quanto menor, melhor" (inverte os cenários), reaproveitando dailySeries, cumulative, projectMonth e trendLine, com testes.
- Novo hook `useChurnPacing` para ler `metas_churn_daily` (base fechada), `stripe_churn_events` e os downgrades de `stripe_conversions`, todos via `fetchAllPaged`, resolvendo cada dia como em `resolveOperationalDayRealized`.
- Novo `ChurnPacingPanel.tsx`, montado em `TacticalTracking.tsx`. A Meta vem de `useCategoryWeeklyData`, categoria `churn-mrr`.
- Registrar a regra em AGENTS.md.
