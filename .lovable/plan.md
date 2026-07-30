# Visão Geral nas Metas Táticas

Nova opção **"Visão Geral"** no seletor de time, que consolida metas e realizados de todos os times (Sales, CS, Suporte) em uma única tela.

## Comportamento

Ao selecionar "Visão Geral" (primeira opção do seletor de time, apenas para admin/tático):

- **Seletor de colaborador** desabilitado/oculto — a visão é agregada, não individual.
- **Painel principal** troca "Sua missão hoje" por um resumo consolidado da empresa:
  - Cards por métrica com **Realizado hoje (soma de todos os membros)** vs **Meta diária somada** (meta resolvida por pessoa → time → global, somada membro a membro), % de atingimento e falta.
  - Cards secundários com MRR do dia e Vendas do dia consolidados.
  - Linha de resumo: "X de Y metas do dia batidas" no nível empresa.
- **Placar**: passa a exibir ranking por **time** (total do time hoje / meta somada do time) com opção de expandir para ranking individual completo; seletor de métrica continua disponível e usa todas as métricas ativas.
- **Heatmap de consistência**: inclui todos os membros de todos os times.
- **Tabelas de Clientes Convertidos e Clientes Recuperados**: passam a listar todos os times (sem filtro de membros), com coluna/label indicando o time do responsável quando aplicável.
- **Configurar metas diárias** continua acessível e inalterado.

## Detalhes técnicos

- `TacticalTracking.tsx`: sentinela `ALL_TEAMS = "__all__"` no estado `teamId`; item `<SelectItem value="__all__">Visão Geral</SelectItem>` no topo do select. Quando ativo: `memberIds` = união de todos os `members.user_id` (dedup), `teamMetrics` = todas as métricas ativas (`metricsForTeam(metrics, null)`), `activeTeam = null`, e renderiza `<TacticalOverview>` em vez de `<MissionToday>`. Default de abertura permanece o time do usuário.
- Novo `src/components/goals/tactical/TacticalOverview.tsx`: recebe `metrics`, `goals`, `daily`, `memberIds`, `profiles`, `teams`, `members`, `today`; agrega `daily` do dia por métrica e soma `resolveDailyTarget(goals, metric, uid, teamIdDoMembro)` por membro. Reaproveita `formatMetric` e o anel de progresso (extraído para uso compartilhado ou replicado localmente).
- `TeamScoreboard.tsx`: novo prop opcional `groupByTeam` + `teams`/`members`; quando ligado, agrupa linhas por time em vez de por pessoa. Default de métrica na visão geral: `vendas_dia`.
- `TeamConversionsTable.tsx` / `TeamRecoveriesTable.tsx`: já ignoram o filtro quando `memberIds` está vazio; passar a união de membros e ajustar o rótulo do cabeçalho para "Visão Geral".
- `ActivityHeatmap.tsx`: recebe a união de `memberIds` e `teamId = null` (metas caem para a resolução global/por time de cada membro).
- Sem mudanças de banco de dados, RLS ou Edge Functions.
