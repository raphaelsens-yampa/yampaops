# Contar como conversão só a venda com pagamento confirmado na Stripe

## O que encontrei
- A venda **gestaosofolhas@gmail.com** (Time Financeiro, R$ 1.999, 28/10) entrou no sistema quando a assinatura foi **criada** na Stripe, antes do pagamento. O sistema não confere se a cobrança foi paga.
- O Metas Táticas **não tem uma regra de pagamento confirmado**. Essa venda só ficou de fora lá porque não tem vendedor. Se tivesse, entraria do mesmo jeito. Copiar a lógica do Metas Táticas não resolveria.
- Desde julho, 163 vendas entraram pela criação da assinatura, e 35 delas ainda não têm fatura ligada. Essas são as que podem estar com pagamento falho.

## O que muda
1. **Marcar o pagamento de cada venda.** Cada venda passa a guardar se foi paga: confirmada, pendente ou com falha.
   - A venda fica confirmada quando chega o aviso de fatura paga da Stripe.
   - A venda fica com falha quando chega o aviso de pagamento falho ou quando a assinatura fica incompleta ou expira.
   - Vendas do Metabase (4blue) e vendas antigas já pagas contam como confirmadas.
2. **Revisar as vendas existentes.** Uma rotina pergunta à Stripe a situação de cada venda ainda sem confirmação e grava o resultado. Ela também roda todos os dias para pegar pagamentos feitos com atraso.
3. **Uma regra para os três painéis.** Conversões por Área, Metas Operacionais e Metas Táticas passam a contar só vendas confirmadas. Assim os números dos três batem.
4. **Mostrar as pendentes.** Em Conversões por Área, um aviso mostra quantas vendas estão pendentes ou falharam, com a lista para conferir. Elas não entram nos totais.

## Detalhes técnicos
- Migração: coluna `payment_status` em `stripe_conversions` (`paid` | `pending` | `failed`, padrão `pending`). O backfill marca `paid` quando a linha tem `stripe_invoice_id` com `net_amount_source='invoice'` ou `attribution_source='metabase_4blue'`. Quem decide o resto é a rotina de reconciliação.
- `stripe-webhook`:
  - Em `invoice.paid`, marca `paid` na conversão da assinatura.
  - Em `invoice.payment_failed` e em `customer.subscription.updated`/`deleted` com status `incomplete`/`incomplete_expired`, marca `failed`.
  - Em `subscription.created`, guarda o `status` da assinatura (`active`/`trialing` com fatura paga já vira `paid`).
- Nova função de reconciliação: consulta assinatura e última fatura das linhas `pending`/`failed` dos últimos 90 dias. Roda uma vez agora e depois diariamente pelo cron.
- Helper único `isConfirmedConversion` em `src/lib/stripeConversions.ts` e filtro `.eq('payment_status','paid')` nas consultas de `StripeConversions.tsx`, `OperationalGoals.tsx`, `OperationalMonthReport.tsx`, `useTacticalData.ts`, `useLowTouchData.ts` e `TeamConversionsTable.tsx`.
- Teste em `src/test/` para a regra: pendente e falha não contam, paga conta.
- Decisão registrada no `AGENTS.md`.
