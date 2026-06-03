# Funil de Tags do Chatwoot por Campanha

Nova aba **"Funil de Tags"** dentro de cada campanha em Sales Campaigns, com etapas configuráveis baseadas nas labels do Chatwoot. Cada campanha pode ter seu próprio funil (ex.: `msg_mornos` → `duda_respondido_cliente_sales` → `venda_realizada`).

## Como funcionará

1. Em **Configuração da Campanha** o usuário define uma lista ordenada de etapas. Cada etapa tem:
   - Nome (ex.: "Mensagem enviada", "Cliente respondeu", "Vendido")
   - Cor
   - Conjunto de tags do Chatwoot
   - Modo de match: **TODAS as tags** ou **QUALQUER tag**
   - Flag "é conversão" (etapa final)

2. Na aba **Funil de Tags** mostraremos:
   - Visualização tipo funil (reaproveitando `PipelineFunnel`) com contagem e taxa de conversão entre etapas
   - Total da base, % atingido por etapa
   - Lista expandível de contatos em cada etapa
   - Botão "Atualizar" — usa o mesmo banner global de sync já existente

3. O cálculo casa cada contato da campanha (`sales_campaign_contacts`) com as labels presentes em **qualquer** `chatwoot_conversations` do mesmo contato (via email/phone, mesma lógica do `scc_compute_first_contact_for`). Um contato é alocado na **etapa mais avançada** cujo critério de tags é atendido pelo conjunto agregado de labels dele.

## Detalhes técnicos

### Banco
- Nova coluna `funnel_stages jsonb not null default '[]'` em `sales_campaigns`, formato:
  ```json
  [{"id":"uuid","name":"...","color":"#...","tags":["msg_mornos"],"match":"all|any","is_conversion":false,"position":0}]
  ```
- Nova função `scc_compute_tag_funnel(p_campaign_id uuid)` SECURITY DEFINER que retorna `(stage_id text, contact_count int, contact_ids uuid[])` agregando contatos da campanha por etapa mais avançada atendida. Reusa joins email/phone + `chatwoot_contacts.additional_emails/phones`.
- Nova função leve `scc_list_campaign_tags(p_campaign_id uuid)` retornando todas as labels distintas vistas nas conversas dos contatos da campanha (para autocompletar no editor).

### Frontend (`src/pages/SalesCampaignDetail.tsx`)
- Nova `TabsTrigger value="tag-funnel"` chamada **"Funil de Tags"**.
- Componente `TagFunnelTab`:
  - Carrega `campaign.funnel_stages` + chama RPC `scc_compute_tag_funnel`.
  - Renderiza `PipelineFunnel` com `stageOrder`/`stageLabels` derivados das etapas configuradas (count + 0 em MRR, ou MRR somado na etapa de conversão).
  - Sub-card "Contatos por etapa" colapsável com tabela paginada.
- Componente `TagFunnelEditor` em `ConfigTab`:
  - Lista drag-to-reorder de etapas, com inputs (nome, cor, multi-select de tags vindo de `scc_list_campaign_tags` + free text, toggle all/any, toggle conversão).
  - Salva via `update sales_campaigns set funnel_stages = ...`.

### Atualização
- Reaproveita o sync global existente (`CohortSyncContext`). Ao final do refresh, invalida a query `["scc-tag-funnel", id]` para recomputar automaticamente.

## Fora de escopo
- Não altera o cálculo do Cohort, Overview ou snapshots existentes.
- Não cria etapas globais — funil é exclusivo da campanha.
