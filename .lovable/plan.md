## Módulo "Atendimentos Chatwoot" — Dashboard e Relatório de Tabulação

Criar uma seção independente, focada em analisar os atendimentos sincronizados via Chatwoot, com foco em **tabulação**, **SLA** e **performance por agente/time**.

---

### 1. Enriquecer dados sincronizados

Hoje `chatwoot_conversations` guarda só: id, status, tabulação, contato (id/email/phone), última msg. Faltam campos pedidos pelo relatório.

**Migração na tabela `chatwoot_conversations`:**
- `contact_name text` — nome do cliente
- `opened_at timestamptz` — abertura da conversa (de `created_at` do Chatwoot)
- `closed_at timestamptz` — preenchido quando status vira `resolved`
- `assignee_id bigint` — ID do agente no Chatwoot
- `assignee_name text`, `assignee_email text` — nome/email do agente
- `team_id bigint`, `team_name text` — time responsável
- Índices em `opened_at`, `closed_at`, `assignee_id`, `team_id`, `tabulacao_atendimento`

**Atualizar `supabase/functions/chatwoot-webhook/index.ts`:**
- Extrair `conversation.created_at` → `opened_at`
- Quando `status === "resolved"` e `closed_at` ainda nulo → setar `closed_at` (de `conversation.timestamp` ou `now()`)
- Extrair `conversation.meta.assignee` → `assignee_id/name/email`
- Extrair `conversation.meta.team` → `team_id/name`
- Continuar capturando `tabulacao_atendimento` (já existe)

Sem backfill automático: novos eventos preenchem; histórico antigo aparece com campos vazios até a próxima atualização da conversa.

---

### 2. Nova página `/atendimentos`

Rota nova em `src/pages/ChatwootReports.tsx`, registrada no `App.tsx` e adicionada ao `AppSidebar` (item "Atendimentos", ícone `MessageCircle`/`BarChart3`). Acesso: admin + tatico (mesma regra das outras telas analíticas).

**Estrutura da página:**

**(a) Filtros (topo, sticky):**
- Período (date range, default últimos 30 dias) — sobre `opened_at`
- Status: todos / open / pending / resolved
- Agente (multi-select, populado da lista distinta de `assignee_name`)
- Time (multi-select)
- Tabulação (multi-select)
- Busca livre (nome, email, telefone, nº conversa)

**(b) KPIs (cards no topo):**
- Total de atendimentos no período
- % resolvidos
- TMR — tempo médio de resolução (`closed_at - opened_at`)
- % com tabulação preenchida (qualidade do dado)

**(c) Dashboard (gráficos lado a lado):**
- **Distribuição por Tabulação** (barra horizontal, contagem)
- **Atendimentos por Agente** (barra) — empilhado por status
- **Atendimentos por Time** (barra)
- **Volume diário** (linha, opened vs resolved)

**(d) Tabela de Relatório (com paginação 25/pg):**
Colunas exatamente conforme pedido:
| Cliente | Email | Telefone | Ticket # | Aberto em | Fechado em | Agente | Time | Tabulação |

- Datas formatadas `DD/MM/AAAA HH:MM` (pt-BR)
- "Ticket #" linka para o Chatwoot (`{base_url}/app/accounts/{account_id}/conversations/{id}`)
- Vínculo a Deal/Contato exibido como badge inline na coluna Cliente quando `opportunity_id`/`contact_id` existir
- Ordenação por qualquer coluna; default `opened_at desc`

**(e) Exportação:**
- Botão "Exportar CSV" — gera arquivo respeitando os filtros aplicados (client-side, com `papaparse` ou string manual)

---

### Detalhes técnicos

- Frontend usa Supabase client direto (RLS já permite admin/tatico ler `chatwoot_conversations`)
- Gráficos com `recharts` (já presente via shadcn `chart.tsx`)
- Date range picker com `react-day-picker` já instalado
- Para listas distinct (agentes, times, tabulações nos filtros) — uma única query agregada inicial limitada ao período selecionado
- Se a lista crescer muito (>1000 linhas), paginar server-side via `range()`

### Arquivos afetados
- migração SQL (novos campos + índices)
- `supabase/functions/chatwoot-webhook/index.ts` (extração dos novos campos)
- `src/pages/ChatwootReports.tsx` (nova)
- `src/App.tsx` (rota)
- `src/components/AppSidebar.tsx` (item de menu)

### Fora de escopo
- Backfill histórico via API do Chatwoot (posso fazer numa segunda etapa criando uma função `chatwoot-backfill` que pagina `/conversations`)
- Edição/criação de tabulação direto pelo Yampa (mantém one-way Chatwoot → Yampa)
