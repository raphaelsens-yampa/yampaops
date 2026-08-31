# Base do crescimento = realizado do mês anterior

## Situação atual (verificada)

- A revisão cadastrada existe: 09/2026 = 1,2% a.m.
- O motor de cenários já ancora o cálculo no realizado de Total de MRR e compõe os meses seguintes sobre o projetado — a ideia central já está implementada.
- Porém a âncora é o **último mês totalmente fechado**: hoje (31/08) o mês vigente não conta, então a base é **julho (324.828,55)** e setembro fica composto duas vezes (1% de agosto × 1,2% de setembro). O esperado é base = **agosto (327.701,36)**.

## O que muda

1. A base passa a ser sempre o **mês imediatamente anterior** ao primeiro mês projetado, usando o realizado disponível desse mês (mesmo que ainda esteja em curso), sem exigir fechamento.
2. Somente esse primeiro mês usa o realizado como referência. Os meses seguintes seguem sobre o **projetado** do mês anterior, de forma composta, até uma nova revisão entrar em vigor.
3. A meta pode ficar **abaixo** da cadastrada quando o realizado ficar abaixo: o valor recalculado prevalece (setembro passaria de 332.527 para ~331.633 com a base de agosto).

Exemplo com a revisão de 1,2% e base agosto = 327.701,36:

```text
set/2026 = 327.701,36 × 1,012 = 331.633
out/2026 = 331.633    × 1,012 = 335.613
nov/2026 = 335.613    × 1,012 = 339.640
```

## Detalhes técnicos

- `src/hooks/useScenarioBaseline.ts`: trocar o filtro "último mês fechado" por "mês anterior ao mês vigente" (`currentMonth - 1`) em `metabase_monthly_agg` para a categoria Total de MRR, com fallback para o último mês com realizado > 0 quando o mês anterior não tiver dado.
- `src/lib/goalScenario.ts` (`buildScenarioFactors`): garantir que o mês âncora seja tratado como referência mesmo quando não houver meta cadastrada nele (hoje, se `baseline.month` não estiver na lista de meses de metas, cai no fallback do primeiro mês com meta). Manter `factor = 1` para o mês âncora e anteriores, e remover qualquer piso que impeça fator < 1 no estoque (já é o comportamento atual).
- Efeito propagado sem mudanças adicionais em `MetabaseTracking.tsx`, `useCategoryWeeklyData.ts` e `useScenarioDailyFactor.ts`, que já consomem `baseline` + `growthBaselines`.
- Testes em `src/test/growthBaseline.test.ts`: casos de base = mês anterior em curso, composição sobre o projetado nos meses seguintes e fator menor que 1 quando o realizado fica abaixo da meta cadastrada.
