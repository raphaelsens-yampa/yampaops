## Premissa de detecção (definida pelo usuário)

O **ponto de verdade do upsell é o `stripe_price_id` da nova oferta**. Toda nova conversão Stripe (independente de vir de `subscription.created`, `subscription.updated` ou `checkout.session.completed`) é classificada assim:

1. Já existe `stripe_conversions` para o mesmo `stripe_customer_id` (ou email normalizado) ANTES desta?
   - **Não** → `conversion_type='new'`.
   - **Sim** → é um upsell/downgrade. Compara o `mrr` do novo `price_id` com o `mrr` da conversão anterior mais recente do cliente:
     - `mrr_novo > mrr_antigo` → `conversion_type='upsell'`.
     - `mrr_novo < mrr_antigo` → `conversion_type='downgrade'`.
     - igual → `conversion_type='renewal'` (registra, não conta como expansion).

Não dependemos de `previous_attributes` da Stripe — basta o price_id chegar e a função de classificação resolve.

## Regras de negócio (mantidas)

- **Métrica (paineis/One Page):** Expansion MRR = `mrr_novo − mrr_antigo` (delta).
- **Comissão:** valor cheio do novo plano.
- **Atribuição:** sem pipeline, usar fallback Chatwoot → Sales Campaigns → conversão anterior do mesmo cliente → manual.

## Mudanças

### 1) Banco — `stripe_conversions`

```text
conversion_type      text not null default 'new'   -- 'new' | 'upsell' | 'downgrade' | 'renewal'
previous_mrr         numeric not null default 0
previous_price_id    text
previous_conversion_id uuid references stripe_conversions(id)
delta_mrr            numeric GENERATED ALWAYS AS (mrr - previous_mrr) STORED
assigned_seller_id   uuid references auth.users(id)
attribution_source   text   -- 'chatwoot' | 'campaign' | 'previous_conversion' | 'manual' | null
```

Trocar o índice único `stripe_subscription_id` por `UNIQUE (stripe_subscription_id, stripe_price_id, stripe_event_id)` — assim a mesma assinatura pode ter várias linhas (cada troca de price vira uma).

Catálogo: garantir que `stripe_prices` tenha o `mrr` (unit_amount/intervalo) de cada price_id ativo, para a classificação não depender de chamar a Stripe a cada evento.

### 2) Função `classify_stripe_conversion(p_customer_id, p_email, p_price_id, p_mrr)`

SQL `SECURITY DEFINER`. Retorna `{ conversion_type, previous_mrr, previous_price_id, previous_conversion_id }`:

- Busca a última `stripe_conversions` do mesmo `stripe_customer_id` (fallback: mesmo email normalizado) com `created_at < now()`.
- Compara `p_mrr` com `previous.mrr` e devolve o tipo.

### 3) Webhook (`supabase/functions/stripe-webhook`)

- Adicionar `customer.subscription.updated` à lista de eventos relevantes (para capturar trocas de plano feitas fora de checkout).
- Para todo evento: extrair `price_id` + `mrr` → chamar `classify_stripe_conversion` → gravar a linha já com `conversion_type`, `previous_mrr`, `previous_price_id`, `previous_conversion_id` preenchidos.
- Em seguida chama `resolve_stripe_seller` (item 4) para preencher `assigned_seller_id` + `attribution_source`.
- Idempotência por `stripe_events.stripe_event_id` continua valendo.

### 4) Resolução de vendedor (`resolve_stripe_seller`)

Função SQL `SECURITY DEFINER`. Ordem de fallback (primeiro hit ganha):

1. **Conversão anterior** do mesmo customer/email com `assigned_seller_id` preenchido (cliente "pertence" a quem já vendeu).
2. **Chatwoot** — `chatwoot_conversations` do email/telefone com `assignee_user_id` mapeado a `profiles.user_id`, janela de 60 dias antes da conversão.
3. **Sales Campaigns** — `sales_campaign_contacts.assigned_seller_id` do contato (mesmo email/telefone), priorizando campanha ativa mais recente.
4. Nada → `attribution_source = null`, vai para `StripePendingActions`.

### 5) Comissão

- `commission_conversions` recebe `origem_cliente='upsell'` quando aplicável; base = MRR cheio do novo plano.
- Sem `assigned_seller_id` → comissão não é gerada automaticamente (evita pagamento errado), entra como pendente.

### 6) UI — Integrações / Stripe Conversions

`src/pages/StripeConversions.tsx` + `EmailDiagnosis` + `EditConversionDialog`:

- Coluna **Tipo** (Nova · Upsell · Downgrade · Renovação) e **Fonte da atribuição**.
- Filtros por tipo e por "sem vendedor".
- KPI **Expansion MRR** (Σ `delta_mrr` dos upsells no período).
- `EditConversionDialog` permite editar `conversion_type`, `previous_mrr`, `assigned_seller_id` e re-rodar `resolve_stripe_seller`.
- Pendências (upsell sem vendedor) aparecem em `StripePendingActions`.

### 7) Backfill

Edge function `stripe-recover` ganha modo "reclassify": varre todas as `stripe_conversions` existentes, agrupa por customer, ordena por data e roda `classify_stripe_conversion` para preencher os novos campos retroativamente.

### 8) One Page Diretoria

`src/data/onePageData.ts` passa a expor (via gerador externo) em `p1`:

- `expansion_mrr` (R$) — Σ `delta_mrr` dos upsells no período.
- `expansion_count` — nº de upsells.

`OnePageDiretoria.tsx` apenas consome — sem mudança de layout.

## Detalhes técnicos

- Match de cliente: `stripe_customer_id` é a chave primária; email normalizado (`lower(trim)`) e telefone (`normalize_phone_digits`, já existe) são fallbacks.
- `delta_mrr` como coluna gerada evita drift.
- Não precisa popular `previous_attributes`; tudo deriva do histórico em `stripe_conversions` + `stripe_prices`.
- Para price_id ainda não catalogado em `stripe_prices`, o webhook busca via `stripe.prices.retrieve` e insere no catálogo antes de classificar.

## Fora de escopo

- Churn/cancelamento.
- Proration intra-mês (consideramos MRR pelo `unit_amount` do novo price).
- Recriar pipeline; gestão de upsell vive nas telas de Conversões e Comissões.
