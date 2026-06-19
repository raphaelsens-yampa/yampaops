# Plano: Versão Mobile do Yampa

Objetivo: tornar o sistema 100% utilizável em telas pequenas (≤768px), substituindo o sidebar por uma **bottom navbar** e ajustando tabelas, modais, gráficos, kanban e cabeçalhos.

## 1. Navegação mobile (núcleo da entrega)

**Criar `src/components/MobileBottomNav.tsx`**
- Visível só em `<md` (`md:hidden`), fixo no rodapé (`fixed bottom-0`, `safe-area-inset-bottom`).
- 5 atalhos principais: Dashboard, Pipeline, Metas, Conversões, **Mais** (abre Sheet com o restante).
- `Sheet` lateral reaproveita os itens existentes de `AppSidebar` para os links secundários (Comissões, Forecast, Imports, Chatwoot, Stripe, Tags, Equipe, Usuários, etc.).
- Destaque do item ativo via `useLocation`.

**Ajustar `src/components/Layout.tsx`**
- Esconder `AppSidebar` em mobile (`hidden md:flex`).
- Renderizar `MobileBottomNav` apenas em mobile.
- Adicionar `pb-20 md:pb-0` no `<main>` para não cobrir conteúdo.
- Header mobile compacto com logo + título da rota + botão de menu (abre o mesmo Sheet "Mais").

## 2. Padrões responsivos aplicados em todas as telas

- **Containers**: trocar `p-6` fixos por `p-3 sm:p-4 md:p-6`; grids `grid-cols-2/3/4` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`.
- **KPIs / MetricCards**: stack em 1 coluna no mobile, 2 no `sm`.
- **Cabeçalhos de página**: título + ações viram coluna no mobile (`flex-col gap-3 md:flex-row md:items-center`); filtros longos viram `Sheet` "Filtros".
- **Tabelas densas** (`SellerRankingTable`, `TeamRankingTable`, `GoalsBreakdownByCategory`, `CommissionTriggersTable`, `ProductPricingTable`, `ComissionamentoConversions`, `ComissionamentoPriceMap`, `StripeConversions`, `Leaderboard`, `BottleneckAlerts`, `Users`, `Team`, `Contacts`):
  - Wrap em `overflow-x-auto` com `min-w-` na tabela.
  - Em `<sm`, renderizar layout em **cards empilhados** (label: valor) para as 3-5 colunas mais importantes; demais colunas escondidas.
- **Gráficos** (`GoalProgressChart`, `PipelineFunnel`, `RevenueProjection`, `ConversionRates`, `ScenarioAnalysis`): `ResponsiveContainer` com `aspect` adaptativo; legenda embaixo no mobile; reduzir ticks/labels.
- **Diálogos** (`NewOpportunityDialog`, `EditOpportunityDialog`, `MapPriceDialog`, `ManualConversionDialog`, etc.): `max-w-[95vw]`, `max-h-[90vh] overflow-y-auto`, formulários em 1 coluna no mobile.
- **Tabs** (`Precificacao`, `Comissionamento`, `Goals`, etc.): `TabsList` com `overflow-x-auto` e scroll horizontal; rótulos curtos ou só ícones em `<sm`.
- **Pipeline/Kanban** (`Pipeline.tsx`, `SellerKanban.tsx`, `KanbanColumn`, `KanbanCard`): no mobile, scroll horizontal com snap (`snap-x snap-mandatory`), colunas com `w-[85vw]`; cards mais compactos.
- **PeriodNavigator / SafraSelector / filtros de data**: empilhar verticalmente, botões full-width.
- **Sonner/Toaster**: `position="top-center"` no mobile.

## 3. Telas que recebem refatoração específica

- `AdminDashboard` — KPIs 1-col, funil+metas empilhados, projeção scroll-x.
- `Goals` + `GoalsTracking` — KPIs stack, gráfico full-width, tabelas em modo card no mobile.
- `Pipeline` / `SellerKanban` — kanban horizontal com snap, FAB "Nova oportunidade".
- `Comissionamento`, `Commissions`, `CommissionSettings` — tabs scrolláveis, tabelas em cards.
- `Forecast`, `Reports`, `OnePageDiretoria` — gráficos responsivos, grids 1-col.
- `Precificacao` — tabs com ícone-only no mobile, tabelas em cards, proposta com preview rolável.
- `Auth`, `Profile`, `Users`, `Team` — formulários full-width, paddings reduzidos.
- `Chatwoot*`, `StripeConversions`, `LeadJourney`, `SalesCampaigns*`, `IntegrationAudit`, `Imports` — mesmas regras (tabelas → cards, filtros → Sheet).

## 4. Utilitários

- Reutilizar `useIsMobile()` onde precisar trocar entre tabela e cards.
- Adicionar utilitário `safe-area` no `index.css` (`env(safe-area-inset-bottom)`).
- Garantir `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` em `index.html`.

## 5. Validação

- Rodar build.
- Conferir as 5-6 telas principais (Dashboard, Pipeline, Metas, Conversões, Comissões, Precificação) em 375×812 via `browser--view_preview`.

## Observações

- Mudanças puramente de UI/responsividade — sem mexer em lógica de negócio, queries ou schema.
- Sidebar desktop permanece intacto; o bottom nav é mobile-only.
- Trabalho amplo (≈40+ arquivos tocados); entrego em uma única passada de build mode após sua aprovação.
