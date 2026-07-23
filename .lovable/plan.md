# Meta de Net MRR na Visão Geral

## Fórmula
**Net MRR = Novo + Expansão − Downgrade − Churn** (mensal, escopo Empresa)

- **Novo**: soma `mrr_net` de `stripe_conversions` com `conversion_type = 'new'` no período.
- **Expansão**: soma `(mrr_net − previous_mrr)` para `conversion_type = 'upsell'`.
- **Downgrade**: soma `(previous_mrr − mrr_net)` para `conversion_type = 'downgrade'`.
- **Churn**: soma `mrr_lost` de `stripe_churn_events` no período.
- Renovações ficam neutras (não entram no Net MRR).

## Passos

1. **Categoria automática (Financeiro)**
   - Nova `AutoSource = 'stripe_net_mrr'` em `src/lib/goalCategories.ts`.
   - Inserir categoria de sistema **"Net MRR"** em `goal_categories` (area=`financial`, metric_type=`mrr`, direction=`gte`, auto_source=`stripe_net_mrr`).
   - `CategoryManager` já lista automaticamente a nova fonte via `AUTO_SOURCE_LABELS`.

2. **Cálculo em `GoalsTracking`**
   - No mesmo carregamento que já traz `stripe_conversions` e `stripe_churn_events`, agregar `netMrrTotal` do período aplicando a fórmula acima (usa `previous_mrr` já existente em `stripe_conversions`).
   - Distribuir também por mês para a série temporal do gráfico.
   - Injetar o valor realizado nas categorias com `auto_source='stripe_net_mrr'`.

3. **Card global na Visão Geral**
   - Adicionar sexto card em `GoalKpiCards` (ou grupo dedicado abaixo do grid atual) mostrando **Net MRR realizado × meta**, com mini-detalhe "Novo +X / Expansão +Y / Downgrade −Z / Churn −W".
   - Se não houver meta cadastrada para a categoria Net MRR, o card exibe só o realizado + breakdown.
   - Mantém direção `gte` (maior é melhor) — usa os helpers de cor já existentes.

4. **Cadastro de meta**
   - Nenhum ajuste extra em `Goals.tsx`: basta escolher a categoria **Net MRR** ao criar/editar a meta e preencher `target_mrr`.

## Detalhes técnicos

- `stripe_conversions.previous_mrr` já é populado por `classify_stripe_conversion` — usar direto, sem migração.
- Nenhuma alteração de schema; só um `INSERT` em `goal_categories` (via `supabase--insert`) para a categoria sistema.
- Toda a matemática roda no cliente dentro de `GoalsTracking`, respeitando os filtros de período já existentes.

## Fora de escopo
- Quebra por área/equipe/vendedor (usuário optou por Empresa apenas).
- Metas de Net MRR mensais rolling — usaremos o período selecionado no navigator, como as outras metas.
