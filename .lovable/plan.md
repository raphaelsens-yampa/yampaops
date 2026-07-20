## Contexto atual (verificado)

- `stripe_conversions` já tem: `gross_amount`, `net_amount` (invoice.amount_paid), `discount_amount`, `mrr_net` (líquido normalizado pra mês), `coupon_*`, `stripe_invoice_id`, `net_amount_source` ('invoice' | 'price_fallback').
- Webhook (`stripe-webhook`) e backfill (`stripe-backfill-net-amounts`) já populam esses campos, e o `mrr` gravado agora reflete o líquido quando há invoice paga.
- Hoje **não existe validação cruzada**: se o webhook cair no meio do lookup da invoice, a linha entra com `net_amount_source='price_fallback'` (valor bruto) e ninguém sinaliza.
- Comissão é decidida por `commission_price_map(price_id → plan_name/payment_type)` + `commission_reference(plan_name, payment_type → %)`. Cupons não entram na chave — o único ajuste que o cupom faz hoje é no **valor base** (via `mrr_net`), não na **regra** aplicada.

## Escopo

Duas frentes independentes, entregues juntas:

### 1) Validação de consistência net_amount ↔ amount_paid

**Onde validar (mesma função em 3 pontos):**

- No `stripe-webhook`, logo após popular os campos da invoice.
- No `stripe-backfill-net-amounts`, para cada linha atualizada.
- Sob demanda, num novo botão "Validar consistência" na aba Stripe da tela de Conversões.

**Regras da validação** (roda pra cada `stripe_conversions` que tenha `stripe_invoice_id`):

```text
DIVERGENCIA se qualquer uma:
  - net_amount IS NULL AND stripe_invoice_id IS NOT NULL
  - discount_amount > 0 AND (coupon_id IS NULL AND promotion_code IS NULL)
  - net_amount_source = 'price_fallback' AND converted_at > (hoje - 30 dias)   -- deveria ter invoice
  - gross_amount IS NOT NULL AND net_amount IS NOT NULL
    AND ABS(gross_amount - discount_amount - net_amount) > 0.02
  - mrr_net IS NULL AND net_amount IS NOT NULL AND net_amount > 0
  - mrr > 0 AND mrr_net IS NOT NULL AND mrr_net > 0 AND ABS(mrr - mrr_net) > 0.02
    (mrr deveria estar espelhando mrr_net após a última migration)
```

Cada divergência é gravada em `integration_sync_errors` com:

- `entity_type = 'stripe_net_amount_mismatch'`
- `ac_id = stripe_conversions.id`
- `error_message` = motivo humano ("mrr não bate com mrr_net", "discount sem cupom identificado", etc.)
- `payload` = snapshot dos campos relevantes
- `resolved = false` (pra aparecer como pendência acionável)

**Recheque em tempo real no webhook:** se a divergência for do tipo "faltou invoice" ou "mrr desalinhado", o webhook grava a divergência **mas não bloqueia** a conversão — a linha entra e vai ser corrigida depois pelo backfill.

### 2) UI: fila de correção

Nova seção **"Divergências de valor líquido"** dentro de `StripeConversions.tsx` (visível pra admin/tatico):

- Cards com contagem por tipo de divergência.
- Tabela das linhas em `integration_sync_errors` do tipo `stripe_net_amount_mismatch` não resolvidas, com colunas: cliente, plano, converted_at, motivo, valores atuais (mrr, mrr_net, net_amount, discount).
- Ações por linha:
  - **"Rebuscar invoice"** → chama `stripe-backfill-net-amounts` com `{ ids: [conversion_id], force: true }` (novo parâmetro; hoje só aceita range).
  - **"Reaplicar comissão"** → chama RPC `apply_commission_from_stripe(id)` já existente.
  - **"Marcar como resolvida"** → soft close manual (`resolved = true`) para casos aceitos como corretos.
- Ação em lote no header: "Rebuscar todas" e "Validar consistência agora" (dispara a validação por todo o range visível).

### 3) Reestruturação da chave de comissão para conviver com cupons

