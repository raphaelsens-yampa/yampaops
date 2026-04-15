

# Motor de Comissionamento e Projeção Financeira

## Visão Geral
Criar um módulo completo de comissões com regra T+2, clawback, tabela de produtos/preços e dashboards para vendedor e admin.

---

## 1. Novas Tabelas (Migration)

**`commission_products`** — Tabela de produtos e suas comissões:
- `id`, `name` (ex: "+Sucesso", "+Lucro", "+Controle", "BPO Junior"...)
- `subscription_commission` (decimal), `setup_commission` (decimal)
- `annual_multiplier` (decimal, default 1.0), `monthly_multiplier` (decimal, default 1.0)
- `created_at`, `updated_at`

**`commission_settings`** — Parâmetros globais (single row):
- `id`, `guarantee_months` (int, default 3), `payment_day` (int, default 10), `t_plus_months` (int, default 2)
- `created_at`, `updated_at`

**`commissions`** — Lançamentos individuais de comissão:
- `id`, `opportunity_id` (FK), `seller_id` (FK profiles.user_id), `product_id` (FK commission_products)
- `sale_date` (date), `payment_month` (date — mês de pagamento calculado T+2)
- `commission_amount` (decimal), `type` (enum: 'earned' | 'clawback')
- `status` (enum: 'provisioned' | 'paid' | 'reversed')
- `created_at`

**Alteração em `opportunities`**:
- Adicionar `is_active` (boolean, default true)
- Adicionar `cancellation_date` (date, nullable)
- Adicionar `product_id` (uuid, FK commission_products, nullable)
- Adicionar `billing_type` (text: 'monthly' | 'annual', default 'monthly')

RLS: Admins ALL, Sellers SELECT own (by seller_id).

---

## 2. Lógica de Negócio

**Geração de comissão**: Ao marcar oportunidade como Won, o sistema cria registro em `commissions` com:
- `payment_month` = mês da venda + T+2
- `commission_amount` = valor do produto × multiplicador (anual/mensal)
- `status` = 'provisioned'

**Clawback**: Ao marcar `is_active = false` em uma oportunidade:
- Se `cancellation_date` < `sale_date + guarantee_months`, gera lançamento com `type = 'clawback'` e valor negativo no próximo ciclo de pagamento.

---

## 3. Novos Componentes e Páginas

**`src/pages/Commissions.tsx`** — Página principal com tabs:

**Tab "Visão Vendedor"** (seller vê só o seu):
- Card "Saldo Provisionado" (soma comissões provisioned)
- Card "Próximo Recebimento" (soma do próximo mês de pagamento)
- Gráfico de barras: MRR Fechado vs Meta
- Tabela extrato: Cliente | Data Venda | Plano | Comissão | Data Crédito

**Tab "Visão Admin"** (apenas admin):
- Card "Provisão Total" (desembolso M+1 e M+2)
- Ranking de Canais (origin) por comissão gerada e MRR
- Tabela de todos os vendedores com totais

**`src/pages/CommissionSettings.tsx`** (admin only):
- CRUD de `commission_products` (tabela de preços)
- Edição de `commission_settings` (meses garantia, T+, dia pagamento)

---

## 4. Rotas e Sidebar

- Adicionar "Comissões" na sidebar (ícone `DollarSign`), visível para admin e seller
- Admin: rota `/commissions` e `/commissions/settings`
- Seller: rota `/commissions` (apenas visão própria)

---

## 5. Arquivos Afetados

| Ação | Arquivo |
|------|---------|
| Criar | `supabase/migrations/..._commissions.sql` |
| Criar | `src/pages/Commissions.tsx` |
| Criar | `src/pages/CommissionSettings.tsx` |
| Criar | `src/components/commissions/SellerCommissionView.tsx` |
| Criar | `src/components/commissions/AdminCommissionView.tsx` |
| Criar | `src/components/commissions/ProductPricingTable.tsx` |
| Editar | `src/components/AppSidebar.tsx` (novo item) |
| Editar | `src/App.tsx` (novas rotas) |
| Editar | `src/components/EditOpportunityDialog.tsx` (campos is_active, product, billing_type) |

---

## Detalhes Técnicos

- Enums criados via SQL: `commission_type` ('earned', 'clawback'), `commission_status` ('provisioned', 'paid', 'reversed')
- Cálculo T+2 feito no frontend ao criar comissão, armazenando `payment_month` diretamente
- Seed de `commission_products` com os valores da tabela de referência (+Sucesso, +Lucro, +Controle, BPO)
- Seed de `commission_settings` com defaults (3 meses garantia, dia 10, T+2)

