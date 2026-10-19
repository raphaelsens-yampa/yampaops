# Architecture decisions
- 4blue sync reads every source page in snapshot/id order before email/start-date deduplication and uses conflict-safe event inserts, so historical sales are not truncated or duplicated by daily runs.
- Conversões por Área uses shared pure filter/date/contribution helpers and one paginated period dataset for cards, charts, details and exports, so every slice reconciles without adding full upsell subscription MRR to growth.
- Audit AI model replacements preserve historical audit model identifiers; only current settings and selectable model references migrate, so past results remain traceable.
 
- Sidebar subsections are declarative labels on navigation items, rendered after permission filtering so empty subsections stay hidden and collapsed navigation retains direct icons.

- Tactical Upsell is sourced from `tactical_customer_upsell_actual`, which compares each customer's total current and previous MRR so plan swaps cannot create artificial growth.- Pré-churn vem do card 221 do Metabase (`pre-churn-ingest` → `metas_pre_churn`, upsert por company+data_ref+tipo, cron diário); a base repete o cliente por dia, então a análise deduplica por cliente+tipo+data prevista de churn.
- Planejamento de Campanhas prevê a partir dos realizados do Histórico de Campanhas (investimento líquido, conversão, MRR, LTV/CAC): Esperado = média, Otimista/Pessimista = quartis 75/25.
- OnePage Diretoria reads only in-system data (Metas Estratégicas company aggregates/goals, daily snapshots, pre-churn, conversions); no static or externally generated data, so it never goes stale.
