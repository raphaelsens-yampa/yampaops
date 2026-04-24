# Plano: Datas, Funil por Safra, Relatórios e Tags

Quatro mudanças, do menor para o maior impacto.

---

## 1. Datas na oportunidade

Hoje só temos `created_at`, `updated_at` e `estimated_close_date`. Vamos formalizar três datas de negócio:

| Campo | Significado | Como é populado |
|---|---|---|
| `opportunity_created_at` | Data de criação do deal (negócio) | Default `now()` na criação. Editável pelo admin. |
| `closed_at` | Data de encerramento (won OU lost) | Preenchida automaticamente por trigger quando a etapa muda para `is_won=true` ou `is_lost=true`. Limpa se sair dessas etapas. |
| `converted_at` | Data da conversão (virou won) | Preenchida automaticamente por trigger quando entra numa etapa `is_won=true`. |

Para deals já existentes, faremos backfill:
- `opportunity_created_at` ← `created_at`
- `converted_at` ← `updated_at` se a etapa atual for won
- `closed_at` ← `updated_at` se a etapa atual for won ou lost

**Onde aparece na UI:**
- `EditOpportunityDialog`: nova seção "Datas" com 3 campos. `opportunity_created_at` editável; `converted_at` e `closed_at` somente leitura (com nota "preenchido automaticamente ao mover para etapa de ganho/perda").
- `KanbanCard` (cards do pipeline): badge pequeno com data de criação no rodapé.

---

## 2. Funil de Pipeline filtrado por safra (mês de criação)

No Dashboard (`AdminDashboard.tsx`), o componente `PipelineFunnel` passa a receber um filtro de **safra mensal**.

- Novo seletor de mês ao lado do seletor de pipeline (formato "Abril 2026" com setas ← →).
- Default: **mês vigente**.
- Filtra `leads` por `opportunity_created_at` (com fallback para `created_at`) dentro do intervalo `[início_do_mês, fim_do_mês]` antes de calcular `funnelData`.
- Label do card muda para: "Funil de Pipeline · Safra de {mês}".

---

## 3. Sistema de Tags

### Schema novo
- `tags` — `id`, `name` (unique), `slug`, `color`, `is_system` (bool, protege as tags do Chatwoot de serem deletadas), `created_at`. RLS: admin gerencia, autenticado lê.
- `opportunity_tags` — `opportunity_id`, `tag_id`, `created_at`, `created_by`. PK composta. RLS: admin gerencia, vendedor pode adicionar/remover nas suas oportunidades, todos com acesso ao deal podem ler.

### Seed das 4 tags do Chatwoot (`is_system=true`)
- "Conversa criada" (azul)
- "Conversa atualizada" (cinza)
- "Conversa finalizada" (verde)
- "Mensagem respondida" (roxo)

### UI de gerenciamento
Nova página `/settings/tags` (admin) com lista, criar/editar/excluir (excluir bloqueado em system). Item no sidebar dentro de "Gestão" → "Tags".

### UI nas oportunidades
- `EditOpportunityDialog`: seção "Tags" com chips coloridos + popover de busca para adicionar/remover.
- `KanbanCard`: até 3 chips de tag (resto vira "+N"). Tags do Chatwoot ficam visíveis aqui — atende o pedido de "ver eventos do Chatwoot no card".

### Auto-tag pelo webhook do Chatwoot
Atualizar `chatwoot-webhook/index.ts`. Quando há `opportunityId` resolvido, mapear evento → tag e fazer `upsert` em `opportunity_tags` (idempotente):

| Evento Chatwoot | Tag aplicada |
|---|---|
| `conversation_created` | "Conversa criada" |
| `conversation_updated` | "Conversa atualizada" |
| `conversation_status_changed` | "Conversa finalizada" |
| `message_created` (incoming, do cliente) | "Mensagem respondida" |

`message_created` outgoing (do agente) **não** aplica tag — continua só gerando activity.

---

## 4. Seção de Relatórios

Nova rota `/reports` com sub-rotas. Item no sidebar em **Visão Geral** → "Relatórios" (ícone `FileBarChart`).

Layout: página com tabs no topo. Filtros globais (período + pipeline + canal) num topo sticky.

### 4 relatórios

**a) Oportunidades** (`/reports/opportunities`)
Tabela completa de deals com filtros (etapa, canal, vendedor, tag, intervalo de criação). Colunas: título, contato, empresa, etapa, MRR, vendedor, criação, conversão, encerramento, tags. Botão Exportar CSV.

**b) Conversões** (`/reports/conversions`)
- Funil de conversão por safra (reusa `PipelineFunnel`).
- Tabela: vendedor → criados, ganhos, perdidos, taxa conversão %, ticket médio MRR, ciclo médio (dias entre criação e conversão).
- Gráfico de barras: conversão por canal de origem.

**c) Performance** (`/reports/performance`)
- Ranking de vendedores: deals criados, deals ganhos, MRR ganho, atividades, taxa conversão.
- Velocidade média por etapa (dias parados em cada etapa antes de avançar) — calculado de `activities` + transições.
- Top motivos de perda (agrupa `loss_reason`).

**d) Por Tags** (`/reports/tags`)
- Cards por tag: nº de oportunidades, MRR total ativo, MRR ganho, taxa de conversão.
- Tabela cruzada: tag × etapa (matriz de contagem).
- Foco prático: ver impacto das tags do Chatwoot ("oportunidades com tag Mensagem respondida convertem X% mais").

Exportação CSV em todas as 4.

---

## Mudanças técnicas (resumo)

**Migrações SQL:**
1. `ALTER TABLE opportunities ADD COLUMN opportunity_created_at, closed_at, converted_at` + backfill.
2. Trigger `set_opportunity_dates_on_stage_change()` em `opportunities` (BEFORE UPDATE).
3. `CREATE TABLE tags`, `CREATE TABLE opportunity_tags` + RLS.
4. Seed das 4 tags do Chatwoot.

**Edge function:**
- `chatwoot-webhook/index.ts`: nova função `applyTagForEvent(opportunityId, eventName, messageType)` chamada nos handlers.

**Frontend:**
- `EditOpportunityDialog.tsx`: seção Datas + seção Tags.
- `NewOpportunityDialog.tsx`: campo opcional de Tags na criação.
- `KanbanCard.tsx`: chips de tag + data de criação.
- `PipelineFunnel.tsx`: aceitar prop de período (label).
- `AdminDashboard.tsx`: estado `selectedSafra`, seletor de mês, filtragem.
- Novo: `src/pages/Reports.tsx` (com tabs) + 4 sub-componentes em `src/components/reports/`.
- Novo: `src/pages/TagsSettings.tsx` para gerenciar tags.
- Novo: `src/hooks/useTags.ts`.
- `App.tsx`: rotas `/reports`, `/reports/*`, `/settings/tags`.
- `AppSidebar.tsx`: item "Relatórios" e "Tags".

**Sem mudanças:** schema de `chatwoot_conversations`, `activities`, `contacts`, lógica de comissões.
