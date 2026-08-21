# Cenários de crescimento nas Metas

Adicionar um simulador de cenário no painel de Metas que eleva todas as metas na hora, sem alterar o cadastro. Hoje as metas embutem ~1% a.m. de crescimento de MRR; o seletor permitirá ver 5%, 10% ou um % livre.

## Como vai funcionar

- Um seletor **Cenário** no topo da tela de Metas, visível nas abas **Acompanhamento Metas** e **Metas Táticas**: `Cadastrado (1%)`, `5%`, `10%`, `Personalizado…`.
- É simulação local: fica salva no navegador do usuário, não muda o banco nem o que o time vê. Badge "Cenário 10%" aparece ao lado das metas recalculadas.
- Recalculo por crescimento composto:
  - Mês base = último fechamento real de Total de MRR.
  - Total de MRR do mês N = base × (1 + g)^N.
  - Net MRR alvo do mês = Total de MRR do mês − mês anterior.
  - Metas de saída (Churn de MRR, Churn %, Churn de Logos, Downsell, MRR Decrease) ficam mais rígidas na mesma proporção do aumento de exigência (ex.: cenário 5% ⇒ metas de perda reduzidas em 5%).
  - MRR Increase = Net MRR alvo + saída ajustada. A diferença sobre o cadastro é distribuída entre as categorias de entrada (New MRR, Upsell, Recuperados/Retidos, Campanha) na mesma proporção que elas têm no cadastro.
  - Metas de contagem (vendas, recuperados, oportunidades) sobem pelo mesmo fator da categoria de MRR correspondente, arredondando para cima.
- Metas diárias e semanais do painel tático (vendas/dia, recuperados, retidos, upsell, oportunidades abertas) sobem proporcionalmente ao mesmo fator.
- Convivência com o que já existe: o rebalanceamento trimestral e as metas semanais vivas (Original vs Revisada) continuam funcionando, passando a operar sobre as metas do cenário selecionado. Realizados nunca são alterados.

## Detalhes técnicos

- Novo `src/lib/goalScenario.ts`: tipo do cenário, fator por mês, classificação das categorias (estoque / entrada / saída / contagem) e função que transforma a lista de `goals` em metas do cenário; helper de fator para metas diárias.
- Novo contexto/hook `src/hooks/useGoalScenario.ts` com persistência em `localStorage`, consumido por `src/pages/Goals.tsx` e provido às duas abas.
- Componente `src/components/goals/GoalScenarioSelector.tsx` (select + input de % personalizado + badge).
- `src/components/goals/MetabaseTracking.tsx`: aplicar as metas do cenário nos KPIs, gráficos, tabela por categoria e na `CategoryWeeklyMatrix`.
- `src/components/goals/tactical/TacticalTracking.tsx`, `useCategoryWeeklyData.ts`, `CategoryWeeklyGoalsPanel.tsx`, `WeeklyGoalsPanel.tsx`, `useTacticalData.ts` (metas de `tactical_goals`): aplicar o fator nas metas antes dos cálculos de atingimento, saldo e pacing.
- `src/lib/revisedGoals.ts` recebe as metas já ajustadas pelo cenário, sem mudança de assinatura relevante.
- Nenhuma migração de banco.

## Validação

Conferir no navegador que, ao trocar de `Cadastrado` para `10%`, o Total de MRR e o Net MRR alvo sobem de forma composta, as metas de churn ficam menores, MRR Increase absorve a diferença e as metas diárias/semanais do tático sobem em conjunto — com realizados inalterados.
