## Problema

Hoje o `mrr` da conversão vem de:

1. `commission_price_map.mrr_override` (valor fixo do mapa), **ou**
2. `stripe.prices.retrieve(priceId).unit_amount` normalizado pra mês.

Nenhum dos dois considera **cupom / desconto** aplicado no checkout. Cliente que fecha com 20% off entra pelo valor cheio do price. Isso quebra:

- comissão real (paga sobre valor bruto, não sobre o que a Yampa recebeu),
- forecast/receita real,
- relatórios de ticket médio.

## Solução

Sempre que houver um evento com invoice associada, buscar o valor **líquido efetivamente cobrado** da invoice no Stripe e persistir em novas colunas dedicadas. O `mrr` continua sendo a régua de plano (pra Metas e séries históricas comparáveis), e ganhamos campos separados de valor real recebido + desconto aplicado.

### Nova origem de dado

Para cada conversão, buscar a **invoice de referência**:

- `checkout.session.completed` → `session.invoice` (ou primeira invoice da subscription criada).
- `customer.subscription.created` → `stripe.invoices.list({ subscription, limit: 1 })` mais recente com `status='paid'`.
- `customer.subscription.updated` (troca de plano) → última invoice paga da sub após o update.
- `invoice.paid` → a própria invoice do evento.

Da invoice, extrair:

- `amount_paid` (centavos, já com desconto e antes de refund) → **valor líquido**
- `subtotal` → valor bruto antes do desconto
- `total_discount_amounts[].amount` (soma) → desconto total em R$
- `discount.coupon.id` / `coupon.name` / `coupon.percent_off` / `coupon.amount_off` → cupom aplicado
- `discount.promotion_code` (quando houver) → código promocional usado

### Cálculo de MRR líquido

Para o **MRR líquido** (recorrente), usar a linha da invoice referente ao price da conversão:

- `line.amount` = valor líquido dessa linha (já com desconto rateado por linha quando o cupom aplica ao item).
- Normalizar pela recorrência do price (mesma lógica atual: month/year/week/day).
- Se o cupom for `duration=once` ou `repeating`, o desconto **só vale nos primeiros ciclos** — guardar isso em `discount_duration` pra relatório saber que é temporário.

Se a invoice não existir (ex.: subscription criada em trial sem invoice paga ainda), cai no comportamento atual (valor do price) e marca `net_amount_source='price_fallback'`.

## Mudanças de banco (migration)

`ALTER TABLE public.stripe_conversions` — adicionar:

- `gross_amount numeric` — subtotal bruto da invoice (R$)
- `net_amount numeric` — valor efetivamente pago (R$)
- `discount_amount numeric NOT NULL DEFAULT 0`
- `mrr_net numeric` — MRR normalizado já com desconto
- `coupon_id text`
- `coupon_name text`
- `coupon_percent_off numeric`
- `coupon_amount_off numeric`
- `promotion_code text`
- `discount_duration text` — `once` / `repeating` / `forever` / `null`
- `discount_duration_in_months int`
- `stripe_invoice_id text`
- `net_amount_source text` — `invoice` | `price_fallback`

Index leve em `coupon_id` pra relatório futuro.

`stripe_conversions` **não** muda `mrr` — permanece igual. Comissionamento continua usando `mrr` (ou passa a usar `mrr_net` — ver decisão abaixo).

## Comissionamento: qual valor usar?

Duas opções, precisa decidir uma:

**A) Comissão sobre valor líquido (recomendado)** — `apply_commission_from_stripe` passa a usar `COALESCE(mrr_net, mrr)`. Vendedor não ganha em cima de desconto que a Yampa deu. Impacto: comissões futuras caem em contratos com cupom. Contratos já pagos ficam iguais (não retroage sem backfill).

**B) Comissão continua sobre `mrr` (valor de tabela)** — só adiciona os campos de líquido pra relatório/forecast. Vendedor mantém política atual.

Vou implementar **A** por padrão, com uma flag em `commission_settings.commission_base` (`gross` | `net`, default `net`), pra permitir reverter sem migration.

## Mudanças no webhook `stripe-webhook`

Depois de resolver `priceId` e antes de gravar em `stripe_conversions`:

