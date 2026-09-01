# Funis ActiveCampaign — KPIs de conversão e variação percentual

## O que a tela tem hoje

Aba Métricas com: negócios abertos no período, movimentações, ganhos, perdidos (com taxa de conversão simples ganhos/fechados), funil de abertos por etapa, volume diário, matriz "de X para Y", ranking de ganhos por proprietário, ranking de motivos de perda e visão de tarefas. Nenhum número tem comparação com período anterior nem taxa entre etapas.

Os dados já disponíveis (`ac_funnel_stage_events` com created/stage_change/won/lost, `ac_funnel_deals` com etapa, valor, status, datas e motivo de perda, `ac_funnel_stages` com ordem) são suficientes para tudo abaixo — sem novas tabelas nem novo sync.

## KPIs de conversão propostos

**Linha de cards (com Δ vs período anterior de mesmo tamanho, em % ou p.p.)**
1. Win rate — ganhos / (ganhos + perdidos) fechados no período.
2. Conversão de entrada — dos negócios criados no período, quantos já foram ganhos (coorte; sinaliza que amadurece com o tempo).
3. Ticket médio ganho — valor ganho / ganhos.
4. Ciclo médio de fechamento — dias entre criação e fechamento dos ganhos.
5. Taxa de avanço — movimentações progressivas / total de movimentações (mede retrocessos no funil).

**Conversão etapa a etapa (novo bloco)**
Tabela/funil com, para cada etapa em ordem: entradas na etapa no período, quantos seguiram para qualquer etapa posterior, quantos foram perdidos a partir dela, e:
- Taxa de passagem (etapa → próxima etapa)
- Taxa de perda da etapa (leakage) — onde o funil vaza
- Conversão acumulada desde a primeira etapa
- Tempo médio de permanência na etapa
Cada percentual com Δ vs período anterior.

**Matriz "de X para Y"**
Toggle Quantidade / % da linha, para ler a matriz como distribuição de destino de cada etapa de origem.

**Ranking de proprietários**
Colunas adicionais: win rate individual, ticket médio e conversão de entrada, além de quantidade e valor já existentes.

**Motivos de perda**
Coluna de % sobre o total de perdas e Δ de participação vs período anterior.

**Série diária**
Linha adicional de win rate acumulado no período (eixo secundário), para ver a tendência dentro do intervalo.

## Como o comparativo funciona

O período anterior é o intervalo imediatamente antes, com o mesmo número de dias (ex.: 01–15/09 compara com 17–31/08). Uma segunda consulta de eventos nesse intervalo alimenta os deltas. Variação em p.p. para taxas e em % para valores absolutos; sem base no período anterior, mostra "—" em vez de inventar variação.

## Detalhes técnicos

- Novo `src/lib/acFunnelKpis.ts` com as funções puras de cálculo (win rate, passagem por etapa, leakage, ciclo, coorte) recebendo eventos + deals + etapas, com testes em `src/test/`.
- `AcFunnelMetrics.tsx` passa a carregar também os eventos do período anterior no mesmo `loadAll`, e novos componentes em `src/components/ac-funnels/` para o bloco etapa a etapa e os cards com delta.
- Ordem das etapas vem de `position`; progressivo = posição de destino maior que a de origem.
- Todas as datas continuam em America/Sao_Paulo.
- Sem escrita no ActiveCampaign e sem alteração no schema.