**Diagnóstico:** o modelo atual (`price_id → plano/periodicidade → %`) funciona para valor, mas não distingue vendas do mesmo price com cupom que muda a natureza da oferta (ex.: cupom "Parceiro" com regra de comissão diferente). Precisamos permitir **regra específica por combinação price+cupom** sem quebrar o caminho comum.

**Mudanças de banco:**

- `commission_price_map`: adicionar coluna opcional `coupon_id text` (nullable, default NULL) e ajustar unique para `(price_id, COALESCE(coupon_id, ''))`.
- `commission_reference`: adicionar coluna opcional `coupon_id text` (nullable) para permitir % diferente por (plano, periodicidade, cupom).
- Nenhum registro existente muda de valor — todos ficam com `coupon_id = NULL` e continuam sendo o "match padrão".

**Nova lógica de resolução (na função `apply_commission_from_stripe`):**

```text
1. Tenta match exato: price_map WHERE price_id = X AND coupon_id = <cupom da conversão>
2. Se não achar, fallback pro match atual: price_id = X AND coupon_id IS NULL
3. Mesmo esquema em commission_reference (plano, periodicidade, cupom → % ; fallback pra cupom NULL)
```

**UI de mapeamento** (`ComissionamentoPriceMap.tsx` + `MapPriceDialog.tsx`):

- Novo campo opcional "Cupom" no diálogo de mapeamento (autocomplete alimentado pelos `coupon_id` distintos presentes em `stripe_conversions`).
- Linha da tabela ganha coluna "Cupom" (mostra "— (padrão)" quando NULL).
- No diálogo aparece um alerta quando o admin está criando um mapeamento sobreposto (mesmo price já tem regra sem cupom e essa nova é específica).

**Pergunta de decisão** (bloqueia só a parte 3):

- A regra especial por cupom deve mudar apenas o **percentual** (mantendo plano/periodicidade do match padrão), ou também pode redefinir plano/periodicidade/seller? Padrão proposto: **redefine tudo** (mais poderoso, o admin escolhe se preenche cada campo).

## Ordem de execução

1. Função utilitária de validação (SQL função + wrapper TS reutilizável no webhook e no backfill).
2. Instrumentação no webhook e no backfill + parâmetro `ids` no backfill.
3. Painel de divergências em `StripeConversions.tsx`.
4. Migration da nova chave `coupon_id` em price_map + reference (aditiva, sem quebra).
5. Atualização de `apply_commission_from_stripe` com o novo fallback.
6. UI do mapeamento de cupom.
7. Reprocessamento único das conversões existentes com cupom pra validar o novo caminho e gerar as primeiras divergências reais na fila.

## Arquivos afetados

- `supabase/functions/stripe-webhook/index.ts` — chama validação após popular invoice.
- `supabase/functions/stripe-backfill-net-amounts/index.ts` — aceita `ids: string[]` + chama validação.
- `supabase/functions/_shared/validate-net-amount.ts` — novo, lógica única de checagem.
- migration — coluna `coupon_id` em `commission_price_map` e `commission_reference`, nova versão de `apply_commission_from_stripe`, índice.
- `src/pages/StripeConversions.tsx` — nova aba/seção "Divergências" com ações.
- `src/components/comissionamento/ComissionamentoPriceMap.tsx` — coluna Cupom.
- `src/components/comissionamento/MapPriceDialog.tsx` — campo Cupom.

## O que NÃO muda

- Fluxo de webhook, dedup e resolução de vendedor.
- Comissões já revisadas manualmente (`manually_reviewed = true`) continuam travadas por campo.
- Metas continuam olhando `mrr` (agora já líquido).

## Confirmar antes de implementar

1. **Escopo da regra por cupom:** só percentual ou pode redefinir plano/periodicidade/seller? O CUPOM SÓ MUDA PERCENTUAL.
2. **Divergência "price_fallback recente"** — quer o threshold de 30 dias ou outro? (proposta: 30d). 30D 
3. **Ação "Marcar como resolvida"** — apenas admin, ou tatico também? (proposta: admin + tatico). ADMIN+TATICO