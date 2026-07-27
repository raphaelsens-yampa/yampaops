
## Objetivo

Criar uma nova aba **"Dados Metabase"** em `/goals` que consome dados diários capturados pelo agente do Claude Code (via Metabase) e os compara com as metas cadastradas no Lovable. Serve como espelho de auditoria da qualidade dos dados do sistema atual.

## Modelo de dados (Supabase)

Duas tabelas novas, ambas com RLS + GRANTs completos.

### 1. `metabase_daily_raw` — landing/staging (uma linha por captura diária do Claude)
Ingestão bruta do agente; permite reprocessamento e auditoria.

Campos principais:
- `capture_date` (date) — dia de referência do dado
- `captured_at` (timestamptz) — quando o Claude escreveu
- `metric_key` (text) — ex.: `new_mrr`, `upsell_mrr`, `churn_mrr`, `downsell_mrr`, `net_mrr`, `deals_won`, `recuperado_mrr`, `campanha_mrr`
- `scope` (text) — `company` | `team` | `user` | `campaign`
- `team_id`, `user_id`, `campaign_id` (nullable) — dimensões
- `area` (text nullable) — sales/cs/campaign/financial (para casar com `goal_categories.area`)
- `category_id` (uuid nullable, FK `goal_categories`) — vínculo direto quando resolvido
- `amount` (numeric) — valor realizado
- `currency` (text default 'BRL')
- `source_url` (text) — link rastreável de venda / URL Metabase do card
- `raw_payload` (jsonb) — payload completo do Claude para debug
- `source` (text default 'metabase')
- `dedupe_key` (text unique) — `capture_date|metric_key|scope|user_id|team_id|campaign_id` para upsert idempotente

### 2. `metabase_monthly_agg` — tabela consolidada para performance de tela
Materializada a partir da raw, agregando por mês.

- `year_month` (date, dia 1) 
- `metric_key`, `scope`, `team_id`, `user_id`, `campaign_id`, `category_id`, `area`
- `realized_amount` (numeric)
- `deals_count` (int)
- `last_synced_at` (timestamptz)
- Unique: (`year_month`, `metric_key`, `scope`, `user_id`, `team_id`, `campaign_id`, `category_id`)

Função `refresh_metabase_monthly_agg(p_from date, p_to date)` que reagrega a `raw` na monthly. Trigger opcional na `raw` para incrementar; começamos com refresh manual + on-insert via edge function.

### RLS
- Leitura: qualquer usuário autenticado (dashboards compartilhados).
- Escrita: apenas `service_role` (o agente Claude autentica via service key na edge function `metabase-ingest`).

## Ingestão pelo Claude Code

Edge Function `metabase-ingest` (POST, autenticada por `CRON_SECRET` header):
- Body: `{ capture_date, rows: [{ metric_key, scope, user_id?, team_id?, campaign_id?, area?, category_id?, amount, deals_count?, source_url?, raw? }] }`
- Faz upsert em `metabase_daily_raw` por `dedupe_key`
- Chama `refresh_metabase_monthly_agg` para o mês afetado
- Retorna `{ inserted, updated, month_refreshed }`

Documentação para o agente Claude ficará em `.lovable/plan.md` (contrato JSON + exemplo de curl).

## UI — nova aba `TabsTrigger value="metabase"` em `src/pages/Goals.tsx`

Novo componente `src/components/goals/MetabaseTracking.tsx`:

### Filtros (topo)
- **Período**: Select (Dia, Semana, Mês, Personalizado) + date pickers quando "Personalizado"
- **Escopo**: `company | team | user | campaign` (mesmo enum já existente)
- **Categoria**: dropdown de `goal_categories` (agrupado por área como no cadastro)
- **Equipe**, **Vendedor**, **Campanha**: dropdowns dependentes do escopo

### Card KPI resumo
"Realizado (Metabase) vs Meta (Lovable)" com % atingido, seguindo o padrão de `GoalKpiCards` — inclui variação vs. o realizado do sistema (Stripe) para evidenciar divergências.

### Gráfico Realizado vs Meta
Bar chart empilhado (recharts) por mês do ano corrente: barras Meta / Realizado Metabase / Realizado Sistema (opcional toggle).

### Tabela pivot (como o print)
- Colunas: **Categoria** | (para cada mês do ano) **Meta** • **Realizado** • **%**
- Linhas: uma por categoria cadastrada em `goal_categories` filtrada pelo escopo/dimensão selecionados
- Cores condicionais no % (verde ≥100, âmbar ≥70, vermelho <70; invertido para categorias `goal_direction='lte'` como churn)
- Linha destacada de agregação por área (Sales, CS, Campanhas) — igual ao print com faixas azul/amarelo/ciano
- Última coluna: **YTD** (total)

Fonte:
- Metas: `goals` (mesma query já usada em `GoalsTracking`) agregadas por mês/categoria/escopo
- Realizado: `metabase_monthly_agg` filtrada pelos mesmos eixos

### Estado vazio
Quando não há dados na `metabase_monthly_agg`, exibir card explicativo com o contrato JSON de ingestão e o endpoint da edge function.

## Detalhes técnicos

- Todas as consultas passam pela `metabase_monthly_agg` (não pela `raw`) para performance.
- Ano exibido = ano do filtro de período; default = ano corrente.
- Metas mensais são derivadas de `goals` cujo `period_start`/`period_end` intersectam cada mês, rateando proporcionalmente quando o período é multi-mês (mesma lógica de `GoalsTracking`).
- Adicionar rota já está OK (a página existe); só adicionar `<TabsTrigger>` + `<TabsContent value="metabase">`.
- Sem alterações em cálculos existentes de Stripe/comissionamento — esta aba é read-only sobre a nova tabela.

## Entregáveis

1. Migração SQL: `metabase_daily_raw`, `metabase_monthly_agg`, função `refresh_metabase_monthly_agg`, RLS + GRANTs.
2. Edge Function `metabase-ingest` (autenticada via `CRON_SECRET`).
3. Componente `MetabaseTracking.tsx` + integração em `Goals.tsx` (nova tab).
4. Bloco de documentação em `.lovable/plan.md` com o contrato de ingestão para o agente Claude.

## Fora do escopo desta etapa
- Reconciliação automática divergência Metabase × Stripe (só exibimos lado a lado).
- Alertas quando a diferença Metabase × Sistema ultrapassar X%.
- Exportação XLSX da tabela pivot (fácil de adicionar depois).
