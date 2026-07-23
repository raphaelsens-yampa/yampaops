## Objetivo

Suportar metas de **Retenção/Churn** (CS) — métricas em que "menor é melhor" — com captura de eventos de cancelamento vindos do Stripe e novas variações de churn expostas como fontes automáticas nas categorias de meta.

## 1. Captura de churn no Stripe

Nova tabela `public.stripe_churn_events`:

| coluna | tipo | descrição |
|---|---|---|
| id | uuid pk | |
| stripe_customer_id | text | |
| stripe_subscription_id | text (unique) | evita duplicidade |
| customer_email | text | |
| canceled_at | timestamptz | data do cancelamento |
| mrr_lost | numeric | MRR mensal perdido (usa `mrr_net`/`mrr` da conversão ativa) |
| plan_name | text | derivado do price mapping |
| stripe_area | text | mesma coluna usada nas conversões (Sales/CS/Produto/etc.) |
| assigned_seller_id | uuid | herdado da última conversão do cliente |
| cancellation_reason | text | `cancellation_details.reason` do Stripe quando disponível |
| raw_event | jsonb | payload |

+ GRANTs padrão (`authenticated` SELECT, `service_role` ALL), RLS lendo para admin/tatico.

Atualizar `supabase/functions/stripe-webhook/index.ts`:
- Tratar `customer.subscription.deleted` (e `updated` quando muda para `canceled`): insere linha em `stripe_churn_events` com `mrr_lost` = MRR da última conversão ativa daquele customer/subscription, `stripe_area` copiado dela.
- Ignorar quando existe uma nova conversão do mesmo cliente dentro do gap de reativação (evita contar reativação como churn definitivo — mantém coerência com a regra atual).

Nova Edge Function `stripe-backfill-churn` para popular histórico varrendo `stripe.subscriptions.list({status:'canceled'})` — botão na aba **Stripe** de Comissionamento.

## 2. Categorias com direção de meta

Migração em `goal_categories`:
- Nova coluna `goal_direction text default 'gte' check (goal_direction in ('gte','lte'))`.
- Novos valores permitidos em `auto_source`: `stripe_churn_mrr`, `stripe_churn_logos`, `stripe_churn_rate_logos`.
- Categorias seed (system):
  - "Churn de MRR" — area=cs, metric_type=currency, auto_source=stripe_churn_mrr, goal_direction=lte
  - "Churn de Logos" — area=cs, metric_type=count, auto_source=stripe_churn_logos, goal_direction=lte
  - "Churn % (logos)" — area=cs, metric_type=ratio, auto_source=stripe_churn_rate_logos, goal_direction=lte

Atualizar `src/lib/goalCategories.ts`:
- Adicionar tipos `GoalDirection = 'gte' | 'lte'` e novos `AutoSource`.
- `AUTO_SOURCE_LABELS` ganha rótulos PT-BR.
- Helper `isBetterBelow(direction)` e `progressPct(realized, target, direction)` — quando `lte`, `% = target/realized` limitado, e "faltar" vira "excedeu em".

Atualizar `CategoryManager.tsx` para expor selector de **Direção do alvo** e novas fontes.

## 3. Cálculo no acompanhamento

Em `src/components/goals/GoalsTracking.tsx`:
- Carregar `stripe_churn_events` do período atual (mesmo filtro de datas já usado para conversões).
- No `breakdownByCategory`, quando `auto_source` for de churn:
  - `stripe_churn_mrr` → soma `mrr_lost` no período (filtrado por `stripe_area` se preenchido).
  - `stripe_churn_logos` → contagem distinta de `stripe_customer_id`.
  - `stripe_churn_rate_logos` → churn_logos ÷ base ativa no início do período (clientes com MRR ativo em `period_start`, derivado das `stripe_conversions`).
- Escopo **Empresa** e **Equipe**: filtra `stripe_area` = área da equipe (compatível com a lógica já existente).
- Passar `goal_direction` para `GoalKpiCards` e para as tabelas de progresso.

## 4. UI de "menor é melhor"

`GoalKpiCards.tsx` e cards de progresso:
- Prop `direction: 'gte' | 'lte'`.
- Cor: `lte` → verde quando realizado ≤ alvo, âmbar até 120% do alvo, vermelho acima.
- Labels: "Teto" em vez de "Meta", "Excedeu em R$ X" em vez de "Faltam".
- Ícone: `ShieldCheck`/`TrendingDown` quando `lte`.

Ajustar `SellerRankingTable`/`TeamRankingTable` para exibir badge "Churn" e ordenar crescente quando a categoria selecionada for `lte`.

## 5. Cadastro de meta

`src/pages/Goals.tsx` não muda estrutura — o campo `target_mrr` já cobre R$ de churn, `target_deals` cobre logos, `target_tpv` pode ser reaproveitado para % (ou adicionamos placeholder dinâmico conforme `metric_type` da categoria selecionada). Ajuste apenas os placeholders do form para refletir a categoria escolhida (ex: "Teto de Churn (R$)").

## Detalhes técnicos

```text
Fluxo de dados
──────────────
Stripe webhook ──subscription.deleted──▶ stripe_churn_events
                                              │
                                              ▼
                                    GoalsTracking (period filter)
                                              │
                          ┌───────────────────┼────────────────────┐
                          ▼                   ▼                    ▼
                    Churn MRR (R$)      Churn logos (#)      Churn % (logos)
                          │                   │                    │
                          └────────── GoalKpiCards(direction=lte) ─┘
```

Ordem das migrações:
1. `create table stripe_churn_events` + GRANTs + RLS + policies (admin/tatico read; service_role write via webhook).
2. `alter table goal_categories add column goal_direction`.
3. Seed das 3 categorias CS via `insert` tool.

Fora de escopo desta iteração: NRR, motivos de cancelamento detalhados na UI, alerta automático quando churn ultrapassa o teto.
