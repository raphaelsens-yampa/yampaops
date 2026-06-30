## Objetivo

Toda vez que uma conversa do Chatwoot for criada/atualizada, anexar uma nota no contato correspondente do ActiveCampaign com o link da conversa. Matching por **email** (chave primária) e **telefone** (fallback). Sem match → loga em `integration_sync_errors`, sem criar contato.

## Como funciona

**Formato da nota anexada no AC** (uma por conversa, em modo append):
```
[Chatwoot] Conv #1234 — 30/06/2026 14:32
https://app.chatwoot.com/app/accounts/1/conversations/1234
Status: open · Tabulação: qualificado
```

Para evitar duplicar a mesma nota em re-syncs, guardamos em uma tabela de controle `chatwoot_ac_note_links (conversation_id, ac_contact_id, ac_note_id, synced_at)` — se já existir registro para a conversa+contato, fazemos **UPDATE** da nota em vez de criar nova.

## Componentes

### 1. Tabela de controle (migration)
`chatwoot_ac_note_links` — vincula conversa Chatwoot ↔ nota no AC para idempotência.
- chatwoot_conversation_id (bigint)
- ac_contact_id (text)
- ac_note_id (text)
- match_method ('email' | 'phone')
- last_synced_at
- UNIQUE (chatwoot_conversation_id, ac_contact_id)

### 2. Edge function `chatwoot-to-ac-sync`
Recebe `{ conversation_id }`, faz:
1. Lê conversa de `chatwoot_conversations` (+ `chatwoot_contacts` para emails/telefones adicionais).
2. Procura contato no AC: `GET /api/3/contacts?email=...` → se não achar, `?filters[phone]=...`.
3. Sem match → grava `integration_sync_errors` (entity_type='chatwoot_ac_note', motivo) e retorna.
4. Com match → monta texto da nota; se já existe registro em `chatwoot_ac_note_links` para essa conv+contato, faz `PUT /api/3/notes/{id}`; senão `POST /api/3/notes` (relType=Contact) e grava o id.
5. Atualiza `last_synced_at`.

Usa secrets já existentes `AC_API_URL` e `AC_API_KEY`.

### 3. Trigger automático
No `chatwoot-webhook` (já existe), após upsert da conversa em eventos `conversation_created`, `conversation_updated`, `conversation_status_changed`, fazer fire-and-forget chamando `chatwoot-to-ac-sync`.

### 4. UI na seção Integração
Nova página `src/pages/ChatwootAcIntegration.tsx` (rota `/integracao/chatwoot-ac`) com:
- **Status**: total de conversas, quantas sincronizadas, quantas sem match.
- **Backfill**: botão "Sincronizar últimas N conversas" (input N, padrão 100) → chama edge function `chatwoot-ac-backfill` que itera por `chatwoot_conversations` ordenadas por `last_message_at` e invoca `chatwoot-to-ac-sync` para cada.
- **Re-sync individual**: input com conversation_id + botão.
- **Erros recentes**: tabela lendo `integration_sync_errors` filtrando `entity_type='chatwoot_ac_note'`.
- **Tabela de links recentes**: últimos 20 de `chatwoot_ac_note_links` com link pro AC e pro Chatwoot.

Acesso restrito a admin (segue padrão da `ChatwootIntegration.tsx`).

### 5. Entry no menu lateral
Adicionar item "Chatwoot ↔ AC" sob a seção Integrações no `AppSidebar.tsx`.

## Detalhes técnicos

- **Idempotência**: chave `(chatwoot_conversation_id, ac_contact_id)`. Re-rodar não duplica notas.
- **Match telefone**: usa `normalize_phone_digits()` (já existe). AC armazena com formatação variável; filtramos por sufixo de 11 dígitos via `filters[phone]`.
- **Múltiplos contatos AC com mesmo email**: pega o primeiro (AC permite duplicatas raramente; loga aviso se >1).
- **Rate limit AC**: 5 req/s. No backfill, throttle de 200ms entre chamadas.
- **Fallback assíncrono**: o webhook não bloqueia esperando AC; invoca a function com `supabase.functions.invoke` sem await em try/catch separado.

## Arquivos a criar/editar

**Criar:**
- `supabase/migrations/<ts>_chatwoot_ac_note_links.sql`
- `supabase/functions/chatwoot-to-ac-sync/index.ts`
- `supabase/functions/chatwoot-ac-backfill/index.ts`
- `src/pages/ChatwootAcIntegration.tsx`

**Editar:**
- `supabase/functions/chatwoot-webhook/index.ts` (disparar sync após upsert)
- `supabase/config.toml` (registrar 2 functions com `verify_jwt = false` se necessário — backfill protegido via JWT, sync interno via service role)
- `src/App.tsx` (rota nova)
- `src/components/AppSidebar.tsx` (link de menu)

## Fora de escopo
- Criar contato novo no AC quando não houver match (você optou por ignorar+logar).
- Sincronizar mensagens individuais — só o link da conversa.
- Sync reverso (AC → Chatwoot).