
## Objetivo

Adicionar, dentro da página **Integração Stripe**, uma seção onde o time Comercial cole uma lista de emails e receba, linha por linha, o motivo pelo qual cada um **não** apareceu em Conversões por Área / Metas — com a opção de **forçar** o registro manualmente para que passe a contar.

## UX (nova seção na página `/integrations/stripe`)

Card novo: **"Diagnosticar emails ausentes"**, abaixo do bloco de saúde.

1. `Textarea` "Cole emails (um por linha ou separados por vírgula)" + botão **Diagnosticar**.
2. Após a chamada, uma tabela com colunas:
   - Email
   - Status (badge): `Já contabilizado` / `Não encontrado na Stripe` / `Encontrado mas descartado` / `Pendente de mapeamento` / `Sem assinatura paga` / `Erro`
   - Detalhe (área, plano, MRR, datas, motivo textual)
   - Ação contextual:
     - `Pendente de mapeamento` → botão **Mapear price** (reaproveita `MapStripePriceButton`)
     - `Encontrado mas descartado` (MRR zerado, sub cancelada antes de pagar, etc.) → botão **Forçar registro** (abre dialog com área/MRR/plano editáveis)
     - `Não encontrado na Stripe` → botão **Forçar registro manual** (mesmo dialog, exige preencher tudo)
     - `Já contabilizado` → link para a linha (somente leitura)
3. Toast de sucesso + re-executa o diagnóstico após cada ação manual.

## Backend

### Edge function nova: `stripe-diagnose-emails`
- Input: `{ emails: string[] }` (até 100 por chamada, normaliza p/ lowercase).
- Para cada email:
  1. Consulta `stripe_conversions` por `customer_email = lower(email)`. Se houver linha com `converted_at` e `mrr > 0` → status `already_counted` + snapshot.
  2. Senão, `stripe.customers.search({ query: "email:'..."})` (ou `list` como fallback).
     - Sem customer → `not_in_stripe`.
     - Para cada customer: lista `subscriptions` (`status: all`) e, para cada uma, resolve `price_id`, consulta `commission_price_map`, calcula MRR (mesma lógica de `stripe-recover`), inspeciona `status`, `latest_invoice.paid`.
     - Classifica: `unmapped_price` (mrr ok, mas sem entrada no mapa), `zero_mrr`, `no_paid_invoice` (canceled/incomplete sem invoice paga), `discarded_other`.
  3. Retorna por email um array de "achados" (uma sub por achado) para a UI montar a linha.
- Apenas admin: valida JWT em código e checa `has_role(uid, 'admin')`.

### Edge function nova: `stripe-force-conversion`
- Input: `{ email, subscription_id?, price_id?, area, plan_name?, product_name?, mrr, registered_at?, converted_at?, note? }`.
- Faz `upsert` em `stripe_conversions` (usa `stripe_subscription_id` como chave quando informado; senão gera `stripe_event_id = manual_<uuid>`).
- Registra `integration_sync_errors` com `entity_type='stripe_manual_force'`, `resolved=true`, payload com quem forçou (`auth.uid()`) e a nota — fica como trilha de auditoria.
- Apenas admin.

Nenhuma alteração de schema. Tudo cabe nas tabelas existentes (`stripe_conversions`, `integration_sync_errors`, `commission_price_map`).

## Frontend

Novo componente `src/components/stripe/EmailDiagnosis.tsx`:
- Estado local (lista de emails, loading, results).
- Chama `supabase.functions.invoke("stripe-diagnose-emails", { body: { emails } })`.
- Renderiza a tabela + sub-dialog `ForceConversionDialog` que chama `stripe-force-conversion`.
- Após sucesso, refaz o diagnóstico daquele email.

Edit em `src/pages/StripeIntegration.tsx`: import e render do componente em um `Card` próprio, após o bloco de saúde / antes de "Eventos por dia".

## Detalhes técnicos

- `stripe.customers.search` requer índice habilitado por padrão — fallback para `customers.list({ email })` se a busca falhar.
- Para cada `subscription` recuperada usar a mesma normalização de MRR do `stripe-recover` (extrair em helper inline; sem refactor cross-function).
- Limites: máximo 100 emails por request; 10 subs por customer; corta após primeiro achado relevante por email para evitar ruído (mas mantém múltiplos se houver mais de uma sub).
- Mensagens em PT-BR coerentes com o resto do app.

## Arquivos

- `supabase/functions/stripe-diagnose-emails/index.ts` (novo)
- `supabase/functions/stripe-force-conversion/index.ts` (novo)
- `src/components/stripe/EmailDiagnosis.tsx` (novo)
- `src/components/stripe/ForceConversionDialog.tsx` (novo)
- `src/pages/StripeIntegration.tsx` (insere a seção)
