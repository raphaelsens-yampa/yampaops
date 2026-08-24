# Aba Cohort no Histórico de Campanhas

Nova aba **Cohort** para medir, sob demanda, o status de assinatura dos clientes que vieram de cada campanha, cruzando a lista de e-mails de ativação da campanha com a base diária de assinantes do Metabase.

## Situação atual (verificada)

- `campaign_history` não guarda nenhuma lista de contatos/e-mails — essa lista precisa ser criada.
- A base por cliente **já existe**: `metas_ativos_pagantes_daily`, alimentada pela Edge Function `ativos-ingest`, com `data_snapshot`, `email`, `company_id`, `status_assinatura` (ativo/cancelado/trial), `plano`, `nome_oferta`, `mrr`, `origem_cliente`, `data_inicio`, `data_cancelamento`, `tipo_churn`. É exatamente a chave que falta para o cruzamento por e-mail.
- Hoje essa tabela está **vazia**: a rotina de ingest ainda não rodou (falta cadastrar os segredos `METABASE_API_KEY` e `ATIVOS_INGEST_SECRET` e disparar a function). Sem a primeira carga, o cohort mostra "base indisponível" e usa apenas o fallback Stripe.
- Fallback local por e-mail: `stripe_conversions` (plano, price, MRR/MRR líquido, data) + `stripe_churn_events` (cancelamento, MRR perdido, motivo).

## Como vai funcionar

### 1. Lista da campanha (e-mails de ativação)
Na aba Cohort, para a campanha selecionada:
- **Importar planilha** (XLSX/CSV) com e-mail e, opcionalmente, nome, oferta e data de ativação, com pré-visualização e relatório de linhas inválidas/duplicadas.
- **Colar lista de e-mails** em um campo de texto (um por linha, vírgula ou ponto e vírgula).
- E-mails normalizados (minúsculo, sem espaços) e únicos por campanha; possível remover linhas e reimportar sem duplicar.

### 2. Cruzamento com a base do Metabase
Para cada e-mail da lista, busca o registro mais recente em `metas_ativos_pagantes_daily` (último `data_snapshot` disponível) e traz status, plano/oferta, MRR, origem, início e cancelamento. Quem não aparece na base cai para o Stripe local; quem não aparece em nenhuma das duas é marcado como "nunca assinou".

### 3. Visão da aba
- **Cards**: total da lista, encontrados na base, ativos, cancelados, em trial, nunca assinaram, MRR ativo hoje, MRR perdido e % de retenção.
- **Curva de cohort**: retenção M0..M12 a partir da data de ativação (clientes ativos e MRR retido por mês), em gráfico e tabela — usando o histórico de snapshots diários quando houver.
- **Tabela por cliente**: e-mail, nome, plano, MRR, status, data de ativação, data de cancelamento, origem e fonte do dado (Metabase ou Stripe), com busca, filtro por status e exportação CSV/XLSX.
- Botão **"Recalcular cohort"** que refaz o cruzamento sob demanda e mostra a data/hora do último cálculo e o `data_snapshot` usado.

### 4. Regra de precedência
Metabase (snapshot mais recente) → Stripe local. A tabela sempre indica a fonte usada, para auditoria.

## Detalhes técnicos

Banco (novas tabelas em `public`, com RLS e GRANTs, acesso admin/tático como no resto da seção):
- `campaign_cohort_contacts`: `campaign_id` (FK `campaign_history`), `email`, `email_norm`, `name`, `offer`, `activated_at`, `source_import_id`, único por (`campaign_id`, `email_norm`).
- `campaign_cohort_imports`: log de importações (arquivo, linhas totais/válidas/ignoradas, autor).
- `campaign_cohort_results`: resultado materializado do cruzamento por contato (`status`, `mrr`, `plan_name`, `origem_cliente`, `started_at`, `canceled_at`, `source`, `snapshot_date`, `computed_at`).
- Função `public.campaign_cohort_refresh(p_campaign_id uuid)` (security definer) que recalcula os resultados aplicando a precedência Metabase → Stripe.
- Nenhuma alteração em `metas_ativos_pagantes_daily` nem na function `ativos-ingest`. A tabela contém PII e continua não exposta diretamente ao cliente: a leitura acontece dentro da função security definer, e a aba só lê `campaign_cohort_results` (e-mails que o próprio usuário importou).

Frontend:
- `src/pages/CampaignHistory.tsx`: nova sub-aba **Cohort**.
- `src/components/campaign-history/CohortPanel.tsx` (cards + curva + tabela), `CohortListDialog.tsx` (importar planilha / colar e-mails), `CohortRetentionChart.tsx` (Recharts) e helpers em `src/lib/campaignCohort.ts` (normalização de e-mail, buckets M0..M12, retenção, export).
- Segue os tokens de design e o padrão de painéis colapsáveis já usados na seção.

## Validação

Importar a lista de uma campanha, rodar "Recalcular cohort" e conferir ativos/cancelados e MRR contra a base Stripe. Depois da primeira carga do `ativos-ingest`, confirmar que a fonte passa a ser Metabase e que os números batem com a visão de Metas.

## Fora de escopo

Consulta ao vivo na API do Stripe ou do Metabase por e-mail (pode ser adicionada depois como refresh pontual).
