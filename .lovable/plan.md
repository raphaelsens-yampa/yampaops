
# Metas Táticas — Missão do Dia

Substituir o painel atual (cards genéricos + tabelas) por uma tela inspiracional e focada: cada pessoa abre e vê **o que falta fazer hoje**, ao lado do **placar do time**.

## Layout novo

```text
┌──────────────────────────────────────────────────────────────┐
│ SUA MISSÃO HOJE — Eduarda · Time Sales      qui, 30/07  🔥 4  │
├───────────────────────────────┬──────────────────────────────┤
│  ◯ 3 NOVAS VENDAS             │  PLACAR DO TIME · HOJE       │
│    ▓▓▓▓▓▓░░░  2 de 3          │  Métrica: [Novas vendas ▾]   │
│    FALTAM 1 ✦                 │  1 🥇 Eduarda  2/3  ▓▓▓▓░    │
│                               │  2 🥈 João     1/3  ▓▓░░░    │
│  ◯ 30 MENSAGENS               │  3    Ana      0/3  ░░░░░    │
│    ▓▓▓▓▓▓▓▓▓  32 de 30 ✓      │                              │
│    META BATIDA!               │  Time hoje: 3 de 9  (33%)    │
│                               │  Semana: 14 de 45            │
│  [+ Lançar realizado]         │                              │
├───────────────────────────────┴──────────────────────────────┤
│ CONSISTÊNCIA — últimos 30 dias úteis (heatmap compacto)       │
└──────────────────────────────────────────────────────────────┘
```

**Missão do dia (coluna esquerda, protagonista):** um card grande por métrica ativa do time da pessoa. Cada card traz anel de progresso, número gigante do que **falta** ("FALTAM 1"), a meta em texto natural ("3 novas vendas por dia"), estado de meta batida com destaque verde e selo, e streak de dias consecutivos. Mensagem motivacional muda conforme o progresso (0% / em andamento / batida / superada).

**Placar do time (coluna direita):** ranking do dia por métrica selecionável, com barras de progresso vs. meta diária individual, medalhas para o top 3, e o agregado do time (hoje e semana). Vendedor vê o placar do próprio time; admin/tático pode alternar entre times.

**Consistência (rodapé):** heatmap compacto de 30 dias úteis por pessoa, substituindo o heatmap de 90 dias atual.

Admin/tático ganha, abaixo, o bloco de configuração (metas diárias e catálogo), recolhido por padrão.

## Times: CS × Sales

Já existem os times `CS`, `Sales` e `Suporte` em `teams`/`team_members`. Vamos:
- Adicionar `team_id` (nullable) em `tactical_metrics` — métrica sem time = vale para todos.
- Filtrar as métricas exibidas pelo time da pessoa (via `team_members`).
- Seletor de time no topo apenas para admin/tático.
- No gerenciador de metas, permitir cadastrar meta diária por **time** (além de por pessoa e global), adicionando `team_id` em `tactical_goals`. Precedência: pessoa → time → global.

## Métrica de recuperação do CS

Nova métrica `clientes_recuperados` (time CS, meta ex.: 10/dia), com fonte híbrida:
- **Automático:** conversões do Stripe marcadas como `is_reactivation`, atribuídas ao responsável e contadas no dia da conversão. (Hoje há apenas 3 registros marcados na base — o volume deve crescer conforme novas reativações entram; não haverá histórico retroativo relevante.)
- **Manual:** o colaborador lança recuperações do dia pelo diálogo "Lançar realizado"; os dois somam no total do dia.

Para isso, `tactical_metrics.source` ganha o valor `stripe_reactivation`, e o `ManualEntryDialog` passa a permitir lançamento manual nessa métrica (hoje bloqueia tudo que vem do Stripe — o bloqueio continua só para `stripe_mrr` e `stripe_deals`).

## Detalhes técnicos

**Migração**
- `alter table tactical_metrics add column team_id uuid references teams(id)`
- `alter table tactical_goals add column team_id uuid references teams(id)`
- Seed da métrica `clientes_recuperados` (source `stripe_reactivation`, unidade count, time CS) e vínculo das métricas atuais aos times (vendas/MRR/mensagens → Sales; recuperação → CS).
- RLS/GRANTs existentes das tabelas continuam válidos (colunas novas apenas).

**Dados** (`useTacticalData.ts`)
- Buscar `team_members` e incluir `team_id` em métricas/metas.
- Agregar reativações: `stripe_conversions` com `is_reactivation = true` por `assigned_seller_id` e dia.
- Manter entradas manuais somando às fontes automáticas (não mais ignoradas quando a métrica é `stripe_reactivation`).

**Componentes** (`src/components/goals/tactical/`)
- `MissionToday.tsx` (novo) — substitui `SellerDailyCards.tsx`, cards grandes com anel de progresso (SVG), "faltam X", streak e copy motivacional.
- `TeamScoreboard.tsx` (novo) — substitui `TacticalLeaderboard.tsx`, ranking do dia com barras vs. meta e agregado do time.
- `ActivityHeatmap.tsx` — reduzido para 30 dias úteis e visual mais compacto.
- `TacticalTracking.tsx` — novo layout em duas colunas, seletor de time (admin), config recolhida.
- `TacticalGoalsManager.tsx` — escopo da meta: Equipe toda / Time / Pessoa.
- `types.ts` — `team_id` nos tipos, `source` com `stripe_reactivation`, helper de precedência de meta e de copy motivacional.

Tudo com tokens semânticos do design system (sem cores hardcoded), tipografia Sora/Manrope já em uso, e textos em PT-BR.
