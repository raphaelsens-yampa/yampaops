## Objetivo

Criar um painel `/insights/lead-journey` que mostra, por período e pipeline do ActiveCampaign, quantos leads entraram, quantos foram contactados no Chatwoot dentro de buckets de SLA, e quantos viraram clientes pagantes na Stripe — com tabela detalhada, série temporal e breakdown por consultor/origem.

## Fonte de dados (já existe, sem migration)

- **Leads AC** → `opportunities` filtrado por `pipeline_id` e `opportunity_created_at` no período. Casar via `contact_id` → `contacts (email, phone)`.
- **Contato Chatwoot** → `chatwoot_conversations` cuja `first_contact_message_at` (ou `opened_at`) seja a primeira por contato. Match por `contact_email` (lower/trim) e fallback por `contact_phone` (normalizado, só dígitos).
- **Cliente pagante Stripe** → `stripe_conversions` por `matched_opportunity_id` quando existir, senão por `customer_email`.

Toda a lógica vai numa **edge function** `lead-journey-report` que recebe `{ pipeline_id, start, end, sla_buckets }` e devolve agregados + linhas detalhadas. Faz join em memória (RLS friendly, sem view).

## Filtros do painel

- **Período** (date range, default últimos 30 dias) — aplicado a `opportunity_created_at`.
- **Pipeline AC** (select, default = pipeline padrão).
- **Consultor** (multi-select opcional).
- **Origem / sub_origin** (multi-select opcional).

## Buckets de SLA (fixos, exibidos sempre)

`< 24h`, `1–3 dias`, `4–7 dias`, `> 7 dias`, `Sem contato`.

Calculados como `first_contact_at - opportunity_created_at`. Lead sem nenhuma conversa cai em "Sem contato".

## Layout do painel

```text
┌─────────────────────────────────────────────────────────────┐
│ Filtros: [Período] [Pipeline] [Consultor] [Origem]          │
├─────────────────────────────────────────────────────────────┤
│ KPIs:  Leads | Contactados | % no SLA alvo | Pagantes | MRR │
├─────────────────────────────────────────────────────────────┤
│  Funil 3 etapas (cards grandes com setas e taxas)           │
│  [Leads AC] →  [Contactados Chatwoot] → [Pagantes Stripe]   │
│   1.499         1.180 (78,7%)            142 (12,0%)        │
├─────────────────────────────┬───────────────────────────────┤
│ Distribuição por SLA bucket │ Série temporal (linha)        │
│ (barra horizontal empilhada)│ entrada / contato / pagante   │
├─────────────────────────────┴───────────────────────────────┤
│ Breakdown: Tabs [Por consultor] [Por origem]                │
│   tabela: leads, contactados, %SLA, pagantes, conv%, MRR    │
├─────────────────────────────────────────────────────────────┤
│ Tabela detalhada por lead (paginada, exportar CSV)          │
│   nome | email | entrada | 1ª conversa | dias | bucket |    │
│   pagante? | MRR | consultor                                │
└─────────────────────────────────────────────────────────────┘
```

SLA alvo do KPI = `< 3 dias` (somando buckets `<24h` e `1–3 dias`).

## Implementação técnica

1. **Edge function `lead-journey-report`** (`supabase/functions/lead-journey-report/index.ts`)
   - Input validado com Zod.
   - Query 1: `opportunities` no período + pipeline + filtros, join em `contacts` para pegar email/phone.
   - Query 2: `chatwoot_conversations` cujo `contact_email` ∈ emails OU `contact_phone` ∈ phones, agrupando por contato pegando `MIN(first_contact_message_at)`.
   - Query 3: `stripe_conversions` por `matched_opportunity_id ∈ ids` UNION por `customer_email ∈ emails`.
   - Devolve: `{ kpis, funnel, sla_buckets[], timeseries[], by_consultant[], by_origin[], rows[] }`.

2. **Página `src/pages/LeadJourney.tsx`**
   - Reaproveita `MetricCard`, `PeriodNavigator`, `Tabs`, `Table`, recharts (já no projeto).
   - Componentes locais: `JourneyFunnel`, `SlaBucketsBar`, `JourneyTimeseries`, `JourneyBreakdownTable`, `JourneyRowsTable`.
   - Botão "Exportar CSV" gera a partir das `rows` em memória.

3. **Roteamento** em `src/App.tsx`: `/insights/lead-journey` (admin/tatico via `RequireArea area="dashboard"`).

4. **Sidebar** (`AppSidebar.tsx`): adicionar item "Jornada do Lead" dentro do grupo Insights/Relatórios.

## Fora de escopo

- Nenhuma migration ou alteração de schema.
- Não muda webhooks nem regras de matching já existentes (`stripe_conversions.matched_opportunity_id` continua sendo gerado pelo fluxo atual).
- Não mexe na auditoria IA.

## Ordem de execução

1. Edge function `lead-journey-report` + tipos.
2. Página `LeadJourney.tsx` com filtros, KPIs e funil.
3. Buckets SLA + série temporal.
4. Breakdown e tabela detalhada + export CSV.
5. Rota + sidebar.
