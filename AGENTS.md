# Architecture decisions
 
- Sidebar subsections are declarative labels on navigation items, rendered after permission filtering so empty subsections stay hidden and collapsed navigation retains direct icons.

- Tactical Upsell is sourced from `tactical_customer_upsell_actual`, which compares each customer's total current and previous MRR so plan swaps cannot create artificial growth.- Pré-churn vem do card 221 do Metabase (`pre-churn-ingest` → `metas_pre_churn`, upsert por company+data_ref+tipo, cron diário); a base repete o cliente por dia, então a análise deduplica por cliente+tipo+data prevista de churn.
- Planejamento de Campanhas prevê a partir dos realizados do Histórico de Campanhas (investimento líquido, conversão, MRR, LTV/CAC): Esperado = média, Otimista/Pessimista = quartis 75/25.
