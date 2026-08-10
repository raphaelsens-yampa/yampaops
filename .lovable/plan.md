# Metas mensais por categoria quebradas em semanas (Metas Táticas)

Novo painel na aba **Metas Táticas** que pega as metas mensais cadastradas em "Metas por categoria × mês" e as distribui pelas semanas do mês de referência, mostrando meta da semana, realizado e atingimento.

## Como vai funcionar

- **Seleção de categorias**: um seletor múltiplo lista as categorias que possuem meta cadastrada no mês de referência. O usuário escolhe quais quer acompanhar; a escolha fica salva no navegador (padrão inicial: Total de MRR).
- **Semanas do mês**: mesmas semanas já usadas no painel "Metas semanais do mês" (segunda a domingo, truncadas nos limites do mês — nunca somam dias de outro mês).
- **Rateio da meta**: meta da semana = meta mensal da categoria × (dias úteis da semana ÷ dias úteis do mês). Semanas curtas na virada do mês recebem meta proporcionalmente menor. A soma das semanas fecha exatamente a meta do mês.
- **Realizado por semana (híbrido)**:
  - Categorias com equivalente tático (novas vendas / MRR de vendas, clientes recuperados, clientes retidos): soma dos lançamentos diários já usados nas Metas Táticas — atualiza em tempo real.
  - Demais categorias (Total de MRR, Net MRR, Churn de MRR, Churn de Logos, Churn %, Ativos Pagantes, Downsell etc.): derivado dos snapshots diários (`metas_snapshot_diario`), comparando a captura do último dia da semana com a do último dia da semana anterior. Categorias de estoque (Total de MRR, Ativos Pagantes) mostram o **nível** no fim da semana em vez de variação, com rótulo indicando isso.
  - Semana sem snapshot disponível exibe "—" (nunca 0), com aviso de que a captura do dia não existe.
- **Atingimento**: % da semana, saldo/excedente e barra de progresso. Categorias "menor é melhor" (churn, downsell) invertem a leitura: verde quando o realizado está abaixo do teto semanal.
- **Semana corrente**: destacada, com atingimento parcial calculado até a data de referência (respeita o calendário de data já existente na tela).
- **Linha de total**: soma das semanas por categoria (meta do mês, realizado acumulado, % do mês).
- **Mobile**: cards por semana em vez de tabela, no mesmo padrão dos outros painéis táticos.

## Detalhes técnicos

- Novo componente `src/components/goals/tactical/CategoryWeeklyGoalsPanel.tsx`, renderizado em `TacticalTracking.tsx` logo abaixo de `WeeklyGoalsPanel` (visões Geral, por Time e Low-touch — sem filtro por vendedor, pois as metas de categoria são da empresa).
- Novo hook `useCategoryWeeklyData.ts` que carrega:
  - `goal_categories` (ativas, exceto as categorias exclusivas da conta yampa 2.0),
  - `goals` (metas do mês de referência, usando o mesmo `goalTargetValue`: `target_mrr` → `target_deals` → `target_tpv`),
  - `metas_snapshot_diario` filtrado pelo mês de referência,
  - reaproveita `daily`/`metrics` já carregados por `useTacticalData` para o caminho tático.
- Reutiliza `weeksOfMonth`, `businessDaysBetween`, `realizedBetween` e `toBRDateKey` de `tactical/types.ts`, e `isBetterBelow` de `@/lib/goalCategories`.
- Mapa categoria → métrica tática por `slug` em um único objeto no novo hook (vendas/MRR de vendas, recuperados, retidos), com fallback automático para snapshot quando não houver mapeamento.
- Datas sempre em `America/Sao_Paulo`, via os helpers de `@/lib/dateBR` já usados no módulo.
- Nenhuma mudança de banco: apenas leitura de `goals`, `goal_categories` e `metas_snapshot_diario`.

## Fora de escopo

- Cadastrar metas semanais próprias (a meta continua sendo mensal, apenas rateada).
- Alterar a tabela "Metas por categoria × mês" na aba Acompanhamento Metas.
