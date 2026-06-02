## Objetivo
Adicionar uma visão na aba **Visão Geral** da campanha mostrando, lado a lado, a performance de **Atendimento IA** vs **Atendimento Humano**, mantendo a base total como uma única referência. A classificação de cada contato (IA, Humano ou ambos) será feita **manualmente na aba Evolução** agora, e ficará pronta para receber atribuição automática no futuro (integração com plataforma de IA).

## O que será entregue

### 1. Marcação manual IA × Humano (aba Evolução)
- Adicionar 2 colunas booleanas em `sales_campaign_contacts`:
  - `handled_by_ia` (default false)
  - `handled_by_human` (default false)
- Um contato pode ter os dois marcados (caso de handoff IA → Humano).
- Na **aba Evolução**, junto à lista/tabela de contatos:
  - Dois checkboxes por linha: "IA" e "Humano".
  - Ações em massa: selecionar contatos e marcar/desmarcar IA ou Humano de uma vez (útil para classificar lotes inteiros — ex: "todos esses 200 vieram do bot").
  - Filtro rápido: Todos / Só IA / Só Humano / Ambos / Não classificados.

### 2. Cards comparativos (aba Visão Geral)
Logo abaixo dos KPIs atuais, adicionar uma seção **"Atendimento: IA × Humano"** com dois cards lado a lado, mesmo visual dos cards existentes.

Cada card mostra, para o seu universo (IA ou Humano):

```text
┌──────────────────────────┐  ┌──────────────────────────┐
│ Atendimento IA           │  │ Atendimento Humano       │
│ 412 contatos (36% base)  │  │ 724 contatos (64% base)  │
│                          │  │                          │
│ Contatados   320         │  │ Contatados   257         │
│ Respostas     78  24%    │  │ Respostas     46  18%    │
│ Reuniões       1   0,3%  │  │ Reuniões       2   0,8%  │
│ Conversões     4   1,2%  │  │ Conversões     5   1,9%  │
│ MRR        R$ 720        │  │ MRR        R$ 1.040      │
└──────────────────────────┘  └──────────────────────────┘
```

- Percentuais calculados sobre o próprio subconjunto (ex.: respostas / contatados do bucket).
- Linha pequena de rodapé indicando "X contatos não classificados" se houver, com link para a aba Evolução.
- Contatos com **ambos** marcados entram nos dois cards (handoff = aparece nos dois lados, o que é o comportamento desejado para comparar funil completo de cada via).

### 3. Preparação para integração futura
- Adicionar coluna `ia_source` (text, nullable) em `sales_campaign_contacts` para no futuro identificar a origem do dado (ex.: "manual", "agent_x", "n8n"). Não usada na UI agora, só fica pronta para quando a integração com a plataforma de IA chegar — assim não precisamos de outra migration depois.

## Detalhes técnicos

### Migration
```sql
ALTER TABLE public.sales_campaign_contacts
  ADD COLUMN handled_by_ia boolean NOT NULL DEFAULT false,
  ADD COLUMN handled_by_human boolean NOT NULL DEFAULT false,
  ADD COLUMN ia_source text;

CREATE INDEX idx_sales_campaign_contacts_handled_ia
  ON public.sales_campaign_contacts (campaign_id) WHERE handled_by_ia;
CREATE INDEX idx_sales_campaign_contacts_handled_human
  ON public.sales_campaign_contacts (campaign_id) WHERE handled_by_human;
```
RLS atual já cobre updates pelos papéis admin/tatico, então nada novo é necessário.

### Frontend (`src/pages/SalesCampaignDetail.tsx`)
- Estender o `useMemo` que calcula os totais para também produzir `aggregateByBucket = { ia, human, unclassified }` agregando `contacted/replies/meetings/conversions/mrr` apenas sobre as linhas com a flag correspondente.
- Novo componente local `BucketSummaryCard` (IA/Humano) reaproveitando o estilo dos cards atuais.
- Na aba Evolução: dois `<Checkbox>` por linha (`handled_by_ia`, `handled_by_human`) com update otimista via supabase; barra de ações em massa quando houver seleção; um `Select` de filtro acima da tabela.
- Status e métricas existentes (contacted, replies, meetings, conversions, mrr) continuam derivando dos campos atuais (`status`, `mrr_generated`); apenas filtramos a base pelo bucket.

## Fora de escopo
- Atribuição automática IA × Humano (será feita quando a integração com a plataforma de IA estiver disponível — a coluna `ia_source` já fica preparada).
- Mudanças na aba Configuração ou nos relatórios de campanhas.
