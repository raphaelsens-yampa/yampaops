

# Integração Chatwoot → Yampa CRM

Sincronização **one-way** Chatwoot → Yampa via webhook. Toda conversa criada/respondida vira atividade no deal+contato correspondente, com matching por **email (1º) ou telefone (2º)**.

## Fluxo

```text
Chatwoot                             Yampa
┌─────────────────┐                  ┌──────────────────────────────┐
│ Conversation    │                  │                              │
│  - id           │   webhook       │  match contato/deal          │
│  - status       │ ───────────────►│  por email → senão telefone │
│  - contact:     │                  │                              │
│     email/phone │                  │  ┌────────────────────────┐  │
│  - custom_attrs │                  │  │ activity (deal+contato)│  │
│    tabulacao_*  │                  │  │ tipo: mensagem_enviada │  │
└─────────────────┘                  │  │  ou resposta_recebida  │  │
       │                             │  │ notes: id+status+tab   │  │
       │ message_created             │  └────────────────────────┘  │
       │ (incoming/outgoing) ────────┤                              │
       │                             │  ┌────────────────────────┐  │
       │ conversation_updated ───────┤  │ chatwoot_conversations │  │
       │ (status, custom attrs)      │  │  estado atual sincado  │  │
       │                             │  └────────────────────────┘  │
```

## Eventos do Chatwoot que vamos escutar

| Evento Chatwoot | O que faz no Yampa |
|---|---|
| `conversation_created` | Cria/atualiza linha em `chatwoot_conversations` + atividade `mensagem_enviada` no deal/contato |
| `message_created` (outgoing, agent) | Atividade `mensagem_enviada` no deal/contato |
| `message_created` (incoming, contact) | Atividade `resposta_recebida` no deal/contato |
| `conversation_updated` | Atualiza `status` e `tabulacao_atendimento` em `chatwoot_conversations`; registra atividade de mudança no histórico |
| `conversation_status_changed` | Atualiza `status` e registra mudança |

## Lógica de matching (chave: email → telefone)

```text
1. Extrai email e phone do payload (conversation.meta.sender)
2. Normaliza phone (só dígitos, com DDI)
3. Busca contato:
   a) WHERE email ILIKE :email → match
   b) senão WHERE regexp_replace(phone,'\D','','g') = :phone_digits → match
   c) senão → cria contato novo (name = sender.name, email, phone)
4. Busca deal aberto vinculado: opportunities WHERE contact_id = X AND is_active = true
   - Se houver 1 → registra atividade nele
   - Se houver vários → registra no mais recente (last_interaction_at)
   - Se não houver → registra só no contato (atividade sem opportunity_id)
5. Atualiza opportunities.last_interaction_at = now()
```

## Mudanças no banco

**Nova tabela `chatwoot_conversations`** (estado atual de cada conversa):
- `chatwoot_conversation_id` (bigint, PK)
- `chatwoot_account_id` (bigint)
- `chatwoot_inbox_id` (bigint, nullable)
- `status` (text) — `open`, `resolved`, `pending`, `snoozed`
- `tabulacao_atendimento` (text, nullable)
- `contact_id` (uuid, FK lógica → `contacts.id`, nullable)
- `opportunity_id` (uuid, FK lógica → `opportunities.id`, nullable)
- `contact_email`, `contact_phone` (texto guardado para auditoria)
- `last_message_at`, `created_at`, `updated_at`

**Extensão de `activities`**:
- Coluna `chatwoot_conversation_id` (bigint, nullable, indexada) para rastrear origem
- Coluna `chatwoot_message_id` (bigint, nullable, unique parcial) para idempotência

**Novo enum value** em `activity_type`:
- `'chatwoot_status_change'` (para registrar mudanças de status/tabulação)

**Tabela `integration_settings`** (já existe) — adicionar colunas:
- `chatwoot_base_url` (text)
- `chatwoot_account_id` (bigint)
- `chatwoot_webhook_secret` (text, nullable — Chatwoot padrão é por URL)
- `chatwoot_last_event_at` (timestamptz)

RLS: tabelas novas restritas a admin (manage) + tatico/admin (view), seguindo padrão das outras integrações.

## Edge functions

