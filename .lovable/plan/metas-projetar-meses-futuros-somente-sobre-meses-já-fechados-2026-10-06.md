# Metas: projetar meses futuros somente sobre meses já fechados

## Problema

A meta projetada de um mês futuro usa o **realizado parcial do mês em curso** como base. Hoje (06/10) a meta de Nov aparece como R$ 338.242 = realizado parcial de Out (R$ 328.390, snapshot de 05/10) × 1,03 — muda todo dia e ficou abaixo da meta cadastrada porque Out começou com queda de MRR.

Decisão do usuário: **projetar sobre fechado** — só usar realizado de meses já encerrados; enquanto Out estiver aberto, Nov projeta sobre a meta/projeção de Out.

## Mudanças

### 1. `src/lib/goalScenario.ts` — `buildScenarioFactors`

Na escolha da base do estoque de cada mês, `realizedOf(mês anterior)` só vale quando o mês anterior ≤ `anchorMonth` (mês-âncora = último fechamento, já presente no `ScenarioBaseline.month`). Para mês anterior posterior à âncora (o mês em curso), usa a projeção acumulada (`prev`), como já acontece quando não há realizado.

- Efeito concreto: Nov = Set realizado (333.857) × 1,015 × 1,03 = **R$ 349.031**, fixo enquanto Out estiver aberto; Dez = Nov × 1,01.
- Ao fechar Out, a âncora avança (lógica existente do `useScenarioBaseline`) e Nov volta a ancorar no realizado final de Out.
- Meses já encerrados (Ago, Set, Out) não mudam.

### 2. `src/lib/commercialPlan.ts` — `buildPlanMonths`

Novo parâmetro opcional `closedThrough?: string` (YYYY-MM do último mês fechado). Realizado de meses posteriores a `closedThrough` continua exibido na coluna Realizado, mas **não reancora a cadeia**: o fim do mês aberto segue a projeção (`mrrStart × (1 + g)`), e o mês seguinte parte do fim projetado (não do realizado parcial). Mesmo tratamento para ativos (`ativosPrev`). Sem `closedThrough`, comportamento atual (compatibilidade).

### 3. `src/hooks/useCommercialPlan.ts`

Calcular `closedThrough` (mês anterior ao vigente; no último dia do mês, o próprio vigente — mesma regra de `useScenarioBaseline`, timezone America/Sao_Paulo) e passar ao `buildPlanMonths`.

### 4. Testes

- `src/test/commercialPlan.test.ts`: novo caso — mês aberto não reancora a cadeia (Nov parte do fim projetado de Out; realizado parcial só aparece na coluna Realizado).
- `src/test/growthBaseline.test.ts`: novo caso — base do estoque de mês futuro ignora o realizado parcial do mês em curso (Nov = projeção de Out × taxa).

## Validação

- `bunx vitest run src/test/commercialPlan.test.ts src/test/growthBaseline.test.ts`, `bunx tsgo --noEmit`, `node scripts/check-paged-queries.mjs`, build.
- Preview (Acompanhamento Metas, gráfico anual): Nov = R$ 349.031 (estável durante Out), Dez = Nov × 1,01.
- Preview (Planejamento Comercial, bridge): Nov/Dez partem do fim projetado de Out; realizado parcial de Out segue na coluna Realizado.
