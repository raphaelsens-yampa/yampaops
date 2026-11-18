# Relatório de Churn por Vendedor e Área (desde jan/2026)

## Objetivo
Mostrar quais vendedores e áreas vendem clientes que cancelam depois, para avaliar a qualidade da venda.

## Onde fica
Nova aba **"Por Vendedor"** dentro da Análise de Churn (Atendimentos), usando o mesmo controle de acesso da tela.

## O que aparece
- **Filtros:** período da venda (padrão: 01/01/2026 até hoje), área, vendedor, origem (Geral/Yampa/4blue).
- **Cards:** vendas no período, clientes que deram churn, taxa de churn da safra, MRR vendido x MRR perdido.
- **Ranking por vendedor** (tabela ordenável + gráfico): vendas, MRR vendido, churns, taxa de churn (%), MRR perdido, % do MRR perdido, tempo médio até o churn (dias), churn precoce (até 90 dias).
- **Ranking por área:** mesmas colunas (Sales, CS, Parceria, Produto/Low-touch etc.).
- **Curva de safra por mês de venda:** para cada mês (jan→nov), quanto daquela safra já cancelou, para comparar meses de forma justa.
- **Lista detalhada** com cliente, vendedor, área, data da venda, data do churn, MRR e motivo; exportação CSV.

## Regras
- Venda = conversão Stripe com pagamento confirmado desde 01/01/2026 (new e upsell; upsell pode ser desmarcado).
- Churn = o mesmo cliente (por e-mail) aparece como cancelado após a data da venda, sem recuperação posterior; plano trocado não conta como churn.
- Clientes recuperados aparecem à parte, sem contar como churn.
- Excluir contas internas (lau.marcelly@gmail.com).
- Vendas sem vendedor (hoje 724 de 1.111, em geral produto/low-touch) aparecem como **"Sem vendedor"**, para não esconder volume.
- Taxa principal = churns ÷ vendas do vendedor; com aviso de amostra pequena quando o vendedor tiver menos de 10 vendas.

## Detalhes técnicos
- Lógica pura em `src/lib/sellerChurn.ts` (cruzamento venda→churn, taxa, safra, tempo até churn) com testes `sellerChurn.test.ts`.
- Dados: `stripe_conversions` (`assigned_seller_id`, `area`, `customer_email`, `payment_status='paid'`) + casos de churn de `churn_analysis_cases`/`metas_churn_daily` + `profiles` para nomes; todas as leituras via `fetchAllPaged`.
- Componente `SellerChurnTab.tsx` integrado em `ChurnAnalysis.tsx`; área registrada no `accessRegistry` como filha de `analise_churn`.
- Sem mudanças no banco.
