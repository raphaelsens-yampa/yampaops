## Objetivo

Filtrar o webhook Stripe para registrar **somente assinaturas novas** em `stripe_conversions`, ignorando recorrências mensais que estão poluindo o painel.

---

## 1. Edge Function `stripe-webhook`

Aplicar filtro **antes** de qualquer escrita em `stripe_conversions` ou movimentação de deal:

- **`invoice.paid`**: processar **apenas** quando `billing_reason === 'subscription_create'` (primeira fatura). Ignorar `subscription_cycle`, `subscription_update`, `manual`, etc. → marcar `stripe_events.result = 'ignored_recurring'`.
- **`customer.subscription.created`**: continua como hoje (já é evento de criação).
- **`checkout.session.completed`**: continua como hoje (one-shot de criação).
- **Idempotência extra**: antes do `upsert` em `stripe_conversions`, verificar se já existe linha com mesmo `stripe_subscription_id` — se sim, pular (não é assinatura nova).

Resultado: cada assinatura entra **uma única vez** em `stripe_conversions`, no momento da criação.

## 2. Migration de limpeza retroativa

SQL para remover registros recorrentes já gravados:

- Em `stripe_conversions`, por `stripe_subscription_id`, manter apenas a linha de menor `converted_at` (a primeira) e deletar as demais.
- Em `opportunities`, **não mexer** (a movimentação para `pendencias_stripe` já é idempotente por stage).

## 3. CRM — pendência Stripe

A movimentação para `pendencias_stripe` continua acontecendo apenas no fluxo de match, e como passa pelo mesmo filtro do passo 1, deals não serão re-movidos por cobranças mensais.

---

## Arquivos

- `supabase/functions/stripe-webhook/index.ts` — adicionar filtro `billing_reason` e check de idempotência por `subscription_id`.
- Nova migration — DELETE de duplicatas em `stripe_conversions` mantendo a primeira por `stripe_subscription_id`.

## Entregas

1. Webhook só processa criação de assinatura.
2. Base `stripe_conversions` limpa de recorrências.
3. Painel `/insights/conversions` passa a refletir somente conversões novas.
