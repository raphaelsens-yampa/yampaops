## Objetivo

Hoje o webhook Stripe só persiste a conversão quando o email **bate** com um contato e existe deal ativo no pipeline padrão. Conversões de áreas **CX, Marketing, Produto, YampaFin** (e até vendas Comercial sem deal antes) ficam apenas em `stripe_events`/`integration_sync_errors` e não aparecem em lugar nenhum.

Vamos:
1. Persistir **toda conversão** Stripe numa tabela própria (`stripe_conversions`), classificada por área via `price_id`.
2. Criar página **"Conversões por Área"** (admin) com gráfico, tabela, exportação e filtros de período + safra.

---

## 1. Banco de dados (migration)

Nova tabela `stripe_conversions` (uma linha por assinatura/conversão paga, idempotente por `stripe_subscription_id` ou, na ausência, `stripe_event_id`):

```
stripe_conversions
- id uuid pk
- stripe_event_id text         -- evento original (idempotência)
- stripe_customer_id text
- stripe_subscription_id text  -- preferencial p/ dedup
- stripe_price_id text
- customer_email text
- area text                    -- CX | Marketing | Produto | YampaFin | Sales | desconhecida
- product_name text            -- de commission_products / stripe_prices
- plan_name text
- mrr numeric default 0
- matched_opportunity_id uuid  -- se deu match com deal
- matched_contact_id uuid
- registered_at timestamptz    -- "safra": data de cadastro do contato (contacts.created_at) — fallback: data do evento
- converted_at timestamptz     -- timestamp do evento Stripe
- created_at timestamptz default now()
- UNIQUE (stripe_subscription_id) WHERE stripe_subscription_id is not null
- UNIQUE (stripe_event_id)      -- fallback de dedup
```

RLS: admin/tatico podem ler tudo; só webhook (service role) escreve.

Índices: `(area)`, `(converted_at)`, `(registered_at)`, `(matched_opportunity_id)`.

**Backfill**: rodar SQL que percorre `stripe_events` (todos os 197 já recebidos) e popula `stripe_conversions` extraindo `email`, `customer`, `price_id`, `subscription_id`, `created` do `payload`, resolvendo área/MRR via `commission_products` ou `stripe_prices`. Para `registered_at`, lookup em `contacts.created_at` por email (se não existir, usa `converted_at`).

---

## 2. Edge Function `stripe-webhook`

Após extrair email/customer/subscription/price, **antes** dos branches atuais de "no_contact_match"/"no_deal_match":

- Resolver área + MRR + product_name pelo `price_id`:
  - 1º `commission_products` (por `stripe_price_id`)
  - 2º `stripe_prices` (por `price_id`)
- `upsert` em `stripe_conversions` por `stripe_subscription_id` (ou `stripe_event_id`).
- Continuar o fluxo atual (match de deal etc.) — quando der match, atualizar `matched_opportunity_id`/`matched_contact_id` na linha de conversão.

Resultado: todas as conversões pagas ficam registradas, independente de match.

---

## 3. Frontend — nova página `/insights/conversions`

Rota admin/tatico (sidebar grupo **Visão Geral** → "Conversões por Área", ícone `PieChart`).

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Conversões por Área                            [Exportar ▾] │
│ Filtros: [Período conversão ▾]  [Safra cadastro ▾]  [Áreas ▾]│
├──────────────────────────────────────────────────────────────┤
│ KPIs: Total conversões | MRR total | Tickets médios | Áreas │
├──────────────────────────────────────────────────────────────┤
│ ┌─ Donut: % por área ─┐   ┌─ Barras: MRR por área ──────┐   │
│ │                     │   │                             │   │
│ └─────────────────────┘   └─────────────────────────────┘   │
│ ┌─ Linha: conversões/MRR no tempo (por área) ───────────┐   │
│ └────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│ Tabela: data | área | produto | plano | email | MRR | match │
└──────────────────────────────────────────────────────────────┘
```

**Filtros**:
- **Período de conversão**: `converted_at` entre datas (presets: este mês, últimos 30/90 dias, custom).
- **Safra**: `registered_at` entre datas (data de cadastro do contato — quando o lead nasceu).
- **Áreas**: multi-select (CX, Marketing, Produto, YampaFin, Sales, desconhecida).

**Gráficos** (recharts, padrão do projeto): Donut por área, Bar por área (MRR), Line temporal (conversões + MRR, séries por área).

**Tabela** (shadcn `Table`): paginada, ordenável, com badge de área, indicador "Match com deal? sim/não".

**Exportação** (`src/lib/`): CSV e XLSX (xlsx + file-saver, já no projeto) e PDF (jsPDF + autoTable, já no projeto), seguindo o mesmo padrão de `commissionExport.ts`.

---

## 4. Detalhes técnicos

- Hook `useStripeConversions(filters)` → react-query, monta query Supabase com `.gte/.lte` e `.in('area', ...)`.
- Cores por área via tokens HSL existentes; mapping `{ Sales, CX, Marketing, Produto, YampaFin, desconhecida }`.
- Sidebar: novo item em "Visão Geral" (admin/tatico).
- Sem alterações no fluxo de `stripe_events`/`integration_sync_errors` (continuam como auditoria).

---

## Entregas

1. Migration: tabela `stripe_conversions` + RLS + índices.
2. Backfill SQL dos eventos já processados.
3. Webhook atualizado para popular `stripe_conversions` sempre.
4. Página `/insights/conversions` com gráficos + tabela + filtros + exportação (CSV/XLSX/PDF).
5. Item de sidebar e rota.
