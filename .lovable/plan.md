

# Integração ActiveCampaign → Yampa CRM (com seleção de Pipelines)

Sincronização **one-way** AC → Yampa, **filtrada por Pipelines selecionados** no Yampa. Só vêm para cá os deals dos pipelines escolhidos, e os contatos/atividades vinculados a esses deals.

## Fluxo

```text
1. Admin abre /integrations/active-campaign
2. Conecta com a API do AC (URL + Key)
3. Sistema lista TODOS os pipelines do AC
4. Admin marca quais quer sincronizar (checkbox)
5. Salva seleção → roda sync inicial só dos pipelines marcados
6. Webhook filtra eventos: só processa se deal pertence a pipeline selecionado
```

```text
ActiveCampaign              Yampa
 ┌───────────┐              ┌─────────────────────────┐
 │ Pipeline A│ ✓ marcado ─► │ pipelines (ac_id=A)     │
 │ Pipeline B│ ✓ marcado ─► │ pipelines (ac_id=B)     │
 │ Pipeline C│ ✗ ignorado   │ (não sincroniza)        │
 │ Pipeline D│ ✗ ignorado   │                         │
 └───────────┘              └─────────────────────────┘
       │                              ▲
       │ Deal X (em A) ───────────────┤ ✓ entra
       │ Deal Y (em C) ───────────────┤ ✗ ignorado
       │ Contact do Deal X ───────────┘ ✓ entra
       │ Contact do Deal Y              ✗ ignorado
```

## Mudanças no banco

Colunas `ac_id` (text, unique nullable) em: `contacts`, `opportunities`, `pipelines`, `pipeline_stages`, `activities`.

Nova tabela `integration_settings` (singleton, admin only):
- `ac_account_url`, `ac_webhook_secret`
- `last_full_sync_at`, `sync_status`, `sync_log` (jsonb)

Nova tabela `ac_pipeline_selection`:
- `ac_pipeline_id` (text, PK) — ID do pipeline no AC
- `ac_pipeline_title` (text) — para exibir
- `is_selected` (boolean) — admin marca/desmarca
- `local_pipeline_id` (uuid, FK lógica → `pipelines.id`) — vinculado quando sincronizado
- `last_synced_at` (timestamp)

Nova tabela `integration_sync_errors`:
- `entity_type`, `ac_id`, `error_message`, `payload` (jsonb), `created_at`

RLS: tudo restrito a admin.

## Edge functions

| Função | Tipo | Função |
|---|---|---|
| `ac-test-connection` | privada | Pinga `/api/3/users/me`, valida credenciais |
| `ac-list-pipelines` | privada | Busca todos pipelines do AC e popula `ac_pipeline_selection` |
| `ac-sync-initial` | privada | Para cada pipeline marcado: sincroniza stages → deals → contacts dos deals → notes dos deals |
| `ac-webhook` | pública (`verify_jwt=false`) | Recebe webhook, valida HMAC, **filtra por pipeline selecionado**, faz upsert |

**Lógica de filtro no webhook**:
- Evento de `deal_*`: lê `pipeline` do payload, ignora se não está em `ac_pipeline_selection.is_selected = true`
- Evento de `contact_*`: ignora a menos que o contact já exista no Yampa (foi importado por algum deal)
- Evento de `note_*`/`task_*`: só processa se vinculado a deal já existente no Yampa

Mapeamento:
- AC `pipeline` → `pipelines` (só os marcados)
- AC `dealStage` → `pipeline_stages` (do pipeline pai)
- AC `deal` → `opportunities` (title, value→`estimated_mrr`, owner email→`consultant_id`)
- AC `contact` → `contacts` (apenas os referenciados pelos deals importados)
- AC `note`/`dealTask` → `activities`

User mapping: e-mail do AC owner → `profiles.email` → `profiles.user_id`. Sem match: registra em `integration_sync_errors`.

## Tela `/integrations/active-campaign`

Apenas admin. Layout em 4 seções:

**1. Credenciais**
- URL da conta AC + status da conexão
- Botão "Testar conexão"

**2. Seleção de Pipelines** (centro do plano)
- Após conexão OK, botão "Buscar pipelines do ActiveCampaign"
- Tabela com todos os pipelines AC: checkbox + nome + total de deals + status (sincronizado/pendente)
- Botão "Salvar seleção"

**3. Sincronização**
- Botão "Sincronizar agora" (roda `ac-sync-initial` só dos pipelines marcados)
- Barra de progresso por pipeline
- Última sincronização: data + contadores (X pipelines, Y deals, Z contatos, W atividades)

**4. Erros recentes**
- Tabela de `integration_sync_errors` com botão "tentar novamente"

Item no menu lateral (admin only): **Integrações → ActiveCampaign**.

## Secrets necessárias

Pediremos após aprovação:
- `AC_API_URL` — ex: `https://yampa.api-us1.com`
- `AC_API_KEY` — Settings → Developer no AC
- `AC_WEBHOOK_SECRET` — para validar HMAC

## Configuração no AC (você faz, eu te guio)

Após o deploy, mostro a URL do webhook na tela. Você cola no AC em **Settings → Webhooks**, eventos: `contact_add`, `contact_update`, `deal_add`, `deal_update`, `deal_pipeline_add`, `deal_stage_add`, `deal_note_add`, `deal_task_add`.

## Limitações

- **One-way**: edições no Yampa não voltam pro AC.
- **Pipeline novo no AC**: não é sincronizado automaticamente — admin precisa abrir a tela e marcar.
- **Despseleção**: desmarcar um pipeline **não apaga** dados já importados; só para de receber novidades. Botão extra "Remover dados deste pipeline" disponível.
- **Comissões**: trigger `generate_commission_on_won` só dispara se deal vier mapeado a um vendedor válido por e-mail.
- **Rate limit AC**: 5 req/s — sync respeita com throttle.

## Plano de implementação

1. Migration: `ac_id` nas 5 tabelas + criar `integration_settings`, `ac_pipeline_selection`, `integration_sync_errors` com RLS admin-only.
2. Pedir os 3 secrets.
3. Edge `ac-test-connection`.
4. Edge `ac-list-pipelines`.
5. Edge `ac-sync-initial` (paginada, filtra por pipelines marcados).
6. Edge `ac-webhook` (público, HMAC, filtro por pipeline).
7. Página `/integrations/active-campaign` com as 4 seções.
8. Item no `AppSidebar` (admin only).
9. Mostrar URL do webhook na tela com botão "copiar".

