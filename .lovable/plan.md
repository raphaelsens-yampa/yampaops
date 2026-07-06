## Objetivo

Fazer a tela **Comissionamento** usar a mesma inteligência de apuração do Stripe que **Metas** e **Conversões por Área** já usam (`stripe_conversions` + `commission_price_map` + `resolve_stripe_seller`), gerando comissões automaticamente. Permitir revisão manual travando o recálculo e manter o fluxo de importação CSV atual convivendo sem conflito.

## Como está hoje (resumo)

- **Metas / Conversões por área** consomem `stripe_conversions`, populado pelo webhook do Stripe com MRR normalizado, área/vendedor via `commission_price_map` e `resolve_stripe_seller`.
- **Comissionamento** hoje vive num universo paralelo (`commission_conversions`) alimentado só por CSV/entrada manual. Não lê `stripe_conversions`. Não tem trava de revisão. Não tem dedup.
- Os dois sistemas não se cruzam.

## O que muda

### 1. `commission_conversions` passa a ter origem explícita e trava de revisão

Alterações de schema (migração):

- Adicionar colunas em `commission_conversions`:
  - `source text NOT NULL DEFAULT 'manual'` — valores: `stripe` | `manual` | `import`.
  - `stripe_conversion_id uuid NULL REFERENCES stripe_conversions(id) ON DELETE SET NULL`.
  - `manually_reviewed boolean NOT NULL DEFAULT false` — trava o recálculo automático.
  - `reviewed_by uuid NULL REFERENCES auth.users(id)`, `reviewed_at timestamptz NULL`.
  - `override_fields text[] NOT NULL DEFAULT '{}'` — lista dos campos travados (ex.: `{seller,mrr,commission_pct}`).
- Backfill: linhas existentes viram `source='import'` se `import_id IS NOT NULL`, senão `source='manual'`.
- Índice único parcial: `UNIQUE (stripe_conversion_id) WHERE source='stripe'` — garante uma comissão automática por conversão Stripe.
- GRANTs mantidos; RLS existente cobre as novas colunas.

Nova tabela de auditoria de edição manual:

- `commission_conversion_edits` (id, conversion_id FK, edited_by, edited_at, diff jsonb) — mesma ideia do audit-trail que `stripe-update-conversion` já faz em `integration_sync_errors`.

### 2. Apuração automática a partir do Stripe

Nova Edge Function `commissions-apply-stripe` (assíncrona, `verify_jwt=true`, admin-only) que:

1. Lê `stripe_conversions` num intervalo (`from`, `to`, default: últimos 90 dias) ou por `id` específico.
2. Para cada linha:
   - Resolve regra em `commission_reference` via `commission_price_map` (`stripe_price_id` → `plan_name` + `payment_type`).
   - Vendedor = `stripe_conversions.assigned_seller_id` (fallback: `commission_price_map.seller_user_id`).
   - MRR = `stripe_conversions.mrr` (já normalizado pelo webhook).
   - `commission_pct` = `av_pct` se `payment_type='anual_avista'`, senão `commission_pct`.
   - `commission_amount = mrr × pct`.
   - `sale_month` = `date_trunc('month', converted_at)`.
   - `payment_month` = `sale_month + t_plus_months` (usa `commission_settings`, mesmo padrão do trigger antigo).
3. Upsert em `commission_conversions` por `stripe_conversion_id`:
   - Se linha não existe → INSERT com `source='stripe'`.
   - Se existe e `manually_reviewed=false` → UPDATE todos os campos calculados.
   - Se existe e `manually_reviewed=true` → **não** sobrescreve campos em `override_fields`; recalcula só o restante. Marca `recalc_skipped_reason='manual_review'` num log.
   - Se `commission_price_map` não mapeia → grava com `status='pending_mapping'`, `commission_amount=0`.
   - Se `requires_commission=false` no mapa → `status='calculated'`, `commission_amount=0`.
4. Retorna resumo (inserted, updated, skipped, pending_mapping).

Gatilho automático: função Postgres `apply_commission_from_stripe(conversion_id uuid)` disparada por trigger `AFTER INSERT OR UPDATE OF mrr, converted_at, assigned_seller_id, stripe_price_id ON stripe_conversions` — reaproveita a mesma lógica (versão SQL da Edge Function para os casos triviais; a Edge cobre backfill em lote).

Assim: **toda conversão Stripe nova/atualizada gera ou atualiza automaticamente a comissão correspondente**, respeitando a trava manual.

### 3. Convivência das três origens sem conflito

- **`source='stripe'`**: gerada pelo trigger/Edge acima. Chave: `stripe_conversion_id`.
- **`source='import'`**: CSV atual continua igual. Chave: `import_id` + linha. **Nunca** disputa `stripe_conversion_id` (fica NULL). O CSV é usado só para o que não vem do Stripe (planos legados, comissões avulsas, correções de meses fechados).
- **`source='manual'`**: entrada avulsa via `ManualConversionDialog`. Também com `stripe_conversion_id=NULL`.

Regras de UI/backend para evitar duplicidade percebida:

