# Cohort de Campanha: consulta em tempo real na Stripe

Sim, é possível. Hoje o botão "Pesquisar na base Stripe" chama a RPC `campaign_cohort_stripe_fill`, que só olha as tabelas locais (`stripe_conversions` / `stripe_churn_events`). Vamos trocar isso por uma consulta oficial à API da Stripe, e-mail por e-mail.

## Como vai funcionar

- O botão passa a chamar uma nova Edge Function que consulta a Stripe ao vivo para cada e-mail da lista da campanha.
- Para cada e-mail: busca o cliente na Stripe, lê as assinaturas dele e decide o status:
  - assinatura `active`/`past_due` → **Ativo** (com MRR do preço vigente, plano e data de início)
  - assinatura `trialing` → **Trial**
  - só assinaturas `canceled` → **Cancelado**, com a data de cancelamento mais recente
  - cliente inexistente ou sem assinatura → **Nunca assinou**
- O resultado é gravado em `campaign_cohort_results` com `source = 'stripe_live'` e `computed_at` atualizado, então cards, curva/matriz e tabela por cliente já refletem o dado novo.
- Regra de hierarquia mantida: a base de Ativos do Metabase continua sendo a fonte oficial no "Recalcular cohort". A consulta ao vivo é um complemento sob demanda; onde ela discordar, a tabela mostra a fonte usada ("Stripe (ao vivo)").
- Progresso e limites: a função processa em lotes com orçamento de tempo e devolve `next_offset`; o botão continua chamando até terminar, mostrando "Pesquisando… (X/Y)". Dá para cancelar.
- Escopo da busca: por padrão só os contatos hoje sem identificação ("Nunca assinou"/indefinido). Um item extra no botão permite "Reconsultar todos os e-mails" quando quiser reprocessar a lista inteira.

## Detalhes técnicos

- Nova Edge Function `supabase/functions/cohort-stripe-live/index.ts`:
  - valida JWT e papel admin/tático, valida body com Zod (`campaign_id`, `mode: 'missing' | 'all'`, `offset`, `batch_size`, `time_budget_ms`);
  - usa `STRIPE_SECRET_KEY` (já configurada) via `stripe@14`; busca cliente com `customers.search` (`email:'...'`) e fallback `customers.list({ email })`;
  - `subscriptions.list({ customer, status: 'all', expand: ['data.items.data.price'] })`; MRR normalizado por intervalo (mensal, anual/12, etc.);
  - grava em `campaign_cohort_results` via service role (upsert por `contact_id`), campos `status`, `mrr`, `plan_name`, `started_at`, `canceled_at`, `source='stripe_live'`, `snapshot_date = null`, `computed_at = now()`;
  - respeita rate limit da Stripe com pequena pausa entre chamadas e retry em 429.
- `src/lib/campaignCohort.ts`: adicionar `stripe_live: "Stripe (ao vivo)"` em `SOURCE_LABEL`.
- `src/components/campaign-history/CohortPanel.tsx`: `fillFromStripe` passa a invocar a função em loop paginado com contador de progresso e opção "Reconsultar todos"; remove o uso da RPC antiga (a RPC continua no banco, sem uso).
- Sem alteração de schema; nenhuma mudança em `ativos-ingest` nem na regra de prioridade da base de Ativos.

## Validação

Rodar em uma campanha com lista importada e conferir alguns e-mails conhecidos (um ativo, um cancelado, um inexistente) contra a Stripe, checando status, MRR e data de cancelamento na tabela por cliente.
