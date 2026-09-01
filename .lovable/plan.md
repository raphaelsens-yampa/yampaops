# Funis CRM — Taxas de conversão por etapa e por executivo

## O que existe hoje

A aba Métricas já traz win rate geral, conversão de entrada, funil de abertos, matriz "de X para Y", conversão etapa a etapa (geral) e ranking de proprietários com win rate. O que falta é exatamente o corte por executivo em cima das etapas e as coortes por mês de criação.

Dados disponíveis e suficientes: `ac_funnel_stage_events` (created / stage_change / won / lost, com etapa origem, destino, proprietário, valor e data), `ac_funnel_deals` (etapa, status, valor, datas, proprietário), `ac_funnel_stages` (ordem: Backlog, Em contato, Respondido, Diagnóstico, Proposta) e `ac_funnel_deal_tasks` (com `task_type`, hoje incluindo "Reunião", e `owner_name`).

## O que será construído

### 1. Conversão etapa → fechamento por executivo
Novo bloco com dois seletores: **etapa de origem** (ex.: Diagnóstico) e **destino** (Ganho, ou qualquer etapa posterior). A tabela mostra:

- Linha "Média geral" no topo
- Uma linha por executivo: negócios que passaram pela etapa de origem no período, quantos chegaram ao destino, taxa de conversão, valor convertido e ticket médio
- Ordenação por taxa ou por volume, e destaque de quem está acima/abaixo da média geral

Complemento: matriz "etapa × executivo" com a taxa de passagem de cada etapa para a seguinte, para ver em qual etapa cada pessoa perde mais.

### 2. Coortes de criação × fechamento
Dois indicadores novos, cada um com média geral e quebra por vendedor:

- **Criado no mês e fechado no mês** — dos negócios criados no período filtrado, quantos foram ganhos dentro do mesmo período (velocidade de fechamento).
- **Criado em qualquer mês e fechado no mês** — todos os ganhos do período, separando os que vieram de safras anteriores, com o mês de origem de cada um e o ciclo médio em dias.

Apresentado como uma tabela por vendedor (criados, ganhos no mês, ganhos de safra anterior, taxa intra-mês, ciclo médio) mais um mini-gráfico de safras.

### 3. Reuniões agendadas por executivo
Card e tabela por executivo com as reuniões do período a partir das tarefas do funil (`task_type` = Reunião), mostrando agendadas, realizadas (concluídas), pendentes e a taxa de realização. Filtro de tipos de tarefa considerados, para incluir outros tipos caso a operação use nomes diferentes.

Também: taxa "reunião → ganho" por executivo, ligando quem agenda com quem converte.

## Observações

- Todas as taxas com "—" quando não há base, sem inventar percentuais.
- Continua tudo somente leitura, sem escrita no CRM e sem alteração de schema.
- Datas em America/Sao_Paulo; a etapa "Triagem Backlog" segue oculta.
- Os KPIs já existentes não mudam de cálculo.

## Detalhes técnicos

- `src/lib/acFunnelKpis.ts`: novas funções puras `computeStagePairByOwner`, `computeOwnerStageMatrix`, `computeCohortByOwner` e `computeMeetingsByOwner`, com testes em `src/test/acFunnelKpis.test.ts`.
- `src/pages/AcFunnelMetrics.tsx`: novos blocos na aba Métricas, reaproveitando os dados já carregados em `loadAll` (eventos do período, deals e tarefas) — sem novas consultas, exceto os eventos de criação anteriores ao período, necessários para a coorte de safras antigas.
- Proprietário vem de `owner_name`; sem nome, agrupado como "Sem proprietário".
