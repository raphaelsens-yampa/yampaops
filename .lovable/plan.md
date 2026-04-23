

## Painel de Acompanhamento de Metas (Mensal/Semanal/Diária)

Criar uma nova aba **"Acompanhamento"** dentro da página de Metas (`/goals`), separada da aba atual de cadastro. Esse painel mostra o progresso da equipe em três janelas temporais — **Diária, Semanal e Mensal** — comparando realizado vs. meta, com ranking individual por vendedor e agregação por equipe.

### Estrutura da tela

```text
/goals
├── Tab: Cadastro de Metas    (tela atual)
└── Tab: Acompanhamento        (NOVA)
    ├── [Filtros: Período (Dia/Semana/Mês) | Data | Equipe | Vendedor]
    ├── [Cards de KPI agregados]
    │     MRR Realizado | Meta do Período | % Atingido | Pace (ritmo)
    ├── [Gráfico: Realizado vs. Meta acumulado no período]
    ├── [Tabela: Ranking por Vendedor]
    │     Vendedor | Meta | Realizado | % | Gap | Status
    └── [Tabela: Por Equipe]  (apenas admin)
          Equipe | Meta consolidada | Realizado | % | Top performer
```

### Lógica de cálculo

| Janela | Período considerado | Meta usada |
|---|---|---|
| **Diária** | Hoje (00:00 → 23:59) | Meta mensal ÷ dias úteis do mês |
| **Semanal** | Semana atual (seg → dom) | Meta mensal ÷ semanas do mês × dias úteis na semana |
| **Mensal** | Mês selecionado | Meta cadastrada com `period_start`/`period_end` cobrindo o mês |

**Realizado** = soma de `estimated_mrr` de oportunidades em estágios `is_won = true`, filtradas por `updated_at` dentro da janela.

**Pace** = (Realizado ÷ dias decorridos) × dias totais do período, indicando se está no ritmo para bater a meta.

**Status** colorido: verde (≥100%), amarelo (70–99%), vermelho (<70%).

### Filtros e navegação

- Seletor de granularidade (Dia / Semana / Mês) com botões de navegação ◀ ▶ para o período anterior/próximo.
- Filtro por equipe (apenas admin) — busca em `team_members` para resolver vendedores da equipe.
- Filtro por vendedor individual.
- Vendedor (não-admin) vê apenas seus próprios dados.

### Detalhes técnicos

**Arquivos a criar:**
- `src/pages/Goals.tsx` — refatorar para usar `Tabs` (cadastro + acompanhamento)
- `src/components/goals/GoalsTracking.tsx` — container do painel novo
- `src/components/goals/PeriodNavigator.tsx` — seletor Dia/Semana/Mês + navegação
- `src/components/goals/GoalKpiCards.tsx` — 4 cards de KPI
- `src/components/goals/SellerRankingTable.tsx` — ranking por vendedor
- `src/components/goals/TeamRankingTable.tsx` — agregação por equipe (admin)
- `src/components/goals/GoalProgressChart.tsx` — gráfico de linha (Recharts) Realizado vs. Meta linear

**Queries Supabase:**
- `goals` filtrando por `scope` (company / team / user) e período sobreposto à janela
- `opportunities` join com `pipeline_stages` (`is_won = true`), filtrando `updated_at` na janela
- `profiles` + `team_members` + `teams` para nomes e agregação de equipe
- RLS já existente garante que sellers veem apenas o que lhes pertence

**Bibliotecas:** somente as já instaladas — `recharts`, `date-fns`, `lucide-react`, componentes shadcn (`Tabs`, `Card`, `Table`, `Select`, `Button`, `Badge`, `Progress`).

**Sem alterações de schema** — todas as informações necessárias já existem.

