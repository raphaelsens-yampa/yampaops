
# Auditoria Inteligente de Atendimentos

Sistema que analisa **todos os atendimentos resolvidos** do Chatwoot via IA (Lovable AI / Gemini) em um job diário, classifica qualidade em três dimensões (tom de voz, risco de churn/concorrentes, aderência a playbook+SLA) e expõe um dashboard com ranking por atendente e fluxo de revisão de flags.

## 1. Modelo de dados (nova migration)

**`chatwoot_audit_runs`** — execuções do job diário
- `id`, `started_at`, `finished_at`, `period_start`, `period_end`
- `total_conversations`, `analyzed`, `failed`, `status` (running/done/error)
- `triggered_by` (cron / manual / user_id)

**`chatwoot_conversation_audits`** — uma linha por conversa analisada
- `id`, `conversation_id` (FK lógica → `chatwoot_conversations.chatwoot_conversation_id`)
- `run_id`, `analyzed_at`, `model_used`
- `assignee_id`, `assignee_name`, `team_name`, `inbox_name` (snapshot p/ ranking estável)
- `overall_score` (0–100), `severity` (`ok` | `attention` | `critical`)
- `tone_score`, `tone_flags` (jsonb: trechos + categorias: palavrão, ironia, grosseria)
- `churn_risk_score`, `churn_signals` (jsonb: cliente irritado, ameaça cancelar, mencionou concorrente X)
- `playbook_score`, `playbook_checks` (jsonb: saudação ✓, identificação ✓, despedida ✗, ofereceu ajuda extra ✗, SLA ok)
- `summary` (texto curto da IA), `message_count`, `transcript_hash` (evita re-análise)
- `review_status` (`pending` | `confirmed` | `false_positive` | `dismissed`)
- `reviewed_by`, `reviewed_at`, `review_notes`

**`chatwoot_audit_settings`** (1 linha)
- Listas de keywords (concorrentes, palavrões), prompt customizável, modelo (default `google/gemini-2.5-flash`), thresholds de severidade, itens do playbook (checklist editável).

RLS: admin gerencia tudo; tatico read-only; sellers veem só os próprios audits.

## 2. Edge functions

**`chatwoot-audit-fetch-messages`** (helper interno)
- Recebe `conversation_id`, busca mensagens via `GET /api/v1/accounts/{id}/conversations/{id}/messages`, retorna transcrição limpa (filtra notas privadas, ordena por timestamp, marca `agente:` / `cliente:`).

**`chatwoot-audit-run`** (job principal, agendável)
- Parâmetros: `since`, `before`, `limit`, `force` (re-analisa).
- Lista `chatwoot_conversations` com `status='resolved'` no período, faz LEFT JOIN com `chatwoot_conversation_audits` e processa apenas os pendentes.
- Cria registro em `chatwoot_audit_runs`.
- Para cada conversa em batch (concorrência ~5):
  1. Busca transcrição via helper.
  2. Aplica pré-filtros locais (keywords de concorrentes/palavrões) → entra no contexto da IA.
  3. Chama Lovable AI com **prompt estruturado** + `tools` para devolver JSON validado (Zod) com os 3 scores, flags, trechos citados, sumário e severity.
  4. Faz upsert em `chatwoot_conversation_audits` (chave `conversation_id`).
- Atualiza `chatwoot_audit_runs` no fim.
- Trata 429/402 com backoff e log em `integration_sync_errors`.

**`chatwoot-audit-analyze-one`** (sob demanda)
- Reanalisa uma conversa específica a partir do dashboard (botão "Reanalisar").

**Cron**: pg_cron diário 03:00 BRT chamando `chatwoot-audit-run` com `since=ontem`.

## 3. Tela `/atendimentos/auditoria` (nova)

Adiciona item no `AppSidebar` em "Atendimentos → Auditoria" (admin/tatico).

**Cabeçalho — KPIs**
- Conversas auditadas no período · Score médio · % críticos · % com flag de tom · % com risco de churn · Aderência média ao playbook.

**Filtros**
- Período (reusa `SafraSelector`/date range), atendente, equipe, inbox, severity, status de revisão, busca textual.

**Bloco "Ranking de Qualidade por Atendente"**
- Tabela ordenável: atendente, # auditadas, score médio, tom médio, churn médio, playbook %, % flags críticos, evolução vs período anterior (▲/▼).
- Top 3 e Bottom 3 destacados em cards.

**Bloco "Conversas com flags"**
- Lista paginada: badge de severity, atendente, score, dimensões com problema (chips), data, status de revisão.
- Linha clicável → `Sheet` lateral com:
  - Resumo da IA, scores das 3 dimensões, checklist do playbook, trechos citados (quote do cliente/agente), link para a conversa no Chatwoot.
  - Ações: **Confirmar flag**, **Marcar falso positivo**, **Descartar**, campo de notas, botão **Reanalisar**.

**Gráficos**
- Linha: score médio diário; barras: distribuição de severity; heatmap: flags por equipe × dimensão.

## 4. Configurações (`/configuracoes/auditoria`, admin)
- Editar listas de palavrões, concorrentes, itens do playbook (checklist), thresholds de severidade, modelo da IA. Gravado em `chatwoot_audit_settings`.

## 5. Detalhes técnicos relevantes

- **Modelo IA**: `google/gemini-2.5-flash` por default (custo/latência). Para conversas longas (>60 mensagens) escala para `gemini-2.5-pro`.
- **Prompt**: system prompt em PT-BR com persona de "auditor de QA de SAC fintech", pedindo JSON estrito; usa tool calling para garantir schema. Instrução explícita para citar trechos literais ao gerar flags (evita alucinação).
- **Idempotência**: `transcript_hash` (SHA-256 da transcrição) evita reanálise quando nada mudou; `force=true` ignora.
- **Custo controlado**: pré-filtro de keywords reduz tokens enviados; conversa truncada às 80 mensagens mais relevantes (primeiras + últimas + as que casarem keywords).
- **Backfill inicial**: botão na tela de configurações para rodar `chatwoot-audit-run` retroativo por intervalo escolhido (mesmo padrão do `chatwoot-backfill`).
- **Reuso**: aproveita `chatwoot_conversations` e a integração existente; sem mudança em webhook.

## 6. Entregas em ordem
1. Migration (3 tabelas + RLS + seed de `audit_settings` com defaults).
2. Edge functions: fetch-messages helper → audit-run → audit-analyze-one (deploy).
3. Cron diário.
4. Página `/atendimentos/auditoria` + Sheet de detalhe + ações de revisão.
5. Página de configurações (`/configuracoes/auditoria`).
6. Backfill inicial dos últimos 30 dias para popular o dashboard.

## Fora de escopo (decidido com você)
- CSAT inferido pela IA, amostragem parcial, execução em tempo real, feedback escrito ao atendente — podemos adicionar depois sem refazer a base.