| Função | Tipo | O que faz |
|---|---|---|
| `chatwoot-test-connection` | privada | Pinga `GET /api/v1/accounts/{id}/profile/` com token; valida credenciais e retorna nome da conta |
| `chatwoot-webhook` | pública (`verify_jwt=false`) | Recebe webhook, opcional HMAC, faz match por email→phone, upsert em `chatwoot_conversations`, cria activities |

**Idempotência**: `activities.chatwoot_message_id` evita duplicar a mesma mensagem se Chatwoot reentregar o webhook.

**Como cada activity fica registrada**:
- `notes` = `Chatwoot #<conv_id> · status: <status> · tabulação: <tab>\n\n<conteúdo da mensagem>`
- `type` = `mensagem_enviada` | `resposta_recebida` | `chatwoot_status_change`
- `lead_id`/`opportunity_id` = deal matched (ou null se só contato)
- `chatwoot_conversation_id` + `chatwoot_message_id` populados

## Tela `/integrations/chatwoot`

Apenas admin. Layout em 4 seções (mesmo padrão do AC):

**1. Credenciais**
- Input "URL base do Chatwoot" (ex: `https://app.chatwoot.com`)
- Input "Account ID"
- Status: "Conectado como X" / "Falhou"
- Botão "Testar conexão"

**2. Webhook**
- Mostra a URL: `https://wdtdpyibiroufejijsmw.supabase.co/functions/v1/chatwoot-webhook` com botão copiar
- Instruções: "Em Chatwoot → Settings → Integrations → Webhooks → Add. Eventos: `conversation_created`, `conversation_updated`, `conversation_status_changed`, `message_created`"

**3. Atributo personalizado**
- Aviso explicando que o atributo `tabulacao_atendimento` deve existir como **Conversation Custom Attribute** no Chatwoot. Link para o doc oficial.

**4. Eventos recentes & erros**
- Últimas 20 conversas em `chatwoot_conversations` (id, status, tabulação, contato, deal vinculado, última msg)
- Erros recentes de `integration_sync_errors` filtrando `entity_type LIKE 'chatwoot_%'`

## Sidebar

Novo item em **Integrações → Chatwoot** (admin only) com `MessageCircle` icon e `StatusDot` (verde se `chatwoot_last_event_at` < 24h, cinza se nunca, vermelho se test_connection falhou).

## Visualização no deal/contato

As atividades já aparecem no histórico atual do deal (em `KanbanCard` e `EditOpportunityDialog`). Vamos:
- Adicionar ícone/badge `Chatwoot` quando `chatwoot_conversation_id` estiver presente
- No tooltip da activity, mostrar "Conv #X · status · tabulação"

## Secrets necessários

Após aprovação, vou pedir:
- `CHATWOOT_API_TOKEN` — Profile → Access Token (escopo Account)
- `CHATWOOT_WEBHOOK_SECRET` — opcional; só se você quiser validar HMAC (Chatwoot não envia por padrão)

`CHATWOOT_BASE_URL` e `CHATWOOT_ACCOUNT_ID` ficam em `integration_settings` (não-secretos, configuráveis pela tela).

## Limitações

- **One-way**: ações no Yampa não voltam para o Chatwoot (não envia mensagem, não muda status).
- **Matching**: se o contato no Chatwoot não tem email **nem** telefone que bate com Yampa, criamos um contato novo (sem deal vinculado).
- **Tabulação**: depende do atributo `tabulacao_atendimento` existir como Custom Attribute de Conversa no Chatwoot. Se não existir, fica null.
- **Mensagens em massa**: cada mensagem vira 1 activity. Conversas longas geram muitas linhas — aceitável para histórico, mas considerar se virar problema.
- **Reentrega**: duplicatas da mesma `message_id` são ignoradas via unique index.

## Plano de implementação

1. Migration: criar `chatwoot_conversations`, estender `activities` (chatwoot_conversation_id, chatwoot_message_id), estender `integration_settings`, adicionar enum `chatwoot_status_change`. RLS admin.
2. Pedir os 1-2 secrets.
3. Edge `chatwoot-test-connection`.
4. Edge `chatwoot-webhook` (público, matching email→phone, upsert + activities idempotentes).
5. Página `/integrations/chatwoot` com as 4 seções.
6. Adicionar rota em `App.tsx` e item em `AppSidebar` (admin only) com `StatusDot`.
7. Atualizar `KanbanCard`/`EditOpportunityDialog` para mostrar badge Chatwoot nas activities vindas dele.

