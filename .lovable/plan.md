# Consumir canal e motivo das Retenções/Recuperações nos dashes táticos

## Situação atual (verificada no banco)
- `tactical_recoveries`: 92 registros — 32 recuperados (R$ 5.155,89) e 60 retidos (R$ 11.582,52), **todos com canal `cs`** (valor padrão) e **apenas 1 com motivo preenchido**.
- 1 lançamento manual agregado (recuperado, R$ 2.233,71) está com canal **nulo**.
- Hoje canal/motivo só aparecem dentro da tabela "Clientes recuperados e retidos" (colunas, filtros, resumo e mini-ranking). Nenhum outro painel da seção usa esses campos.

Conclusão: antes de espalhar o recorte pelos dashes, o histórico precisa de uma etapa de classificação — senão todo dash mostrará "100% CS / sem motivo".

## O que será entregue

### 1. Qualidade do dado primeiro
- Bloco "Classificar pendências" no topo da tabela de recuperados/retidos: contador de registros sem motivo (e sem canal), com filtro de 1 clique.
- Seleção múltipla de linhas + ação em lote "Definir canal/motivo" para classificar o histórico rapidamente.
- Canal nulo passa a ser exibido como "Não classificado" (badge neutro), sem assumir CS.

### 2. Cards de canal na Visão Geral tática
Dois novos cards ao lado dos atuais de recuperados/retidos:
- **Recuperação por Cobrança** — qtd + MRR do período.
- **Recuperação por CS** — qtd + MRR do período.
Cada card mostra a participação % no MRR recuperado/retido total e o motivo líder do período.

### 3. Missão do Dia
Linha compacta sob os cards de Clientes recuperados/retidos: "Hoje: Cobrança 3 · R$ 420 | CS 5 · R$ 980 | 2 sem motivo", com o pendente clicável levando à tabela.

### 4. Gráfico de canal no tempo
Nova aba no gráfico de evolução tática: barras empilhadas por dia (Cobrança x CS), alternando entre quantidade e MRR, respeitando o período e o filtro de origem já existentes.

### 5. Ranking de motivos como painel próprio
Promover o mini-ranking atual para um bloco colapsável "Por que voltaram a pagar":
- Ranking por motivo com qtd, MRR, % do MRR e quebra Recuperado x Retido.
- Alternância Cobrança / CS / Todos.
- Comparativo com o período anterior de mesmo tamanho (▲/▼ em MRR), no mesmo padrão visual usado nas metas revisadas.

### 6. Recorte por vendedor
Na tabela de scoreboard/ranking do time, duas colunas extras: MRR recuperado via Cobrança e via CS, para enxergar quem depende de retentativa e quem gera retenção por ação humana.

## Detalhes técnicos
- Sem mudança de schema: `recovery_channel` e `reason_id` já existem em `tactical_recoveries` e `tactical_manual_entries`.
- Novo hook `useRecoveryChannelData.ts` em `src/components/goals/tactical/` centralizando a leitura (recoveries + manual entries + reativações Stripe derivadas como Cobrança) e agregando por dia, canal, motivo, tipo e vendedor — consumido pelos itens 2 a 6 para evitar consultas duplicadas.
- Componentes afetados: `TacticalOverview.tsx` (cards), `MissionToday.tsx` (linha de canal), `TacticalProgressChart.tsx` (série empilhada), `TeamRecoveriesTable.tsx` (pendências + ação em lote + extração do ranking), novo `RecoveryReasonsPanel.tsx`, `TeamScoreboard.tsx` (colunas por canal).
- Ação em lote via `update` em `tactical_recoveries`/`tactical_manual_entries` pelos ids selecionados, reaproveitando a lista de motivos de `recoveryChannels.ts`.
- Totais de Realizado permanecem inalterados: nenhuma alteração em `useTacticalData.ts` além de leitura opcional dos campos.
