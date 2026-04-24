## Unificação: Catálogo de Produtos & Comissões

Hoje temos duas tabelas no painel **Configurações de Comissão** com muita sobreposição:

| Coluna | commission_products | stripe_prices |
|---|---|---|
| Product ID (numérico) | ✓ | — |
| Produto / Plano / Periodicidade | ✓ | ✓ (duplicado) |
| Valor do Plano | ✓ | — |
| MRR | ✓ | ✓ (duplicado) |
| % Comissão | ✓ | ✓ (override) |
| Base de cálculo (Valor/MRR) | ✓ | — |
| **Stripe Price ID** | — | ✓ |
| **Price Name** | — | ✓ |
| **Área / Vendedor** | — | ✓ |

A intenção real é: **cada Price ID do Stripe é uma variante do produto** (mesmo plano, mesma comissão, só muda o vendedor/área/price_id). Faz sentido manter **uma única tabela** onde cada linha é uma "oferta vendável" completa.

### Nova estrutura proposta

Uma única tabela **Catálogo de Produtos** (`commission_products` expandida) com as colunas:

```text
Product ID | Produto | Plano | Periodicidade | Valor | MRR | % Comissão | Base | Stripe Price ID | Price Name | Área | Vendedor
```

A tabela `stripe_prices` será **descontinuada** — seus dados serão migrados para `commission_products` (1 linha já existe e bate 1:1 com 1 produto, então a migração é direta).

### O que muda no banco

- Adicionar em `commission_products`: `stripe_price_id`, `price_name`, `area`, `seller_id`
- Adicionar índice único parcial em `stripe_price_id` (quando não-nulo)
- Migrar 1 registro existente de `stripe_prices` → `commission_products` (merge no produto correspondente)
- Atualizar o trigger `generate_commission_on_won` para buscar tudo em `commission_products` (via `stripe_price_id` quando a oportunidade vier do Stripe, ou via `product_id` no fallback) — com a regra de comissão única por oportunidade já existente preservada
- Manter `stripe_prices` por enquanto como deprecated (não removida) para não quebrar histórico, mas sem uso novo

### O que muda na UI

- **Remover** o componente `StripePricesTable` da página `/commissions/settings`
- **Renomear** `ProductPricingTable` → `ProductCatalogTable` com:
  - Formulário expandido: campos Stripe (Price ID, Price Name, Área, Vendedor) em uma seção opcional "Integração Stripe"
  - Tabela com colunas combinadas e busca por Product ID, Price ID ou nome
- Atualizar `EditOpportunityDialog.tsx` (linha 91) para buscar Price IDs direto de `commission_products` em vez de `stripe_prices`

### Nada muda para o usuário em termos de comportamento

- Cálculo de comissão continua igual (Valor ou MRR × %, primeira ocorrência)
- Página de Comissões (`/commissions`) continua mostrando os dados normalmente
- Webhook do Stripe continua resolvendo o produto pelo `stripe_price_id`

### Detalhes técnicos

- Migração SQL: `ALTER TABLE commission_products ADD COLUMN stripe_price_id text, price_name text, area text, seller_id uuid` + `CREATE UNIQUE INDEX ... ON commission_products(stripe_price_id) WHERE stripe_price_id IS NOT NULL` + `INSERT/UPDATE` para fundir os 1 registro de stripe_prices.
- Atualizar trigger `generate_commission_on_won` para fazer lookup único em `commission_products` por `stripe_price_id` ou `id`.
- Remover import e uso de `StripePricesTable` em `CommissionSettings.tsx`.
- Excluir arquivo `src/components/commissions/StripePricesTable.tsx`.
- Em `EditOpportunityDialog.tsx`, trocar a query `stripe_prices` por uma query única em `commission_products` selecionando os campos equivalentes.
