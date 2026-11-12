# Filtro de Origem nos gráficos de Pacing (New MRR e Churn)

## O que muda
Cada um dos dois gráficos de Pacing nas Metas Táticas ganha um seletor próprio: **Geral · Yampa · 4blue**.
- Abre seguindo o filtro de Origem da tela; depois pode ser trocado só no gráfico, sem mexer no resto da página.
- Muda juntos: linhas (mês atual, meses comparados, média 90d, tendência), cards de previsão, tabela e linha de Meta.

## Como cada origem é identificada
- **New MRR — vendas novas e upsell:** origem da própria venda (Stripe sem marcação = Yampa; vendas importadas da 4blue = 4blue). Já funciona hoje.
- **New MRR — Recuperados:** hoje somem quando se filtra uma origem. Passam a ser classificados pelo cliente (e-mail) na última base de ativos/churn; sem origem encontrada = Yampa.
- **Churn:** marcação de origem do próprio cliente na base de churn do Metabase (já funciona).
- **Meta:** usa a meta da origem quando cadastrada; se não houver (hoje só há metas Gerais), a linha de Meta fica oculta com o aviso "Sem meta cadastrada para esta origem" — não vamos ratear a meta geral.

## Detalhes técnicos
- `NewMrrPacingPanel` / `ChurnPacingPanel`: estado local `panelOrigin` inicializado a partir da prop `origin` (sincroniza quando a prop muda), passado a `useNewMrrPacing`/`useChurnPacing` e `useCategoryWeeklyData`.
- `useNewMrrPacing`: buscar `tactical_recoveries` sempre, com e-mail; resolver origem via helper puro novo (`recoveryOrigin`) testado em `src/test/`.
- Meta oculta quando a origem filtrada não tiver meta específica (respeita regra de não diluir metas gerais).
