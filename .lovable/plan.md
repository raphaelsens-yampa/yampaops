# Revisão do filtro de Origem (Yampa) nas três telas de Metas

## O que já foi encontrado
- **Metas Estratégicas** e **Metas Táticas** têm o filtro (Visão Geral / 4blue / Yampa), mas na maior parte dos indicadores ele **não lê a origem real de cada cliente**: ele pega o total geral e aplica uma "participação" estimada de cada origem, calculada por outra base. Isso é uma aproximação, não um acompanhamento fiel.
- O sistema diz que **Total de MRR, Ativos Pagantes e Churn não têm quebra por origem**, mas a base já tem essa informação desde 31/01/2026 (Ativos: ~116 mil linhas Yampa e ~37 mil 4blue; Churn: 3.689 Yampa e 1.537 4blue). Hoje esses dados ficam de fora.
- As vendas do Stripe já trazem a origem de cada venda (819 Yampa, 536 4blue).
- O aviso "Origem disponível a partir de 07/08/2026" está desatualizado em relação aos dados.
- **Metas Operacionais** não tem filtro de Origem.
- Algumas linhas recentes de Ativos (desde 23/08) e 2 vendas de hoje estão sem origem preenchida.

## O que vou fazer
1. **Auditoria com números**: para alguns meses (ex.: ago, set, out/2026), comparar em cada tela o que o filtro "Yampa" mostra hoje com a soma direta na base, cliente a cliente, e entregar uma tabela das diferenças.
2. **Metas Estratégicas**: Novos pagantes, Upsell, Downsell, Recuperados, Total de MRR, Ativos Pagantes e Churn passam a ser calculados direto pela origem de cada cliente, sem a estimativa por participação. Yampa + 4blue = Visão Geral.
3. **Metas Táticas**: vendas, upsell, recuperados FT, MRR e low-touch filtrados pela origem da própria venda. Lançamentos manuais usam a origem informada neles.
4. **Metas Operacionais**: incluir o mesmo filtro de Origem.
5. **Clientes sem origem**: aparecem como "Sem origem" e entram só na Visão Geral, com um aviso de quantos são. Assim a soma continua fechando.
6. Atualizar os avisos sobre a data a partir da qual a origem está disponível.
7. Testes garantindo que Yampa + 4blue + sem origem = Visão Geral, e validação na tela comparando com a base.

## Detalhes técnicos
- Fontes por origem: `metas_ativos_pagantes_daily/monthly`, `metas_churn_daily`, `metas_snapshot_diario`, `metabase_monthly_agg` e `stripe_conversions.origem_cliente` (`payment_status='paid'`), `tactical_manual_entries.origem_cliente`.
- Substituir o recorte por participação (`src/lib/origins.ts`, `useTacticalData`, `useCategoryWeeklyData`, `useOriginRealized`, `MetabaseTracking`) por agregação direta, mantendo `matchesOrigin` (sem diferenciar maiúsculas/minúsculas).
- Leituras paginadas com `fetchAllPaged`. Registrar a regra em `AGENTS.md`.
