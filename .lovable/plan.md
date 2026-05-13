## Objetivo

Hoje só persistimos dados da entidade **Conversa** do Chatwoot (com `sender` embutido). Isso explica o baixo match com a base de Sales: 4.612 conversas mas só 1.719 com email e 1.877 com telefone. A API de Conversas não retorna `additional_attributes` nem identificadores secundários do contato.

A solução é tratar **Contatos do Chatwoot como entidade de primeira classe**, espelhando-os numa tabela própria com chaves bem normalizadas, e usar essa tabela como fonte canônica para qualquer match com a base de Sales (CSV audit, oportunidades, jornada do lead).

## Escopo

### 1. Nova tabela `chatwoot_contacts`

Espelho fiel do contato do Chatwoot, indexado para match rápido.

Colunas-chave:
- `chatwoot_contact_id` (bigint, único) — id na origem
- `chatwoot_account_id`, `identifier` (CRM externo)
- `name`, `email` (lower), `phone_e164`, `phone_digits` (somente dígitos, indexado)
- `additional_emails text[]`, `additional_phones text[]` (extraídos de `contact_inboxes` + `additional_attributes`) — indexados via GIN
- `company_name`, `city`, `country_code`
- `custom_attributes jsonb`, `additional_attributes jsonb`
- `inbox_ids bigint[]`, `conversations_count int`, `last_activity_at`, `created_at_chatwoot`
- `raw jsonb` (payload completo para reprocessamento futuro)
- `synced_at`, `created_at`, `updated_at`
- FK lógica: `matched_contact_id uuid` (link para `public.contacts` quando casamos com a base interna), `matched_at`

Índices: `(lower(email))`, `(phone_digits)`, GIN em `additional_emails`, GIN em `additional_phones`, GIN em `custom_attributes`.

RLS: admin gerencia; tatico vê.

### 2. Nova tabela `chatwoot_contact_match_log`
Auditoria das tentativas de match (por que casou ou não casou): `chatwoot_contact_id`, `method` (`email|email_secundario|phone|identifier|manual|none`), `matched_contact_id`, `matched_opportunity_id`, `confidence`, `notes`, `created_at`. Útil para debug igual ao `DebugMatchSection` que já existe.

### 3. Edge function `chatwoot-contacts-backfill`

Pagina `GET /api/v1/accounts/{id}/contacts?page=N&include_contact_inboxes=true` (até ~25k contatos hoje, ~1.000 páginas de 25). Suporta:
- `body: { page_start, max_pages, since }` para rodar em chunks via cron.
- Extrai e normaliza emails/phones secundários de `contact_inboxes[].source_id` e `additional_attributes`.
- Upsert em `chatwoot_contacts` por `chatwoot_contact_id`.
- Roda matching contra `public.contacts` (email primário → emails secundários → telefone normalizado → `identifier`) e grava no `chatwoot_contact_match_log`.

### 4. Edge function `chatwoot-contacts-sync-incremental`

Roda a cada N minutos via cron. Usa `last_activity_after` (timestamp) para puxar só o que mudou desde `max(synced_at)`.

### 5. Atualizar `chatwoot-webhook`

Adicionar handlers para `contact_created` e `contact_updated` → upsert direto em `chatwoot_contacts` + reprocessa match. Hoje o webhook só trata conversas/mensagens.

### 6. Reaproveitar nas funções existentes

- `chatwoot-backfill` (conversas): em vez de só guardar `sender` inline, guarda `chatwoot_contact_id` na conversa (nova coluna `chatwoot_contact_id bigint` em `chatwoot_conversations`) e busca dados do contato em `chatwoot_contacts`. Isso enriquece automaticamente as 2.893 conversas hoje sem email.
- `lead-csv-audit` e `lead-journey-report`: mudar a query de match para olhar primeiro `chatwoot_contacts` (com emails/phones secundários) antes de cair em `chatwoot_conversations`. Aumenta drasticamente o hit-rate.

### 7. UI — Seção "Contatos Chatwoot" em `/integrations/chatwoot`

Nova aba/card mostrando:
- Total de contatos sincronizados, % com email, % com telefone, % casados com base interna.
- Botão "Sincronizar agora" (chama backfill).
- Botão "Sync incremental" (chama incremental).
- Tabela paginada/filtro por: status do match (casado/não casado), inbox, com/sem email, com/sem telefone.
- Linha expansível mostrando: dados crus, emails/phones secundários, motivo do match (do log), e botão "Forçar match com contato X" (input de busca).

Tudo em frontend React (`src/pages/ChatwootIntegration.tsx` ou novo `ChatwootContacts.tsx` referenciado lá).

## Detalhes técnicos

**Normalização de telefone**: função SQL `public.normalize_phone_digits(text) returns text` (apenas dígitos, descarta < 8). Usada em trigger `BEFORE INSERT/UPDATE` para preencher `phone_digits` em `chatwoot_contacts` e idealmente também em `public.contacts` (migration de uma vez nos dados existentes).

**Match algorithm (ordem)**:
```text
1. lower(email) == lower(contact.email)
2. email IN additional_emails
3. phone_digits == contact.phone_digits  (sufixo de 10/11 dígitos para BR)
4. identifier == contact.id::text OU custom_attributes->>'crm_id'
5. nenhum → matched_contact_id = NULL, log "none"
```

**Volume**: 25k contatos × ~2KB/raw ≈ 50MB. Pagina de 25 → ~1.000 chamadas. Backfill inicial roda em ~10 chunks de 100 páginas (timeout edge ≈ 150s por chunk).

**Cron**: novo job a cada 15min chamando `chatwoot-contacts-sync-incremental` com `since=now()-1h` para tolerância.

## Arquivos

Migrations:
- `create_chatwoot_contacts.sql` — tabela + índices + RLS + função `normalize_phone_digits` + trigger.
- `add_chatwoot_contact_id_to_conversations.sql`.
- `create_chatwoot_contact_match_log.sql`.

Edge functions (novas):
- `supabase/functions/chatwoot-contacts-backfill/index.ts`
- `supabase/functions/chatwoot-contacts-sync-incremental/index.ts`

Edge functions (editadas):
- `supabase/functions/chatwoot-webhook/index.ts` — handlers `contact_*`.
- `supabase/functions/chatwoot-backfill/index.ts` — gravar `chatwoot_contact_id`.
- `supabase/functions/lead-csv-audit/index.ts` — usar `chatwoot_contacts` no match.
- `supabase/functions/lead-journey-report/index.ts` — idem.

Frontend:
- `src/pages/ChatwootContacts.tsx` (nova aba).
- `src/pages/ChatwootIntegration.tsx` — adicionar link/aba para contatos.

## Entrega faseada sugerida

1. **Fase 1 (foundation)**: migrations + `chatwoot-contacts-backfill` + UI básica de status. Roda backfill manual.
2. **Fase 2 (live)**: webhook + cron incremental + coluna em conversas.
3. **Fase 3 (match v2)**: refatorar `lead-csv-audit` e `lead-journey-report` para usar a nova fonte; UI de match manual.

Posso começar pela Fase 1 assim que aprovar o plano.