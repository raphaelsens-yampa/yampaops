# Aba "Conversões do CRM" no relatório de Sales (Metas Operacionais)

## O que muda
No relatório do mês da visão Sales entram duas abas:
- **Operações** (a de hoje): Nova Venda, Recuperado, Upsell.
- **Conversões do CRM**: negócios do ActiveCampaign com status Ganho fechados no mês escolhido.

### Colunas da aba CRM
Nome do contato, E-mail, Negócio, Proprietário (vendedor), Data de fechamento, Valor, Status da conferência.

### Conferência CRM x tela
O e-mail de cada negócio ganho é cruzado com as operações de Sales do mesmo mês (Nova Venda, Recuperado e Upsell):
- **Confere**: o cliente está nos dois e os valores diferem em menos de R$ 1.
- **Valor diferente**: o cliente está nos dois, mas com valores diferentes. Os dois valores aparecem.
- **Só no CRM**: é ganho no Active, mas não aparece na tela.
- **Só na tela**: aparece na tela, mas não existe negócio ganho no CRM. Esses clientes entram em linhas extras no final da lista.

No topo da aba ficam o total do CRM, o total da tela, a diferença e a contagem por status. Também há um filtro por status (por exemplo, "só divergentes") e exportação para CSV.

A visão CS não muda.

## Detalhes técnicos
- Fonte: `ac_funnel_deals` com `status = '1'` (ganho) e `closed_at` dentro do mês no horário de São Paulo. O registro é único por negócio, como já foi saneado na auditoria dos Funis CRM. Em setembro até agora são 31 negócios ganhos e R$ 11.670,60.
- O e-mail é comparado em minúsculas e sem espaços. Quando o cliente tem várias operações no mês, os valores são somados antes da comparação.
- Novo componente `OperationalCrmConversions.tsx`, usado dentro de `OperationalMonthReport.tsx` com Tabs quando o time for Sales. O componente reaproveita as linhas que o relatório já calcula.
- Não há mudança no banco de dados.
