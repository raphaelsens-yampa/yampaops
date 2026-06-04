
# Integração BigQuery → Yampa (v1)

Conectar o GCP `yampa-app` (dataset `n8n_yampa`) ao CRM via Lovable Connector, com uma tela "BigQuery Insights" na seção **Visão Geral**, cache em Lovable Cloud, refresh agendado, e tabelas detalhadas de Free Trials, Pré-churn e Churn — controlada pelo gerenciador de Níveis de Acesso.

---

## 1. Conexão (Connector Gateway)

- Conectar o connector **BigQuery** via `standard_connectors--connect` (OAuth com Google).
- Token e refresh são gerenciados pelo gateway Lovable — sem service account no código.
- Variáveis injetadas automaticamente: `LOVABLE_API_KEY`, `BIGQUERY_API_KEY`.
- Project ID alvo: `yampa-app`.

## 2. Controle de acesso

- Adicionar nova área **`bigquery`** em `CRM_AREAS` (`AccessLevelManager.tsx`) e em `useAuth.tsx`.
- Permissões: view (ver dashboards) / edit (rodar refresh manual, editar queries salvas).
- Admin = full. Tático e Comercial = view por padrão (editável no gerenciador).

## 3. Schema (Lovable Cloud — cache)

Migration única criando 4 tabelas + GRANTs + RLS (somente leitura para `authenticated`, write via `service_role` na edge function):

```text
bq_queries              definições versionadas de cada consulta (slug, sql, schedule_cron, last_run_at)
bq_kpi_snapshots        snapshots de KPIs agregados (kpi_slug, period, value, breakdown jsonb, captured_at)
bq_customer_status      linhas detalhadas (customer_id, email, plan, status [free_trial|pre_churn|churn|active],
                                            trial_ends_at, mrr, last_event_at, raw jsonb, snapshot_at)
bq_refresh_log          histórico de execuções (query_slug, status, rows, bytes_billed, duration_ms, error)
```

`bq_customer_status` é truncada e reinserida a cada refresh (snapshot full). KPIs ficam em série temporal para gráficos de tendência.

## 4. Edge Functions

### `bigquery-discover` (admin only)
- Lista datasets/tabelas/colunas de `yampa-app` via `INFORMATION_SCHEMA` (consultas baratas).
- Usada na tela de admin para mapear colunas reais antes de fixar as queries.

### `bigquery-refresh`
- Roda os SQLs salvos em `bq_queries` contra o gateway BigQuery.
- Guardrails obrigatórios: `useLegacySql: false`, `maximumBytesBilled: "1073741824"` (1 GB), dry-run prévio quando `bytes_estimated > limite/2`.
- Persiste resultados em `bq_kpi_snapshots` / `bq_customer_status`.
- Loga em `bq_refresh_log` (sucesso, bytes faturados, duração, erro).
- Invocável manualmente (botão "Atualizar agora" — admin/edit) ou via cron.

### `bigquery-query` (admin only, fallback)
- Endpoint para consultas ad-hoc seguras (lista branca de tabelas, mesmos guardrails). Usado se quisermos um SQL playground futuro — fica preparado mas sem UI no v1.

### Agendamento
- `pg_cron` + `pg_net` chamando `bigquery-refresh` a cada 1h (configurável).
- SQL de agendamento aplicado via tool `supabase--insert` (contém anon key, não vai por migration).

## 5. Queries iniciais (placeholders — ajustamos com as colunas reais via `bigquery-discover`)

Salvas em `bq_queries` na seed:

- `mrr_monthly` → MRR atual + série mensal últimos 12m.
- `trials_active` → contagem de trials abertos + lista detalhada (vai para `bq_customer_status` com status=`free_trial`).
- `conversions_monthly` → trials convertidos / iniciados por mês (taxa).
- `pre_churn` → clientes ativos com sinais (sem login X dias, queda de uso etc.) → `bq_customer_status` status=`pre_churn`.
- `churn` → cancelados nos últimos 90 dias → `bq_customer_status` status=`churn`.

## 6. Frontend — `/bigquery-insights`

Página nova na seção **Visão Geral** do `AppSidebar` (ícone `Database`), gated por `area: "bigquery"`.

Layout em abas:

```text
┌─ Visão Geral ─────────────────────────────────────────┐
│ KPI cards: MRR | Trials ativos | Conversão (%) | Churn(%) │
│ Gráfico MRR (12m)        Gráfico Trials → Conversões  │
│ Última atualização: hh:mm  [Atualizar agora] (edit)   │
├─ Free Trials ────────────────────────────────────────┤
│ Tabela completa (busca, filtro por plano, export CSV) │
├─ Pré-churn ──────────────────────────────────────────┤
│ Tabela com motivo/score, ordenação por risco          │
├─ Churn ──────────────────────────────────────────────┤
│ Tabela com data de cancelamento, plano, MRR perdido   │
└──────────────────────────────────────────────────────┘
```

Componentes:
- `src/pages/BigQueryInsights.tsx`
- `src/components/bigquery/KpiCards.tsx`, `MrrChart.tsx`, `ConversionsChart.tsx`
- `src/components/bigquery/CustomerStatusTable.tsx` (reutilizada nas 3 abas via prop `status`)
- `src/components/bigquery/RefreshButton.tsx`
- `src/hooks/useBigQueryInsights.ts` (consome as tabelas de cache, não chama BigQuery direto)

Tudo usa tokens semânticos (`primary` #01B8E0, `secondary` #2D094C), Sora/Manrope, em PT-BR.

## 7. Fluxo de descoberta de schema (1ª execução)

1. Admin abre `/bigquery-insights` → vê banner "Mapear tabelas".
2. Botão abre modal que chama `bigquery-discover` e lista as tabelas de `n8n_yampa`.
3. Admin confirma quais tabelas representam clientes/assinaturas/eventos → eu ajusto os SQLs das 5 queries salvas em `bq_queries`.
4. Refresh inicial roda e popula o dashboard.

## 8. Segurança & custo

- Toda chamada ao BigQuery passa pela edge function (frontend nunca toca gateway).
- RLS: `bq_*` legíveis por `authenticated`; escrita só por `service_role`.
- `maximumBytesBilled` obrigatório; dry-run antes de queries amplas; alerta no `bq_refresh_log` se >50% do limite.
- Sem `SELECT *`; sempre colunas explícitas.

## 9. Detalhes técnicos

- Gateway URL: `https://connector-gateway.lovable.dev/bigquery/bigquery/v2/projects/yampa-app/queries`.
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${BIGQUERY_API_KEY}`.
- Edge functions em `supabase/functions/bigquery-*` com CORS padrão (`npm:@supabase/supabase-js@2/cors`).
- Validação Zod nos bodies das functions.
- Sem mudanças em código existente além de: `AppSidebar.tsx`, `App.tsx` (rota), `AccessLevelManager.tsx`, `useAuth.tsx`.

## 10. Fora do escopo (v2+)

- SQL playground UI (function já preparada).
- Escrita de volta no BigQuery.
- Enriquecimento automático de leads/contatos do CRM com dados BQ (pode ser próximo passo).

---

**Próximo passo após aprovar**: conectar o connector BigQuery (vou abrir o prompt), rodar a migration das 4 tabelas, criar as edge functions, e montar a página. A primeira run vai exigir você confirmar os nomes reais das tabelas no `n8n_yampa`.
