## Objetivo

Adicionar um botão na aba **Visão Geral** da Campanha para varrer a integração do Chatwoot e marcar como **Contatado** / **Respondeu** os contatos da base da campanha que possuem uma tag (label) específica no Chatwoot — selecionada pelo usuário.

## Fluxo de uso

1. Usuário abre a Visão Geral da campanha.
2. Clica em **"Sincronizar com Chatwoot"**.
3. Abre um diálogo com:
  - Select de **tag** (lista de labels distintas vindas de `chatwoot_conversations.labels`).
  - Opção: marcar como **Contatado** (default) ou **Respondeu** (default quando a tag indica resposta do cliente — sugerimos detectar a partir do nome, mas o usuário escolhe).
4. Confirma → sistema faz match e atualiza `sales_campaign_contacts.status`.
5. Cards **Contatados** e **Respostas** refletem os novos valores (já são reativos via realtime).

## Regras de match

Para cada contato da campanha (`sales_campaign_contacts` do `campaign_id`):

1. **Primário — telefone**: `phone_digits` igual a `chatwoot_contacts.phone_digits` (ou últimos 10–11 dígitos).
2. **Fallback — email**: `email_norm` igual a `chatwoot_contacts.email` (normalizado lowercase).
3. Considera "tem a tag" se **alguma** `chatwoot_conversations` desse contato contém a label selecionada em `labels[]`.

## Regras de atualização de status

- Se o status atual for `nao_trabalhado` → atualiza para o status escolhido (`contatado` ou `respondeu`).
- Se já está `respondeu`, `agendado` ou `convertido` → **não rebaixa**.
- Se escolheu `respondeu` e o atual é `contatado` → promove para `respondeu`.
- Não toca em registros sem match.

## Implementação técnica

**Edge function** `sales-campaign-sync-chatwoot-tag` (nova):

- Input: `{ campaign_id, label, target_status: "contatado" | "respondeu" }`.
- Carrega contatos da campanha (paginado).
- Para cada lote, busca em `chatwoot_contacts` por `phone_digits IN (...)` e por `email IN (...)`.
- Para os `chatwoot_contact_id` encontrados, busca `chatwoot_conversations` com `labels @> ARRAY[label]` (filtro server-side).
- Aplica update em `sales_campaign_contacts` respeitando a hierarquia de status.
- Retorna: `{ scanned, matched, updated_contatado, updated_respondeu }`.

**Endpoint auxiliar** para listar labels disponíveis:

- Query simples em `chatwoot_conversations`: `select distinct unnest(labels) as label order by 1`. Pode ser feita direto no client via `supabase.rpc` ou em uma function — usaremos uma RPC `get_chatwoot_labels()` (security definer, somente admin/tatico).

**Frontend (`src/pages/SalesCampaignDetail.tsx`)**:

- Novo botão na barra de ações da Visão Geral: "Sincronizar com Chatwoot" (ícone `RefreshCw`).
- Dialog com:
  - `Select` de labels (Combobox com busca via `Command`).
  - `RadioGroup` para target status (Contatado / Respondeu).
  - Botão "Executar" → chama `supabase.functions.invoke('sales-campaign-sync-chatwoot-tag', ...)`.
  - Mostra resultado (toast com contagens).
- Após sucesso, invalida queries da campanha (os cards já recalculam).

## Migration

Criar função `public.get_chatwoot_labels()` retornando `text[]` distintas, com `security definer` e check de role (admin OR tatico).

## Arquivos afetados

- **Novo**: `supabase/functions/sales-campaign-sync-chatwoot-tag/index.ts`
- **Migration**: `get_chatwoot_labels()` RPC
- **Editado**: `src/pages/SalesCampaignDetail.tsx` (botão + dialog + handler)

## Pergunta antes de implementar

Confirma estes pontos:

1. Quando aplicar a tag, devo permitir escolher entre marcar como **Contatado** ou **Respondeu** — ou sempre marcar como **Respondeu** (já que o exemplo `duda_respondido_cliente_sales` indica resposta)? SIM
2. A varredura deve ser **manual** (só quando clicar) ou também rodar automaticamente em algum intervalo? SIM, SÓ MANUAL  
  
- NÃO SOBREPOR REGISTROS  
- ADICIONAR O REGISTRO NA TABELA DE BASE QUANDO DER MATCH  
