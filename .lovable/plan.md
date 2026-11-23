# Report Comercial Semanal (Diretoria)

Nova tela "Report Semanal" em Metas, com seletor de semana (padrão: última semana fechada, seg–dom, horário de São Paulo), pronta para apresentar e exportar em PDF/Excel.

## Blocos da tela

1. **Resumo do Mês (Meta x Realizado até hoje)**
   - MRR total, New MRR (Novos, Recuperados, Upsell), Churn MRR, NET MRR, Usuários ativos e Quantidade de vendas.
   - Percentual atingido, pace esperado para o dia e tendência de fechamento (mesma do Pacing).
   - Filtro de Origem: Geral, Yampa, 4blue.

2. **Performance da Semana**
   - Semana atual vs semana anterior vs média das 4 últimas: vendas, New MRR, upsell, recuperações (só MRR efetivo, declarado entre parênteses), churn e saldo.
   - Gráfico diário da semana (Meta x Realizado).

3. **Times e Vendedores**
   - Placar por time (Sales, CS, Produto, Parceria) e ranking de vendedores da semana e do mês.

4. **Campanhas**
   - Realizado das campanhas do mês x projeção manual declarada; New MRR com e sem campanha.

5. **Riscos e Previsão**
   - Resultado Projetado do mês, pré-churn previsto para os próximos 7 dias, churn por canal/vendedor (top 5) e pipeline do RD Station (negociações abertas e ganhas na semana).

6. **Comentários da semana**
   - Campo livre (destaques, riscos, ações), salvo por semana e incluído na exportação.

## Exportação
- Botão "Exportar PDF" (layout de apresentação, uma página por bloco) e "Exportar Excel" (uma aba por bloco).
- Cabeçalho com semana, data de geração e data da última foto do Metabase.

## Acesso
- Nova área registrada no controle de acesso, visível apenas para Admin no início; liberação para outros níveis pela tela de Níveis de Acesso.

## Detalhes técnicos
- Reaproveitar cálculos existentes (sem números novos ou estáticos): `openMonthStripeRealized`, `newMrrPacing`, churn pacing, `ProjectedResult`, placar tático, `campaign_projections`, `ac_funnel_*` (RD). Leituras com `fetchAllPaged`.
- Montagem do report em helper puro `src/lib/weeklyReport.ts` com testes (limites da semana SP, comparativos, somas que reconciliam com as telas de origem).
- Tabela `weekly_report_notes` (semana, texto, autor) com RLS de equipe interna; escrita para Admin/Tático.
- PDF via geração no navegador (jsPDF + captura dos blocos); Excel via xlsx.
- Registrar área `weekly-report` em `accessRegistry.ts` e item no menu de Metas.
