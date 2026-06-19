## Objetivo

Hoje o gráfico **Insights › Conversões por Área** (`/insights/conversions`) lê de `stripe_conversions`, cuja coluna `area` é resolvida no webhook do Stripe consultando primeiro `commission_products` e, em fallback, `stripe_prices`. Essas duas tabelas têm áreas divergentes do **Comissionamento › Mapa de Preços** (`commission_price_map`) — por exemplo:

- 10 conversões hoje marcadas como `Sales` deveriam ser `Parceria`
- 6 hoje `Sales` deveriam ser `CX`
- 7 `desconhecida` na verdade têm match em `Sales` no mapa
- A área `Parceria` nem existe na lista atual do painel

Vamos eleger o **Mapa de Preços** (`commission_price_map`) como única fonte de verdade para área, produto/oferta, plano e MRR, e recalcular o histórico.

## Campo do Stripe usado como chave

O melhor identificador para "nova assinatura paga" é o **`price_id`** do item da assinatura (`subscription.items.data[0].price.id`), capturado a partir do evento `customer.subscription.created` (e equivalentes em `checkout.session.completed` / `invoice.paid` com `billing_reason = subscription_create`). Esse `price_id` é único por oferta/plano no Stripe e é exatamente a chave usada em `commission_price_map.price_id`. Já é persistido em `stripe_conversions.stripe_price_id` (100% das 180 conversões atuais têm o campo preenchido), o que permite recompor o histórico sem reprocessar o Stripe.

## Mudanças

### 1. Webhook `supabase/functions/stripe-webhook/index.ts`

Substituir o bloco de resolução (linhas ~160–192) por uma consulta única ao `commission_price_map` pelo `stripe_price_id`:

- `area` ← `commission_price_map.area` (fallback `"desconhecida"`)
- `product_name` ← `commission_price_map.offer_name`
- `plan_name` ← `commission_price_map.plan_name` (fallback `price_name`)
- `mrr` ← `commission_price_map.mrr_override` (fallback: manter `0`; o webhook nunca mais consulta `commission_products`/`stripe_prices` para área/MRR)

A lógica de match com `opportunities` / pipeline pendente fica intacta.

### 2. Lista de áreas no painel `src/pages/StripeConversions.tsx`

- Trocar a constante `AREAS` por uma lista derivada dinamicamente das áreas existentes em `commission_price_map` (query rápida no carregamento) + `"desconhecida"`, em vez de hardcode.
- Adicionar cor para `Parceria` em `AREA_COLORS`.
- Manter todos os filtros, KPIs, gráficos e exportações (CSV/XLSX/PDF) como estão — só a fonte das áreas muda.

### 3. Migração SQL (recálculo do histórico)

Migração única que:

1. Atualiza `stripe_conversions` cruzando por `stripe_price_id` com `commission_price_map`, reescrevendo `area`, `product_name`, `plan_name` e `mrr` (`mrr` só é sobrescrito quando `mrr_override` não é nulo).
2. Linhas sem `stripe_price_id` ou sem match no mapa recebem `area = 'desconhecida'`.

Nenhuma alteração de schema, GRANT ou RLS é necessária — só `UPDATE`.

### 4. Itens fora de escopo / a remover do papel anterior

- A função de resolver área via `commission_products.stripe_price_id` e via `stripe_prices.area` deixa de ser usada pelo webhook. Os campos `commission_products.area` e `stripe_prices.area` permanecem nas tabelas (são usados por comissionamento e pela tela de Stripe Integration); apenas não dirigem mais o gráfico.
- `stripe-sync-recent` não precisa de mudança — ele apenas reinjeta eventos no webhook, então passa a usar a nova lógica automaticamente.

## Verificação

Após aplicar:

- Esperado: 86 `Sales` (76+10? não — os 10 viram `Parceria`), 73 `Produto`, 13 `CX` (7+6), 1 `Marketing`, 10 `Parceria`, 7 `desconhecida` (os atuais sem match) + recálculo dos 7 que viraram `Sales`.
- Conferir no painel `/insights/conversions` que a área `Parceria` aparece e que as conversões batem com o Mapa de Preços.

## Aprovação

Confirma que devo:
1. Usar `commission_price_map.price_id` (cruzando com `stripe_conversions.stripe_price_id`) como única fonte da área?
2. Sobrescrever `mrr` apenas quando `mrr_override` estiver preenchido (preservando o MRR atual quando o mapa não define override)?
