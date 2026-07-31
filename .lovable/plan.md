## Objetivo

Separar "Clientes Recuperados" de "Clientes Retidos" nas Metas Táticas, com cards próprios de quantidade e MRR, declaração do tipo no momento do registro e meta diária própria para retenção.

## Como vai funcionar

1. **Novo campo no registro**: no lançamento manual (Lançar realizado) e no cadastro/importação de Clientes recuperados, o usuário escolhe **Tipo: Recuperado ou Retido**. Padrão pré-selecionado: Recuperado.
2. **Nova métrica "Clientes retidos"** no cadastro de métricas táticas, com meta diária própria por pessoa/time (igual a recuperados).
3. **Novos cards**: "Clientes retidos" e "MRR Clientes retidos", lado a lado, aparecendo dinamicamente (só com meta ou realizado), tanto na Visão Geral quanto nos painéis de time.
4. **MRR do dia** passa a somar Vendas + Recuperados + Retidos.
5. **Tabela de detalhamento**: a seção "Clientes recuperados" ganha coluna **Tipo** (badge Recuperado/Retido) e filtro por tipo; a edição permite alternar o tipo de registros existentes — o histórico atual continua como Recuperado até você revisar.
6. **Gráfico e placar**: as novas métricas ficam disponíveis no seletor do gráfico acumulado e no Placar do Time.

## Detalhes técnicos

- Migração: coluna `entry_kind text not null default 'recovered'` (valores `recovered` | `retained`) em `tactical_recoveries` e em `tactical_manual_entries`; nova linha em `tactical_metrics` com `key = 'clientes_retidos'` (source manual, ativa, global). Registros existentes ficam com o default `recovered`.
- `useTacticalData.ts`: novas métricas virtuais `VIRTUAL_MRR_RETENTION` e agregação de `clientes_retidos`; separa os `bump` por `entry_kind`; MRR do dia soma vendas + recuperados + retidos.
- `ManualEntryDialog.tsx`, `RecoveryEntryDialog.tsx` (manual + template/importação XLSX com coluna "Tipo") e `RecoveryEditDialog.tsx`: seletor de tipo.
- `TeamRecoveriesTable.tsx`: coluna Tipo, filtro por tipo, título ajustado para "Clientes recuperados e retidos".
- `MissionToday.tsx` e `TacticalOverview.tsx`: cards de Clientes retidos / MRR Clientes retidos na grade dinâmica existente.
- `TeamScoreboard.tsx` e `TacticalProgressChart.tsx`: incluir a nova métrica nas opções.
- Nada muda nas conversões do Stripe; reativações automáticas continuam contando como Recuperado.