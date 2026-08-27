# Plano: Gráficos por plano e tabela de vendas por vendedor/plano

## Objetivo
Na tela **Conversões por Área**, adicionar:
1. Gráficos de volume de conversão por **plano** — um em quantidade e outro em MRR.
2. Uma tabela de **vendas por vendedor por plano**, considerando apenas vendas novas.

## O que será feito

### Agregações de dados (client-side, em `src/pages/StripeConversions.tsx`)
- Criar `byPlan` agrupando `plan_name` (ou `"Sem plano"`) com `quantidade` e `mrr` (usando o mesmo `valueOf` do modo líquido/bruto).
- Criar `sellerPlanSales` filtrando apenas `conversion_type === "new"` e agrupando por `assigned_seller_id` + `plan_name`, com nome do vendedor via `sellersMap`.
- Ordenar ambos por MRR decrescente.

### Gráficos por plano (na aba **Visão Geral**)
- Dois cards lado a lado:
  - **Conversões por Plano (quantidade)**: `BarChart` vertical, eixo X = plano, Y = quantidade.
  - **MRR por Plano**: `BarChart` vertical, eixo X = plano, Y = MRR considerado, formatado em `R$ ...k`.
- Usar paleta de cores derivada do nome do plano (mantendo consistência com gráficos existentes).

### Tabela de vendas por vendedor/plano
- Adicionar um card na aba **Visão Geral** com a tabela:
  - Colunas: Vendedor, Plano, Quantidade, MRR considerado.
  - Ordenada por MRR decrescente.
  - Exibe mensagem quando não houver vendas novas no período/filtro.

## Decisões assumidas
- A tabela de vendas por vendedor por plano considera **apenas novas vendas** (`conversion_type = new`), conforme confirmação do usuário.
- Os gráficos por plano consideram **todas as conversões** do filtro atual (novas, upsell, downgrade, renovação).
- O MRR respeita o toggle atual de “MRR Líquido / MRR Bruto”.

## Não inclui
- Novas rotas, tabelas ou Edge Functions.
- Alterações nos filtros ou nas exportações (salvo se solicitado depois).
