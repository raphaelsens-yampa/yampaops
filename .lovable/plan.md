## Refactor completo da tela de Metas

Alinhar Metas com a nova verdade unificada (MRR líquido, `assigned_seller_id`, `sales_campaigns`), remover herança do ActiveCampaign, matar campos não usados e tornar mapeamento Stripe↔categoria configurável.

### 1. Fonte de verdade: Stripe líquido

`GoalsTracking.tsx`
- Trocar `sc.mrr` por `COALESCE(sc.mrr_net, sc.mrr)` em `realized`, `realizedBySeller`, `wonForChart`, `orphanMrrByArea`, `stripeMrrByArea`.
- Substituir `getConversionSellerId` por: `sc.assigned_seller_id ?? opp.consultant_id ?? price_map.seller_user_id`. Isso passa a bater 1:1 com Comissionamento.
- Remover `wonInPeriod` (nunca é consumido).

### 2. Mapeamento Stripe↔categoria configurável

Migração:
- Adicionar `goal_categories.stripe_area text` (nullable) e `goal_categories.auto_source text` com valores `stripe`, `stripe_ltv`, `stripe_cac`, `stripe_ltv_cac`, `deals_count`, `manual`.
- Backfill: `new_mrr → stripe_area='Sales', auto_source='stripe'`; `campanha_mrr → stripe_area='Marketing', auto_source='stripe'`; `ltv/cac/ltv_cac → auto_source='stripe_*'`.

`goalCategories.ts`:
- Remover `STRIPE_AREA_BY_SLUG` / `STRIPE_DRIVEN_SLUGS` / `FINANCIAL_SLUGS` hardcoded. Trocar por leitura dos novos campos.

`CategoryManager.tsx`:
- Adicionar selects para Área Stripe (livre + presets Sales/Marketing) e Fonte automática.

### 3. LTV/CAC via Stripe

Base = conversões Stripe do período (não `opportunities.estimated_mrr`):
- LTV = média(`mrr_net`) das conversões Stripe no escopo ÷ churn.
- CAC = `finance_settings.avg_campaign_cost` ÷ nº conversões Stripe da área "Marketing" no período.
- LTV/CAC = derivado dos dois.

### 4. Remover legado ActiveCampaign / campos zumbis

Migração:
- `ALTER TABLE goals DROP COLUMN target_prospeccoes, target_respostas, target_agendamentos, target_comparecimentos, target_conversoes, target_taxa_resposta, target_taxa_agendamento, target_taxa_comparecimento, target_taxa_conversao`.
- Remover `channel` do enum de escopo (converter registros existentes para `company` + aviso no log).

`Goals.tsx`:
- Remover estados `gProspeccoes/gRespostas/.../gTaxa*` e todos os inputs "Volume por etapa" / "Meta de conversão por etapa".
- Remover escopo `channel` de `SCOPE_LABELS`, filtros, formulário e listagem.
- Remover import `ORIGIN_LABELS`.

### 5. Escopo `campaign` ligado a `sales_campaigns`

- Trocar `Input` texto livre por `Select` populado por `sales_campaigns` (id + name).
- Migração: `ALTER TABLE goals ADD COLUMN campaign_id uuid REFERENCES sales_campaigns(id)`. Manter `campaign` (texto) por retrocompatibilidade + backfill best-effort por nome.
- Realizado do escopo campanha = soma de `mrr_generated` de `sales_campaign_contacts` da campanha no período (ou conversões Stripe ligadas — a decidir na implementação; padrão: `sales_campaign_snapshots` mais recente do período).

### 6. Prorateamento por dias úteis + reativação

- `periodTarget`, `sellerRows.target`, `teamRows.target`, `proratedTarget`: já usam `businessDaysInRange`. Ajustar granularidade "dia" para não retornar 0 no fim de semana quando houver conversão real (mostrar meta = 0 mas realizado real).
- Adicionar coluna "Reativações" (badge) no `SellerRankingTable`, contando `stripe_conversions` com `is_reactivation=true` no período/escopo.

### 7. Reconciliação de órfãs por área

- `orphanMrrByArea` hoje casa nome do time == `sc.area` (string frágil).
- Migração: `ALTER TABLE teams ADD COLUMN stripe_area text`. `TeamRankingTable` passa a somar órfãs por `stripe_area` do time.

### 8. KPI de deals

- `GoalKpiCards`: adicionar 5º card "Deals fechados" = count de `stripe_conversions` no escopo, comparando com `target_deals` do escopo (nunca era exibido).

### Ordem de execução

1. Migração única (drop colunas zumbis + drop escopo channel + add colunas `goal_categories.stripe_area/auto_source` + `teams.stripe_area` + `goals.campaign_id` + backfill).
2. Ajustes em `goalCategories.ts`, `GoalsTracking.tsx`, `Goals.tsx`, `CategoryManager.tsx`, `SellerRankingTable.tsx`, `TeamRankingTable.tsx`, `GoalKpiCards.tsx`, `GoalsBreakdownByCategory.tsx`.
3. Validação visual em `/metas` (KPIs batendo com Comissionamento → Overview e Stripe → Conversões por Área).

### Fora de escopo desta rodada

- Recriar tracking de funil (prospecções/respostas/etc.) via Chatwoot — quando pedido, virá de outra fonte.
- Alterar cálculo de comissão (permanece como já unificado).
