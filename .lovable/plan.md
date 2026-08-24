# Aba Cohort no Histórico de Campanhas

Nova aba **Cohort** para medir, sob demanda, o status de assinatura dos clientes que vieram de cada campanha, cruzando a lista de e-mails de ativação da campanha com a base de clientes.

## Situação atual (verificada)

- `campaign_history` não tem nenhuma lista de contatos/e-mails — precisa ser criada.
- Todas as tabelas alimentadas pelo Metabase hoje (`metabase_daily_raw`, `metas_snapshot_diario`, `metas_price_daily`, `metas_novos_pagantes_daily`, etc.) são **agregadas**, sem e-mail. Então, do jeito que está, não há como cruzar por e-mail com o Metabase.
- Existe base por cliente com e-mail apenas do Stripe: `stripe_conversions` (e-mail, plano, price, MRR/MRR líquido, data, reativação) e `stripe_churn_events` (cancelamento, MRR perdido, motivo).

Por isso o cohort passa a ter **duas fontes**: a nova base de assinantes por e-mail vinda do Metabase (a ser enviada pela rotina diária) e a base Stripe local como complemento/fallback.

## Como vai funcionar

### 1. Lista da campanha (e-mails de ativação)
Na aba Cohort, para a campanha selecionada:
- **Importar planilha** (XLSX/CSV) com e-mail e, opcionalmente, nome, oferta e data de ativação, com pré-visualização e relatório de linhas inválidas/duplicadas.
- **Colar lista de e-mails** em um campo de texto (um por linha, vírgula ou ponto e vírgula).
- E-mails normalizados (minúsculo, sem espaços) e únicos por campanha; possibilidade de remover linhas e reimportar sem duplicar.

### 2. Base de assinantes por e-mail (Metabase)
Nova base por cliente, atualizada pela rotina diária do Metabase, com: e-mail, id do cliente, status da assinatura (ativo/cancelado/trial), plano/oferta, MRR, origem (4blue/yampa), data de início, data de cancelamento e data do snapshot. É idempotente por (data do snapshot + e-mail), no mesmo padrão dos ingests atuais.

### 3. Cruzamento e visão da aba
- **Cards de status atual**: total da lista, encontrados na base, ativos, cancelados, nunca assinaram, MRR ativo hoje, MRR perdido e % de retenção.
- **Curva de cohort**: retenção M0..M12 a partir da data de ativação (clientes ativos e MRR retido por mês), em gráfico e tabela.
- **Tabela por cliente**: e-mail, nome, plano, MRR, status, data de ativação, data de cancelamento, origem e fonte do dado (Metabase ou Stripe), com busca, filtros por status e exportação CSV/XLSX.
- Botão **"Recalcular cohort"** que refaz o cruzamento sob demanda e mostra a data/hora do último cálculo.

### 4. Regra de precedência
Para cada e-mail: usa a base Metabase (snapshot mais recente) quando existir; se não existir, cai para o Stripe local (`stripe_conversions` + `stripe_churn_events`). A tabela indica sempre qual fonte foi usada, para auditoria.

## Detalhes técnicos

Banco (novas tabelas em `public`, com RLS e GRANTs, acesso admin/tático como no resto da seção):
- `campaign_cohort_contacts`: `campaign_id` (FK `campaign_history`), `email`, `email_norm`, `name`, `offer`, `activated_at`, `source_import_id`, único por (`campaign_id`, `email_norm`).
- `campaign_cohort_imports`: log de importações (arquivo, linhas totais/válidas/ignoradas, autor).
- `metabase_subscriber_base`: base por e-mail do Metabase (`snapshot_date`, `email_norm`, `customer_id`, `status`, `plan_name`, `price_id`, `mrr`, `origem_cliente`, `started_at`, `canceled_at`, `dedupe_key` único).
- `campaign_cohort_results`: resultado materializado do cruzamento por contato (`status`, `mrr`, `plan_name`, `started_at`, `canceled_at`, `source`, `computed_at`), para leitura rápida da aba.
- Função `public.campaign_cohort_refresh(p_campaign_id uuid)` (security definer) que recalcula os resultados aplicando a precedência Metabase → Stripe.

Backend:
- Nova Edge Function `metabase-subscribers-ingest`, autenticada por `CRON_SECRET` como as demais, recebendo `{ snapshot_date, rows[] }` e fazendo upsert idempotente em `metabase_subscriber_base`.

Frontend:
- `src/pages/CampaignHistory.tsx`: nova sub-aba **Cohort**.
- `src/components/campaign-history/CohortPanel.tsx` (cards + curva + tabela), `CohortListDialog.tsx` (importar planilha / colar e-mails), `CohortRetentionChart.tsx` (Recharts) e helpers em `src/lib/campaignCohort.ts` (normalização de e-mail, buckets M0..M12, retenção, export).
- Segue os tokens de design e o padrão de painéis colapsáveis já usados na seção.

## Validação

Importar uma lista de e-mails de uma campanha, rodar "Recalcular cohort" e conferir ativos/cancelados e MRR contra a base Stripe; depois, com a primeira carga da base de assinantes do Metabase, confirmar que a fonte muda para Metabase e os números batem com a visão de Metas.

## Fora de escopo

Consulta ao vivo na API do Stripe por e-mail (pode ser adicionada depois como refresh pontual).
