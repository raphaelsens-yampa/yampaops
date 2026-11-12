# Carteira de CS: performance, data de atualização e clientes em churn

## O que já existe hoje
- A carteira tem 2.172 clientes ativos e 2.197 marcados como inativos (saíram da base de pagantes). Os inativos ficam guardados, mas a tela não mostra nenhum deles.
- A base é atualizada todo dia às 08:40 (horário de Brasília). Hoje a última atualização foi 12/11.
- Ao abrir a tela, ela baixa a carteira inteira, todas as colunas, mais os dados de uso, as tags, os segmentos e os analistas, e depois faz todos os cálculos no navegador.

## 1. Performance
1. Primeiro, medir onde está a demora: o download, os cálculos dos KPIs e da fila, ou a tabela desenhando 2.000+ linhas de uma vez. Só depois disso escolher a correção.
2. Correções prováveis, aplicadas conforme a medição:
   - Baixar só as colunas que a tela usa, em vez de todas.
   - Guardar os dados por alguns minutos, para que trocar de aba e voltar não baixe tudo de novo.
   - Mostrar a tabela em páginas de 50 linhas ou desenhar só as linhas visíveis.
   - Calcular filtros, KPIs e a fila uma vez só, e esperar o usuário parar de digitar na busca antes de filtrar.
   - Carregar Relatórios e dados de uso só quando a aba deles for aberta.
3. Meta: abrir a tela e usar os filtros sem travar.

## 2. Data da última atualização
- Um selo no topo, por exemplo "Base atualizada em 12/11/2026 às 08:40", usando a data da atualização mais recente.
- Se a base estiver há mais de um dia sem atualizar, o selo fica em destaque de alerta.
- Depois de clicar em atualizar, o selo mostra a nova data.

## 3. Clientes em churn (recomendação)
Os inativos continuam fora da carteira principal, para não poluir a fila de trabalho do CS. Para eles:
- Um filtro de situação: Ativos (padrão), Churn recente (últimos 90 dias), Todos os churns.
- Cada cliente em churn mostra a data de saída, o último MRR, o analista responsável e um selo "Churn". O histórico de contatos e as tags continuam disponíveis.
- Um KPI de "Churns no mês" com MRR perdido, por analista.
- Se o cliente voltar a pagar, ele volta como ativo sozinho e mantém o histórico.
- Opcional: uma fila "Reconquista" com os churns recentes, para ações de recuperação.

## Detalhes técnicos
- Medir o tempo da busca com fetchAllPaged em `useCsPortfolio` e o tempo de render de `CsPortfolio.tsx` e `PortfolioTable.tsx`.
- Trocar `select("*")` por uma lista de colunas, usar `staleTime` no react-query, virtualizar ou paginar a tabela, e só ativar as queries de uso e tags quando a aba precisar delas.
- Para a data de saída: confirmar se `cs_portfolio_refresh` grava a data em que o cliente fica inativo. Se não gravar, adicionar uma coluna `churned_at`, preenchida quando `is_active` passa para false e limpa na reativação. Datas antigas vêm de `updated_at` ou `stripe_churn_events` e `metas_churn_daily` quando existirem.
- A data do selo vem de `max(updated_at)` dos ativos, consultada à parte.
- `useCsPortfolio` passa a receber o filtro de situação.
