

## Quebra de Metas por Categoria (Sales / CS / Campanhas / Financeiro)

Adicionar **categorias de meta** ao sistema, permitindo cadastrar e acompanhar metas específicas como New MRR, Recuperados, Upsell, Retenção, Recuperação de Churn, Downsell, Campanha MRR, LTV e CAC. O Acompanhamento ganha um filtro/agrupamento por categoria.

### 1. Schema (novas tabelas)

**`goal_categories`** — lista mista (sistema + customizadas):
- `id`, `name`, `slug`, `area` (`sales` | `cs` | `campaign` | `financial`), `metric_type` (`mrr` | `count` | `ratio` | `currency`), `is_system` (boolean), `is_active`, `description`
- Seed inicial com as 8 categorias pré-definidas, marcadas `is_system = true` (não podem ser excluídas, só desativadas)

**`finance_settings`** — configuração para cálculo de LTV/CAC:
- `id`, `avg_churn_rate` (numeric), `avg_campaign_cost` (numeric), `updated_at`
- Singleton (uma linha por organização)

**Alterações em tabelas existentes:**
- `goals` ← novo campo `category_id` (uuid, nullable, FK lógica para `goal_categories`)
- `opportunities` ← novo campo `category_id` (uuid, nullable) — vendedor marca na criação/edição da oportunidade

RLS: admin gerencia categorias e finance_settings; autenticados leem.

### 2. Cadastro de Metas (`/goals` aba "Cadastro")

- No formulário de Nova/Editar Meta, adicionar **Select "Categoria"** agrupado por área:
  - **Sales**: New MRR, Recuperados, Upsell
  - **CS**: Retenção (Pré-churn), Recuperação (Churn), Downsell
  - **Campanhas**: Campanha MRR
  - **Financeiro**: LTV, CAC, LTV/CAC
- Nova subaba **"Categorias"** dentro de Cadastro (admin only):
  - Tabela CRUD de categorias customizadas
  - Botão "+ Nova Categoria" → modal com nome, área, tipo de métrica
  - Categorias `is_system` aparecem como read-only (toggle ativo/inativo apenas)

### 3. Configurações Financeiras

Card adicional na aba Cadastro (admin only):
- Inputs: **Churn médio (%)**, **Custo médio de campanha (R$)**
- Salva em `finance_settings`
- Usado para calcular LTV (MRR médio ÷ churn) e CAC (custo ÷ conversões)

### 4. Marcação em Oportunidades

- `EditOpportunityDialog` e `NewOpportunityDialog` ganham campo **"Categoria"** (Select com todas as categorias ativas)
- Quando vendedor fecha a oportunidade (Won), o `category_id` define a qual meta ela contribui

### 5. Acompanhamento (`/goals` aba "Acompanhamento")

**Novo filtro "Categoria"** no topo:
- Padrão: "Todas as categorias" (comportamento atual)
- Selecionar categoria filtra: realizado, gráfico, ranking e KPIs apenas por aquela categoria

**Nova seção "Acompanhamento por Categoria"** (`GoalsBreakdownByCategory.tsx`):
- Cards agrupados por área (Sales / CS / Campanhas / Financeiro)
- Cada card mostra: nome da categoria, meta, realizado, %, status colorido
- Categorias **financeiras** (LTV, CAC, LTV/CAC) calculadas automaticamente:
  - **LTV** = (MRR médio das oportunidades won) ÷ `avg_churn_rate`
  - **CAC** = `avg_campaign_cost` ÷ (conversões da categoria "Campanha MRR" no período)
  - **LTV/CAC** = LTV ÷ CAC

### 6. Estrutura de arquivos

**Novos:**
- `src/lib/goalCategories.ts` — seed das 8 categorias do sistema, helpers de área
- `src/components/goals/CategoryManager.tsx` — CRUD de categorias customizadas
- `src/components/goals/FinanceSettings.tsx` — config de churn/CAC
- `src/components/goals/GoalsBreakdownByCategory.tsx` — cards de progresso por categoria
- Migração SQL: `goal_categories`, `finance_settings`, `goals.category_id`, `opportunities.category_id` + seed

**Editados:**
- `src/pages/Goals.tsx` — formulário com Select de categoria, subaba "Categorias", card de finanças
- `src/components/goals/GoalsTracking.tsx` — filtro de categoria + render do breakdown
- `src/components/EditOpportunityDialog.tsx` e `NewOpportunityDialog.tsx` — campo categoria
- `src/integrations/supabase/types.ts` (auto-regenerado pela migração)

### 7. Bibliotecas

Sem novas dependências — apenas componentes shadcn (`Tabs`, `Card`, `Select`, `Table`, `Badge`, `Progress`).

### Resumo do fluxo

```text
Admin cadastra categorias → Admin cria meta (escopo + categoria + valores)
       ↓
Vendedor cria/edita oportunidade marcando a categoria
       ↓
Ao fechar (Won) → realizado é somado na categoria correspondente
       ↓
Acompanhamento mostra:
  - Visão geral (todas categorias)
  - Filtro por categoria específica
  - Breakdown agrupado por área (Sales / CS / Campanhas / Financeiro)
  - LTV e CAC calculados automaticamente via finance_settings
```