- No `Overview` e `Conversões`, adicionar filtro/badge por `source` (Stripe / Manual / Importado CSV).
- No importador CSV: avisar (banner amarelo) quando uma linha do CSV cair num `customer_email + sale_month` que já tem `source='stripe'`. Não bloquear — apenas marcar `origem_cliente='ajuste_manual'` para o auditor.

### 4. Revisão manual com trava

Alterações na UI:

- `ManualConversionDialog` (modo edit): adicionar switch **"Marcar como revisada manualmente (trava recálculo)"**. Quando ativado:
  - `manually_reviewed=true`, `reviewed_by=auth.uid()`, `reviewed_at=now()`.
  - `override_fields` = lista dos campos alterados nesta edição (detectados por diff).
- Nova ação **"Destravar recálculo"** na tabela (admin) → limpa `manually_reviewed` e `override_fields`, reaplica cálculo automático no próximo run.
- Toda edição grava linha em `commission_conversion_edits` com diff.
- Badge visual: linhas travadas ganham ícone de cadeado + tooltip "Editado manualmente por X em Y".

### 5. Tela de Comissionamento

Ajustes em `src/pages/Comissionamento.tsx` e componentes:

- Nova aba/seção **"Sincronizar do Stripe"** (admin), com:
  - Range de datas (`converted_at`).
  - Botão "Recalcular agora" → chama `commissions-apply-stripe`.
  - Progress + resumo (inserted/updated/skipped/pending).
- Aba `Conversões` (`ComissionamentoConversions`):
  - Nova coluna **Origem** (Stripe / CSV / Manual) com filtro.
  - Nova coluna **Revisão** (ícone cadeado se travada).
  - Botão "Ver no Stripe" (link para `/insights/conversions?id=…`) quando `source='stripe'`.
- Aba `Visão Geral` (`ComissionamentoOverview`): breakdown por origem.
- Aba `Importar`: mantém CSV atual; adiciona aviso de sobreposição com Stripe (item 3).
- Aba `Referência` e `Mapa de Preços`: sem mudança funcional; ganham indicador de "quantas conversões Stripe estão pendentes de mapeamento".

### 6. Consistência com Metas

Não há mudança em `stripe_conversions`, `resolve_stripe_seller`, `classify_stripe_conversion`, nem em `GoalsTracking`. Comissionamento passa a ser **derivado** da mesma fonte que Metas — quando um vendedor é reatribuído em `stripe_conversions` (via `stripe-update-conversion`), o trigger recalcula a comissão automaticamente (respeitando trava).

## Detalhes técnicos

**Migrações (schema only):**
1. Colunas novas + índice único parcial em `commission_conversions`.
2. Tabela `commission_conversion_edits` + RLS (admin RW, seller SELECT own).
3. Função SQL `public.apply_commission_from_stripe(uuid)` (SECURITY DEFINER) + trigger em `stripe_conversions`.
4. Backfill: `UPDATE commission_conversions SET source = CASE WHEN import_id IS NOT NULL THEN 'import' ELSE 'manual' END`.

**Edge Function `commissions-apply-stripe`:**
- `supabase/functions/commissions-apply-stripe/index.ts`.
- Verifica JWT + `has_role(uid, 'admin')`.
- Faz o loop em lotes de 500 conversões Stripe. Reusa mesma lógica de `resolveRow` (porta o cálculo para SQL/TS server-side).
- `config.toml`: função nova com `verify_jwt = true` (default; sem override).

**Front:**
- `src/lib/commissioning.ts`: extrair `calcCommissionFromStripeRow()` reutilizável e testável.
- `src/components/comissionamento/ComissionamentoConversions.tsx`: coluna Origem, filtro, badge de trava, ação destravar.
- `src/components/comissionamento/ManualConversionDialog.tsx`: switch de revisão + captura de `override_fields`.
- Nova aba `ComissionamentoStripeSync.tsx` chamando a Edge Function.
- `src/components/comissionamento/ComissionamentoOverview.tsx`: card "Por origem".

**Fluxo de dados (ASCII):**

```text
Stripe webhook ──► stripe_conversions ──► trigger apply_commission_from_stripe
                                             │
                                             ├─► INSERT/UPDATE commission_conversions (source='stripe')
                                             │       └─► respeita manually_reviewed + override_fields
                                             │
CSV Import   ──► commission_imports ─────────┼─► INSERT commission_conversions (source='import', stripe_conversion_id=NULL)
                                             │
Entrada UI   ─────────────────────────────────┴─► INSERT commission_conversions (source='manual', stripe_conversion_id=NULL)

Edição UI ──► ManualConversionDialog ──► UPDATE commission_conversions + INSERT commission_conversion_edits
                                             └─► se "revisada manualmente" → manually_reviewed=true, override_fields=[…]
```

**Não muda:** trigger `generate_commission_on_won`, tabela legada `commissions`, página `/commissions`, tabelas de goals, `stripe_conversions` schema.

## O que fica fora deste plano

- Aplicação de `commission_triggers` (bônus por meta) — segue sem uso, como hoje.
- Deprecar o sistema legado `commissions` / `/commissions` — decisão separada.
- Mudanças em `GoalsTracking` ou `StripeConversions`.