
## Objetivo

Distinguir **reativação** (cliente que cancelou e voltou depois de ≥ 2 meses) de **recorrência/upsell/downgrade** no webhook do Stripe, sem quebrar Metas nem Comissionamento.

## Regra de negócio

Uma conversão é considerada **reativação (nova venda)** quando:

- Existe subscription anterior do mesmo customer com `status = canceled` (sinal explícito), **OU**
- O gap entre a última `invoice.paid` do customer no Stripe e a nova conversão for **≥ 2 meses** (configurável).

Quando reativação é detectada, a conversão continua com `conversion_type = 'new'` (não quebra código atual), mas ganha duas marcações novas:

- `is_reactivation = true`
- `previous_churn_at = <ended_at da sub cancelada OU data da última invoice paga>`

Assim, Metas e Comissionamento continuam tratando como "new" (que é o comportamento correto: nova comissão, entra no funil de nova venda), e ganhamos relatório "quantas das novas vendas do mês foram reativações".

## Mudanças de banco (migration)

1. `ALTER TABLE public.stripe_conversions` — adicionar:
   - `is_reactivation boolean NOT NULL DEFAULT false`
   - `previous_churn_at timestamptz NULL`

2. `ALTER TABLE public.commission_settings` — adicionar:
   - `reactivation_gap_months int NOT NULL DEFAULT 2`

3. Atualizar `classify_stripe_conversion` para receber `p_reactivation_gap_months int` e retornar duas colunas adicionais: `is_reactivation boolean`, `previous_churn_at timestamptz`. Continua devolvendo `conversion_type = 'new'` no caso de reativação; apenas seta as flags.

## Mudanças no webhook `stripe-webhook`

Antes de chamar `classify_stripe_conversion`:

- Buscar `stripe.subscriptions.list({ customer, status: 'canceled', limit: 5 })` — pegar `ended_at` mais recente.
- Buscar `stripe.invoices.list({ customer, status: 'paid', limit: 100 })` — pegar `paid_at` mais recente **anterior** à conversão atual.
- Calcular `previous_churn_at = max(subscription_canceled.ended_at, ultima_invoice_paid.paid_at)`.
- Se existe qualquer um dos sinais **E** `(convertedAt - previous_churn_at) >= reactivation_gap_months meses`, marcar `is_reactivation = true`.

Passar esses valores para o insert/update de `stripe_conversions`. `conversion_type` continua vindo do RPC (será `new` no cenário de reativação porque o gap grande também impacta o "último registro"; mesmo se voltar como `renewal`, sobrescrever para `new` quando `is_reactivation=true`).

Registrar em `integration_sync_errors` (resolved=true, tipo `stripe_reactivation_detected`) para auditoria da primeira leva.

## Backfill

Nova Edge Function `stripe-backfill-reactivations` (admin-only, `verify_jwt=true`):

- Itera `stripe_conversions` ordenadas por `converted_at`.
- Para cada uma, aplica a mesma lógica do webhook (chama Stripe para invoices/subscriptions anteriores ao `converted_at` da linha).
- Atualiza `is_reactivation`, `previous_churn_at`, e se aplicável, `conversion_type = 'new'` (só quando muda de renewal→new por reativação; nunca sobrescreve upsell/downgrade se o MRR mudou).
- Body opcional: `{ from, to, limit }`. Retorna contagem processada/marcada.

## UI

Escopo mínimo, só o essencial pra visibilidade:

- `src/pages/StripeConversions.tsx`: badge "Reativação" na linha quando `is_reactivation = true`, com tooltip mostrando `previous_churn_at`. Filtro "Somente reativações" (checkbox).
- `src/pages/CommissionSettings.tsx` (ou onde vive `commission_settings`): campo numérico "Gap mínimo para reativação (meses)", default 2.
- Botão "Reprocessar reativações" (admin) em `StripeConversions.tsx` que chama a nova Edge Function com range de data.

## O que NÃO muda

- `resolve_stripe_seller`, `apply_commission_from_stripe`, Metas (`GoalsTracking`), `commission_conversions`.
- Regras de dedup (subscription/price, customer/price/converted_at, event_id) permanecem.
- Fluxo de importação manual de comissões.

## Detalhes técnicos

- Timezone: comparações em UTC (padrão atual das colunas `timestamptz`).
- Cliente sem histórico no Stripe (primeira compra): `is_reactivation = false`, `previous_churn_at = null`, `conversion_type = 'new'` como hoje.
- Cliente ativo pagando mensal: última invoice paga é recente → gap < 2 meses → `is_reactivation = false`, comportamento atual preservado (renewal/upsell/downgrade).
- Cliente que cancelou há 3 meses e voltou: sub cancelada + gap ≥ 2 → `is_reactivation = true`, `conversion_type = 'new'`.

## Arquivos afetados

- migration: nova (colunas + update da função `classify_stripe_conversion`).
- `supabase/functions/stripe-webhook/index.ts` — lookup de churn + set das flags.
- `supabase/functions/stripe-backfill-reactivations/index.ts` — nova.
- `src/pages/StripeConversions.tsx` — badge, filtro, botão de reprocesso.
- `src/pages/CommissionSettings.tsx` — campo `reactivation_gap_months`.
- `src/integrations/supabase/types.ts` — regenerado pela migration.
