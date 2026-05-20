# Sincronia Chatwoot: nunca inserir novos contatos + limpar inseridos

## Mudanças

### 1. Edge function `sales-campaign-sync-chatwoot-tag/index.ts`
- Remover por completo o bloco `add_missing` (etapa 4). A sincronia passa a apenas:
  1. Carregar conversas com a label.
  2. Indexar `chatwoot_contacts` por telefone/email.
  3. Iterar a Base da campanha e, para quem bater, atualizar `status` (respeitando hierarquia) e `matched_chatwoot_contact_id`.
- Resposta passa a omitir `inserted_new`.

### 2. Frontend `src/pages/SalesCampaignDetail.tsx`
- Remover a exibição de `inserted_new` na mensagem de resultado.

### 3. Limpeza de dados (migração SQL única)
Deletar de `sales_campaign_contacts` os registros inseridos pela sincronia:
```sql
delete from public.sales_campaign_contacts
where extra->>'source' = 'chatwoot_tag_sync';
```
Aplica a todas as campanhas (todos foram inseridos pela mesma rotina). Vamos preservar quaisquer alterações manuais? Como esses contatos foram criados pela sincronia há minutos e o usuário pediu para removê-los, o delete direto é seguro.

## Arquivos
- Editado: `supabase/functions/sales-campaign-sync-chatwoot-tag/index.ts`
- Editado: `src/pages/SalesCampaignDetail.tsx`
- Migração: delete dos contatos com `extra.source = 'chatwoot_tag_sync'`
