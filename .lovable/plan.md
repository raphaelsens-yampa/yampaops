
# Metas Táticas e Operacionais

Nova aba na tela de **Metas** para acompanhar rotina diária da equipe — atividades, vendas do dia e metas customizadas por vendedor, com dashboard individual + leaderboard + heatmap.

## Escopo funcional

**Métricas rastreadas por dia por vendedor:**
- Atividades (de `activities`): mensagens enviadas, respostas recebidas, calls, reuniões, WhatsApp, propostas
- MRR do dia (de `stripe_conversions`): soma de `mrr_net` das conversões atribuídas ao vendedor
- Vendas do dia: contagem de conversões
- Métricas customizadas (definidas por admin): ex. "follow-ups", "diagnósticos enviados" — input manual do vendedor

**Cadastro de metas diárias (híbrido):**
- Deriva automaticamente da meta mensal cadastrada em `goals` (target ÷ dias úteis do mês)
- Override manual por vendedor / por métrica em nova tabela `tactical_goals`
- Admin define quais métricas são acompanhadas na rotina

**Visualização:**
- **Topo (por vendedor):** cards KPI de "Hoje" — meta diária vs realizado, com barra de progresso e streak (dias consecutivos batendo meta)
- **Leaderboard:** ranking do dia e da semana por métrica selecionável
- **Heatmap:** grid tipo GitHub (últimos 90 dias) mostrando intensidade de atividade por vendedor
- **Filtros:** período (hoje/semana/mês), vendedor, métrica

**Permissões:**
- Vendedor vê apenas seus próprios números + leaderboard da equipe
- Admin/tatico vê todos e configura metas

## Estrutura técnica

### Nova tabela: `tactical_metrics`
Catálogo de métricas táticas configuráveis pelo admin.

```
id, key (slug), label, source, unit, is_active, sort_order
source: 'activity_type' | 'stripe_mrr' | 'stripe_deals' | 'manual'
```
Seed: mensagem_enviada, resposta_recebida, call_realizada, reuniao_executada, proposta, mrr_dia, vendas_dia.

### Nova tabela: `tactical_goals`
Meta diária por métrica × vendedor (opcional) × período.

```
id, metric_id (fk), user_id (nullable = default equipe),
daily_target numeric, period_start date, period_end date,
derived_from_goal_id uuid nullable, created_by, created_at
```

### Nova tabela: `tactical_manual_entries`
Realizados manuais para métricas fora do sistema.

```
id, metric_id, user_id, entry_date, value numeric, note, created_at
```

Todas com RLS + GRANTs padrão (authenticated/service_role). Vendedor lê/escreve próprios registros; admin/tatico gerencia tudo.

### Fontes de dados existentes (sem duplicar)
- `activities` — já tem `type`, `user_id`, `created_at` — agregação direta por dia
- `stripe_conversions` — `assigned_seller_id`, `converted_at`, `mrr_net` — agregação por dia
- View auxiliar `v_tactical_daily` (opcional) agregando as três fontes por (metric_key, user_id, date)

### Componentes React

Todos em `src/components/goals/tactical/`:
- `TacticalTracking.tsx` — orquestrador da aba, filtros, layout
- `SellerDailyCards.tsx` — cards de "Hoje" por métrica com progresso e streak
- `TacticalLeaderboard.tsx` — ranking dia/semana
- `ActivityHeatmap.tsx` — grid 90 dias por vendedor (recharts ou grid CSS)
- `TacticalGoalsManager.tsx` — CRUD de metas diárias (admin) e catálogo de métricas
- `ManualEntryDialog.tsx` — vendedor lança realizados manuais

### Integração
- Nova aba `<TabsTrigger value="tactical">Metas Táticas</TabsTrigger>` em `src/pages/Goals.tsx`
- Nova rota não necessária — vive dentro de `/goals`
- Reaproveita `parseDateBR` para timezone e `MetricCard` para KPIs

## Layout da aba

```text
┌─────────────────────────────────────────────────────────┐
│ [Filtro Período] [Filtro Vendedor] [+ Lançar realizado] │
├─────────────────────────────────────────────────────────┤
│ HOJE — cards por métrica (meta vs realizado + streak)   │
│ [Msgs 12/30] [Calls 3/5] [MRR R$ 2.1k/R$3k] [Vendas...] │
├─────────────────────────────────────────────────────────┤
│ LEADERBOARD (dia | semana | mês)                        │
│ Métrica: [dropdown]                                     │
│ 1. Ana    45 msgs  ▓▓▓▓▓▓▓▓▓░                          │
│ 2. Bruno  38 msgs  ▓▓▓▓▓▓▓▓░░                          │
├─────────────────────────────────────────────────────────┤
│ HEATMAP — últimos 90 dias por vendedor                  │
│ Ana    ░▒▓█▓▒░░▒▓█▓▒░░▒▓...                            │
│ Bruno  ▒▓█▓▒░░▒▓█▓▒░░▒▓█...                            │
└─────────────────────────────────────────────────────────┘
```

## Ordem de implementação

1. Migração: 3 tabelas + RLS/GRANTs + seed do catálogo de métricas
2. `TacticalTracking.tsx` + integração da aba em `Goals.tsx`
3. `SellerDailyCards.tsx` (queries em `activities` e `stripe_conversions`)
4. `TacticalLeaderboard.tsx`
5. `ActivityHeatmap.tsx`
6. `TacticalGoalsManager.tsx` (admin) e `ManualEntryDialog.tsx` (vendedor)
7. Cálculo de meta diária derivada (meta mensal ÷ dias úteis) com override
