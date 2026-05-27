# Sync de movimentação de deals do ActiveCampaign

Sim, dá pra capturar a data/hora de cada movimentação. O ActiveCampaign expõe isso em dois lugares:

- **Webhook `deal_*`** (já recebemos em `ac-webhook`) — dispara no instante que alguém move o card. Hoje a gente atualiza o `stage` da `opportunity`, mas não grava **quando** aconteceu.
- **API `GET /api/3/dealStageLogs?filters[deal]={id}`** — devolve o histórico completo de movimentações com `cdate` (timestamp). Usado pelo sync diário/manual para recuperar o que o webhook eventualmente perdeu.

## O que vai mudar

### 1. Banco

Migration adicionando colunas (sem mexer em estrutura existente):

- `opportunities.ac_stage_changed_at timestamptz` — última vez que o deal mudou de etapa no AC.
- `sales_campaign_contacts.ac_last_stage text` — slug da etapa atual do deal vinculado.
- `sales_campaign_contacts.ac_last_stage_at timestamptz` — quando essa etapa foi atingida.
- `sales_campaign_contacts.ac_synced_at timestamptz` — última sincronização rodada para a linha.
- `sales_campaign_contacts.matched_ac_deal_id text` — guarda o `ac_id` do deal vinculado (facilita o sync incremental).

### 2. Webhook em tempo real (`ac-webhook`)

Quando o evento for `deal_*` e a `stage` mudar em relação ao registro atual, gravar `ac_stage_changed_at = now()` junto com o `stage`. Nada novo no fluxo do usuário — só passa a registrar o quando.

### 3. Nova edge function `ac-sync-deal-stages`

Body opcional: `{ campaign_id?: uuid }`.

Fluxo:

1. Buscar `opportunities` com `ac_id` não-nulo. Se vier `campaign_id`, restringir aos `matched_opportunity_id` daquela campanha.
2. Para cada deal, chamar `GET /api/3/dealStageLogs?filters[deal]={ac_id}&orders[cdate]=DESC&limit=1` na AC.
3. Resolver o slug local via `pipeline_stages.ac_id` e atualizar `opportunities.stage`, `previous_stage` e `ac_stage_changed_at` com o `cdate` retornado.
4. Em seguida, fazer um update em lote em `sales_campaign_contacts` populando `ac_last_stage`, `ac_last_stage_at` e `ac_synced_at` a partir das opportunities sincronizadas.
5. Retornar `{ synced_deals, updated_contacts, errors }`.

Usa `AC_API_URL` + `AC_API_KEY` já configurados. Throttle simples (lotes de 20 deals com pequeno delay) pra não estourar rate-limit.

### 4. Cron diário 00:00

Via `pg_cron` + `pg_net` (já é o padrão do projeto), agendar chamada HTTPS para a edge function todo dia às 00:00 sem `campaign_id` (sincroniza tudo). Criado via `supabase--insert`, não migration, porque embute URL/anon key específicos.

### 5. Botão "Casar com Chatwoot/Stripe" passa a casar também com Active

A função `sales-campaign-match` (a que esse botão chama hoje) ganha um passo extra de matching com ActiveCampaign:

1. Para cada `sales_campaign_contact` sem `matched_opportunity_id`, procurar uma `opportunity` cujo `contact` tenha o mesmo `email_norm` ou `phone_digits` da linha da campanha.
2. Se achar, gravar `matched_opportunity_id` e `matched_ac_deal_id` (o `ac_id` daquele opportunity).
3. Logo na sequência, disparar `ac-sync-deal-stages` com o `campaign_id` atual pra já trazer o `ac_last_stage` / `ac_last_stage_at` na mesma ação do botão.

Resultado pro usuário: um clique em "Casar com Chatwoot/Stripe" passa a popular Chatwoot + Stripe + Active de uma vez.

### 6. UI — `src/pages/SalesCampaignDetail.tsx` (BaseTab)

- Novo botão na barra de ações: **"Sincronizar com ActiveCampaign"** (ícone `RefreshCw`), invoca `ac-sync-deal-stages` com o `campaign_id` atual. Mostra toast com `updated_contacts`.
- Nova coluna **"AC"** na tabela mostrando, quando houver, `ac_last_stage` em badge + data de `ac_last_stage_at` (`dd/MM HH:mm`). Tooltip com `ac_synced_at`.
- Indicador discreto no header da aba: "Última sync AC: {max(ac_synced_at)}".
- Filtro extra no dropdown já existente: **"Vinculado ao Active"** (linhas com `matched_ac_deal_id` não-nulo).

## Fora do escopo

- Histórico completo de movimentações por contato (guardamos só a última). Se precisar de auditoria full, dá pra criar uma `ac_stage_history` depois.
- Criação de deals novos no Active a partir da campanha — o fluxo é só leitura/match, não escrita.
