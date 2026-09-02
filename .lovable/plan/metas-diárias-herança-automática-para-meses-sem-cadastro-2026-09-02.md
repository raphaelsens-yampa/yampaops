# Metas diárias: herança automática para meses sem cadastro

Hoje, se um mês não tem meta diária cadastrada, a meta some (vira 0) — e, por outro lado, a resolução atual ignora o período cadastrado, o que pode fazer uma meta antiga "vazar" para outro mês de forma imprevisível. A mudança torna esse comportamento explícito e previsível: **vale a meta vigente do período; se não houver, herda a última meta cadastrada antes daquele mês.**

## Como fica

- Em qualquer visão do módulo Metas Táticas (Missão do Dia, metas semanais, gráfico meta x realizado), quando o mês de referência não tem meta cadastrada para o escopo, o sistema usa automaticamente a última meta anterior daquele mesmo escopo (pessoa → time → equipe toda).
- Metas herdadas aparecem sinalizadas: um selo discreto "herdada" junto ao valor da meta, com tooltip do tipo "Herdada do período 01/08 – 31/08 (sem cadastro para setembro)".
- Na tela de Configurações → Metas diárias, cada linha mostra se está vigente, futura ou encerrada, e um aviso no topo indicando quais métricas/escopos estão rodando com meta herdada no mês atual, com atalho para cadastrar o período novo.
- Cadastrar uma meta para o mês encerra automaticamente a herança daquele escopo (a meta vigente sempre tem prioridade sobre a herdada).

## Regras

1. Meta vigente = a que cobre a data de referência (`period_start <= data <= period_end`); havendo mais de uma, vence a de criação mais recente.
2. Sem meta vigente → herda a meta de maior `period_end` anterior à data de referência, no mesmo escopo.
3. Precedência de escopo continua: pessoa → time → equipe toda. A herança é avaliada por escopo, ou seja, uma meta de pessoa encerrada e herdada ainda vence a meta global vigente do time? Não: a resolução testa primeiro pessoa vigente, depois time vigente, depois global vigente; só se nenhuma for vigente é que aplica a herança, novamente na ordem pessoa → time → global.
4. Não existe meta anterior → meta 0 (comportamento atual).
5. Nada de gravação automática no banco: a herança é calculada na leitura, sem criar registros novos.

## Detalhes técnicos

- `src/components/goals/tactical/types.ts`: `resolveDailyTarget` passa a receber a data de referência e retornar `{ value, source: "current" | "inherited", goal }`; adiciona helper `resolveDailyTargetInfo` e mantém uma assinatura compatível para os chamadores que só precisam do número.
- `src/components/goals/tactical/useTacticalData.ts`: a consulta de `tactical_goals` deixa de filtrar apenas por interseção da janela e passa a trazer também as metas anteriores do escopo (busca com `period_end < fromDate` limitada por métrica/escopo, via consulta paginada com `fetchAllPaged`), para que a herança tenha material.
- Consumidores a ajustar para exibir o selo: `TacticalTracking.tsx`, `WeeklyGoalsPanel.tsx`, `TacticalProgressChart.tsx`, `TacticalOverview.tsx` (onde houver leitura de meta diária).
- `TacticalGoalsManager.tsx`: coluna de status (vigente/futura/encerrada) e aviso de metas herdadas no mês atual.
- Testes em `src/test/` cobrindo: meta vigente vence herdada, herança pega o `period_end` mais recente, precedência de escopo e ausência total de meta = 0.
- Sem mudanças de banco.
