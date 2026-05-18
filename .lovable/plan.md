# Atividade de Agentes (Chatwoot + cruzamento AC)

Nova seção dedicada para acompanhar diariamente o trabalho de prospecção dos agentes via Chatwoot, e garantir que 100% da base de Freetrials do ActiveCampaign foi falada.

## Fase 1 — Conversas (rápido, com dados que já temos)

### Nova página: `/atividade-agentes`

Item novo no sidebar **"Atividade de Agentes"** (admin + tatico), com 3 abas:

**1) Dashboard diário por agente**
- Seletor de período (padrão: últimos 7 dias) + filtros por inbox/equipe.
- KPIs no topo: conversas atendidas no período, agentes ativos, % com resposta do cliente, TM1R médio.
- Tabela por agente × dia: conversas atendidas, conversas com resposta do cliente, taxa de resposta, TM1R médio.
- Gráfico de linha: volume diário total por agente (top N).
- Ranking de agentes por volume e por taxa de resposta.

**2) Lista de clientes contactados**
- Tabela paginada: contato (nome/email/telefone), agente, inbox, data da 1ª interação, status da conversa, respondeu? (sim/não), label de tabulação.
- Filtros: período, agente, inbox, "respondeu", label.
- Busca por nome/email/telefone.
- Export CSV.
- Link para abrir conversa no Chatwoot (reaproveita `useChatwootIntegration.buildConversationUrl`).

**3) Cobertura vs Freetrials AC**
Duas fontes de base, conforme escolha do usuário:
- **Upload CSV** (reaproveita `lead-csv-audit`): mantém o fluxo atual, mas com novo card de cobertura por agente: "X de Y leads do CSV foram contactados, faltam Z".
- **Direto do AC** (novo): nova edge function `ac-list-contacts` puxa contatos de uma lista/tag do AC (ex: "Freetrial") e cruza com `chatwoot_contacts` por email/phone_digits. Mostra: total da lista, contactados, não contactados (com export), distribuição por agente.

### Métricas — fórmulas (dados já existentes em `chatwoot_conversations`)

```text
conversas_atendidas        = COUNT WHERE assignee_email = X AND created_at::date = D
conversas_com_resposta     = mesmo filtro AND first_contact_message_at IS NOT NULL
                             (proxy: cliente respondeu)
tm1r_medio                 = AVG(tm1r_seconds) WHERE tm1r_seconds IS NOT NULL
taxa_resposta              = conversas_com_resposta / conversas_atendidas
```

> Limitação conhecida: hoje contamos **conversas** (uma por contato), não mensagens individuais. Se um agente mandou 5 follow-ups na mesma conversa, conta como 1. Fase 2 resolve.

## Fase 2 — Mensagens individuais (gancho preparado)

Para ter contagem real de "X mensagens enviadas por dia por agente":

- Nova tabela `chatwoot_messages`: `id`, `chatwoot_message_id`, `conversation_id`, `sender_type` (agent/contact), `sender_id`, `sender_email`, `content_hash`, `created_at`, `message_type`.
- Nova edge function `chatwoot-messages-sync` (cron diário + manual): paginação por conversation, salva mensagens novas.
- Webhook `chatwoot-webhook` passa a inserir mensagens em tempo real (já temos o webhook).
- Dashboard ganha toggle "Conversas / Mensagens enviadas" que troca a fonte da contagem.

Esta fase fica **planejada mas não implementada agora** — entrego o gancho (tabela + função stub) só se você confirmar depois da Fase 1.

## Stack técnica
- Página em `src/pages/AgentActivity.tsx` + componentes em `src/components/agent-activity/`.
- Queries via TanStack Query direto em `chatwoot_conversations` + `chatwoot_contacts`.
- Reaproveita: `MetricCard`, `Table`, `Tabs`, `useChatwootIntegration`, lógica de match de `lead-csv-audit`.
- Nova edge function `ac-list-contacts` (Fase 1, opção AC direto) usando `AC_API_KEY` já configurada.
- RLS: admin (ALL), tatico (SELECT) — sem novas tabelas na Fase 1.

## Fora de escopo da Fase 1
- Sync de mensagens individuais (Fase 2).
- Envio de mensagens pela plataforma.
- Cadência automática / lembretes de follow-up.
