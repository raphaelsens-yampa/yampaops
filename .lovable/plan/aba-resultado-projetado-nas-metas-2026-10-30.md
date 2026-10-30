# Aba "Resultado Projetado" nas Metas

Nova aba logo após **Metas Operacionais**, mostrando como devem ficar amanhã o **MRR Total** e o **Total de Usuários**, com filtro **Geral / Yampa / 4blue**.

## Conta

```text
Base atual (última foto oficial de clientes pagantes)
+ operações do dia nas Metas Táticas (novas vendas, low-touch, recuperados FT, upsell, downsell)
- churn previsto para amanhã na base do Metabase
  (exceto clientes que, nas operações do dia, foram recuperados ou retidos)
= Resultado projetado para amanhã
```

## O que a tela mostra
- Dois cards grandes: **MRR Total projetado** e **Usuários projetados**, cada um com o valor atual e a variação.
- Uma "ponte" entre base atual e resultado projetado: + vendas, + upsell, + recuperados, − downsell, − churn previsto, + churn evitado.
- Lista do churn previsto para amanhã (cliente, MRR, origem), com marcação "Recuperado/retido hoje" nos casos que ficaram de fora da conta.
- Os valores atualizam sozinhos ao longo do dia, como nas Metas Táticas.

## Regras
- As operações do dia usam a mesma fonte e as mesmas regras das Metas Táticas (só pagamentos confirmados; recuperados FT contam como vendas; upsell entra como diferença de MRR).
- Churn previsto: clientes com data de churn = amanhã na base do Metabase, sem repetir o mesmo cliente.
- Um cliente sai da lista de churn quando o e-mail dele aparece hoje como recuperado, reativado ou retido (recuperações das Metas Táticas ou novo pagamento confirmado na Stripe).
- Origem: cada cliente pela própria origem (sem marcação = Yampa), igual às outras telas.

## Detalhes técnicos
- `src/pages/Goals.tsx`: novo `TabsTrigger value="projected"` após `operational`.
- Novo `src/components/goals/ProjectedResult.tsx` + hook `useProjectedResult.ts`; cálculo em função pura `projectedResultModel.ts` com testes (churn excluído quando recuperado/retido; soma da ponte; filtro por origem).
- Base atual: último snapshot de `metas_ativos_pagantes_daily` (ativos, soma de MRR e contagem por origem).
- Operações do dia: reaproveitar `useTacticalRealized` / `useLowTouchData` para hoje.
- Churn previsto: `metas_churn_daily.churn_at` (e `metas_pre_churn.future_churn_at` como apoio) = amanhã, dedup por empresa/e-mail.
- Retenção/recuperação: cruzar e-mails normalizados com `tactical_recoveries` do dia e `stripe_conversions` pagas hoje.
- Todas as leituras via `fetchAllPaged`; regra registrada no `AGENTS.md`.
