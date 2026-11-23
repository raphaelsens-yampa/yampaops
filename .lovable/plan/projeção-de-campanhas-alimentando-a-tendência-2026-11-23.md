# Projeção de campanhas alimentando a Tendência

## O que muda para o usuário
1. **Período da campanha**: no quadro de projeção, cada campanha do mês ganha nome, data de início e data de fim, além de New MRR e vendas projetadas. Dá para cadastrar mais de uma campanha no mês.
2. **Distribuição nos dias**: o valor declarado é espalhado pelos dias úteis do período da campanha. Dias já passados usam o realizado. O que falta para chegar na projeção é dividido igualmente entre os dias úteis restantes da campanha. Fora do período, a campanha não soma nada.
3. **Tendência usa a projeção declarada** (no Pacing de New MRR, Mês atual):
   - **Campanha**: a linha de Tendência e os cards de potencial passam a ser a projeção declarada distribuída por dia, comparada com o realizado de campanha. Sem projeção cadastrada, continua a tendência automática.
   - **Sem Campanha**: o quadro de projeção some e a tendência segue automática, só com vendas fora de campanha.
   - **Geral**: Tendência = tendência automática de Sem Campanha + projeção declarada de Campanha, somadas dia a dia (acumulado de ambos). O quadro continua visível.
4. Os cards "Potencial de New MRR / Vendas" mostram o mesmo número do fim da linha de Tendência, para não divergirem.

## Detalhes técnicos
- Banco: nova tabela `campaign_projections` (id, year_month, name, start_date, end_date, mrr, qty, updated_by, updated_at) com as mesmas políticas da atual (leitura interna, escrita Tático/Admin). Migrar a linha existente de `campaign_month_projections` como uma campanha do mês inteiro e depois descontinuar essa tabela.
- `src/lib/newMrrPacing.ts`: nova função pura `declaredCampaignDaily(projections, ym, realizedDaily, todayDay, metric)` que devolve a série diária projetada (realizado nos dias passados, saldo restante dividido nos dias úteis restantes do período, nunca negativo) e `combineTrend(autoTrend, declaredCum)` para o Geral. Testes com valores concretos (ex.: R$3.000 em campanha de 10 dias úteis, R$1.000 realizados em 5 dias, restam R$400/dia útil).
- `CampaignManualProjection.tsx`: lista editável de campanhas com período; validação fim ≥ início e datas dentro do mês.
- `NewMrrPacingPanel.tsx`: carrega as projeções, escolhe a série de tendência por filtro (Campanha / Sem Campanha / Geral) e usa o total projetado nos cards; esconde o quadro em Sem Campanha.
- Registrar no AGENTS.md a regra de que a tendência de campanha vem da projeção declarada distribuída no período.
