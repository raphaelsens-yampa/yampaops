# Revisão da tela "Conversões por Área"

## Como está a hierarquia de dados hoje (verificado)

```text
Stripe (invoice/subscription)
   ↓ stripe-webhook  (e stripe-recover / stripe-force-conversion)
   ↓ de-para de price_id: commission_price_map (price_id → area, offer_name, plan_name, payment_type, mrr_override)
stripe_conversions  ← fonte única da tela
   • area, plan_name, product_name  (congelados no momento da conversão)
   • mrr (bruto pelo price)  |  mrr_net (líquido, rateando cupom/desconto do invoice)
   • conversion_type: new | upsell | downgrade | renewal + delta_mrr + previous_mrr
   • is_reactivation (gap >= 2 meses), assigned_seller_id, attribution_source
   ↓
Tela StripeConversions.tsx (KPIs, pizza por área, série mensal, tabela, exports)
```

Estado real dos dados (auditoria executada agora):

- 100% das conversões têm `stripe_price_id` mapeado em `commission_price_map`; nenhuma área "desconhecida"; nenhum `mrr = 0`; sem duplicidade por invoice, por subscription/dia, nem price_id duplicado no de-para. A base está saudável.
- **380 conversões sem `mrr_net`** (em 2026: 55 em Sales/new, 35 em Produto/new, 9 em CX etc.). Ou seja, o valor líquido só existe em parte da base.
- **4 conversões com área divergente do de-para atual** (gravadas como Sales, hoje o price aponta Produto/Marketing): `price_1OVF5lDrhWjWTprTQUGk6eZf` (3 casos) e `price_1TOIxcDrhWjWTprT2TJYxYe6` (1 caso). A área é congelada na gravação e não há ação para reprocessar depois de remapear o price.
- **Três tabelas de de-para concorrentes**: `commission_price_map` (189 linhas, canônica, usada pelas functions), `stripe_prices` (43 linhas, área conflita com a canônica em pelo menos 2 prices) e `metas_de_para_price_id` (58 linhas, 57 sem área, sem RLS). Isso é a principal fonte de confusão de "de-para".

## O que corrigir

1. **Padronizar o valor exibido no MRR líquido.** Hoje a tela filtra por `mrr_net` mas todos os KPIs, a pizza por área, a série mensal e os exports somam `mrr` (bruto). Passar tudo para `coalesce(mrr_net, mrr)`, com um seletor "Bruto / Líquido" e um aviso quando houver linhas sem líquido no período (com atalho para o botão "Buscar valor líquido").
2. **Separar MRR novo de expansão/renovação.** Hoje `totalMrr` soma `new + upsell + downgrade + renewal` usando o MRR cheio da linha. Passar a exibir: New MRR (só `new`, incluindo reativações), Expansão (`delta_mrr` de upsell), Contração (`delta_mrr` de downgrade) e Renovação separada — e usar o mesmo critério na pizza por área e na série mensal, com toggle de métrica.
3. **Ação "Reprocessar áreas/planos pelo de-para"** (admin): reaplica `commission_price_map` sobre as conversões do período, corrigindo area/plan_name/product_name divergentes, com prévia de quantas linhas mudam antes de confirmar. Resolve os 4 casos atuais e os futuros remapeamentos.
4. **Painel de saúde do de-para** no topo da tela: prices sem mapeamento, conversões com área divergente, conversões sem `mrr_net`, cada um com o botão de correção correspondente.
5. **De-para único.** Tornar `commission_price_map` explicitamente canônica: a tela lê áreas só dela; `stripe_prices` deixa de ser usada para área (mantida apenas para nome/valor de referência) e `metas_de_para_price_id` é marcada como legado e removida do fluxo. Conflitos remanescentes ficam listados no painel de saúde.
6. **Fuso horário.** O agrupamento mensal usa `new Date()` no fuso do navegador; padronizar para `America/Sao_Paulo` como no restante do sistema, evitando conversões caindo no mês errado na virada.

## Detalhes técnicos

- `src/pages/StripeConversions.tsx`: novo helper `valueOf(row)` respeitando o modo bruto/líquido; `stats`, `byArea`, `timeSeries` e os três exports passam a usar esse helper e a segmentação por `conversion_type`; agrupamento de mês via formatador com timeZone São Paulo.
- Nova Edge Function `stripe-reapply-price-map` (`{ from, to, dry_run }`) → retorna `scanned` / `would_change` / `updated`, atualizando `area`, `plan_name`, `product_name` a partir de `commission_price_map`.
- Painel de saúde alimentado por consultas agregadas (count de divergências e de `mrr_net is null` no período).
- Sem mudança de schema; `metas_de_para_price_id` fica apenas sinalizada como legado (sem drop nesta etapa).