1. Descobrir `invoiceId` conforme o tipo do evento (regras acima).
2. `stripe.invoices.retrieve(invoiceId, { expand: ['discounts', 'total_discount_amounts', 'lines.data.discounts'] })`.
3. Popular `gross_amount`, `net_amount`, `discount_amount`, `stripe_invoice_id`.
4. Se houver `invoice.discount` ou `invoice.discounts[0]`, popular `coupon_*`, `promotion_code`, `discount_duration`, `discount_duration_in_months`.
5. Calcular `mrr_net` a partir da linha do price (com desconto rateado) normalizado pra mês.
6. Setar `net_amount_source`.
7. Persistir no insert/update existente.

Se qualquer chamada falhar, logar em `integration_sync_errors` (`stripe_invoice_lookup_failed`, `resolved=true`) e seguir com fallback do preço — não bloquear a conversão.

## Backfill

Nova Edge Function `stripe-backfill-net-amounts` (admin-only, `verify_jwt=true`):

- Body: `{ from, to, limit, only_missing }`.
- Itera `stripe_conversions` sem `net_amount` (ou dentro do range), busca a invoice correspondente por `stripe_subscription_id` + `converted_at` (invoice mais próxima, `status=paid`), aplica a mesma lógica do webhook e atualiza as colunas novas.
- Não mexe em `mrr` nem em comissões já lançadas — apenas hidrata os campos novos.
- Botão opcional em `StripeConversions.tsx` (admin) pra disparar.

## UI

- `src/pages/StripeConversions.tsx`:
  - Nova coluna "Valor líquido" (`net_amount`) ao lado de "MRR".
  - Badge "Cupom" quando `coupon_id != null`, com tooltip mostrando `coupon_name`, `percent_off`/`amount_off` e `discount_duration`.
  - Filtro "Somente com cupom".
- `src/components/stripe/EditConversionDialog.tsx`:
  - Mostrar (read-only) `gross_amount`, `net_amount`, `discount_amount`, `coupon_name`, `promotion_code`, `stripe_invoice_id`.
  - Não permitir edição manual desses campos (vieram do Stripe).
- `src/pages/CommissionSettings.tsx`:
  - Novo select "Base de cálculo de comissão": Valor bruto (price) / Valor líquido (com desconto) — grava `commission_settings.commission_base`.

## O que NÃO muda

- Regras de dedup, `resolve_stripe_seller`, Metas (continuam olhando `mrr` como régua de plano), importação manual.
- `mrr` permanece; nada retroage sem o backfill explícito.
- Comissões já lançadas em `commission_conversions` não são recalculadas — só as novas usam a nova base.

## Arquivos afetados

- migration: nova (colunas + `commission_settings.commission_base` + ajuste em `apply_commission_from_stripe` pra ler `COALESCE(mrr_net, mrr)` conforme setting).
- `supabase/functions/stripe-webhook/index.ts` — lookup de invoice, cálculo líquido, gravação dos novos campos.
- `supabase/functions/stripe-backfill-net-amounts/index.ts` — nova.
- `supabase/functions/stripe-force-conversion/index.ts` — mesma lógica pra manter paridade.
- `src/pages/StripeConversions.tsx` — coluna, badge, filtro, botão de backfill.
- `src/components/stripe/EditConversionDialog.tsx` — bloco read-only com valores do Stripe.
- `src/pages/CommissionSettings.tsx` — seletor de base de comissão.
- `src/integrations/supabase/types.ts` — regenerado.

## Perguntas antes de implementar

1. **Comissão em cima do bruto ou do líquido?** (padrão do plano: líquido, com flag pra reverter). **Conversão em cima do Líquido.**
2. **Cupom `repeating` (ex.: 3 meses de desconto)** — quer que o `mrr_net` mostre o valor com desconto do primeiro ciclo, ou o MRR "estabilizado" pós-cupom? Recomendo: `mrr_net` = valor efetivamente cobrado agora; adicionar `mrr_net_after_discount_ends` opcional se precisar do outro. **Pode seguir com a sua recomendação**
3. **Backfill agora ou só daqui pra frente?** (posso deixar a função pronta e você decide quando rodar). **Rodar para as vendas de Maio em diante**