# Corrigir o % de crescimento MRR a.m. (base de julho)

## O que foi verificado

- O fechamento real de julho em `metabase_monthly_agg` é **R$ 324.828,55** (Total de MRR), e agosto **R$ 329.508,53**.
- No histórico diário `metas_snapshot_diario` existe, para julho:
  - `2026-07-31` — `fechamento` = **324.828,55** (correto)
  - `2026-08-01` — `carry_forward` = **324.273,70** (linha gravada já em agosto, mas apontando para `year_month = 2026-07`)
- A leitura de snapshot resolve cada (mês, métrica) pegando a linha com maior `data` menor ou igual à data de referência. Como a linha de 01/08 é posterior ao fechamento, ela sobrescreve julho e o card passa a comparar agosto contra 324.274 → +1,6% em vez do valor correto.
- O caso é isolado: existem 12 linhas `carry_forward` com data posterior ao fim do mês que descrevem, todas em 01/08/2026 (referentes a julho).

## O que muda

1. Na resolução "as-of" do snapshot, cada mês passa a considerar apenas linhas com `data` até o **último dia daquele mês** (limitado também pela data de referência). Linhas gravadas depois do fim do mês deixam de sobrescrever o fechamento.
2. Quando houver linha `fechamento` para o mês, ela tem prioridade sobre qualquer outra do mesmo mês.
3. Com isso o card "% de Crescimento MRR a.m." passa a mostrar Ago R$ 329.509 vs Jul R$ 324.829 (+1,4%), e a mesma correção vale para Ativos Pagantes e demais métricas do histórico.

## Detalhes técnicos

- `src/components/goals/MetabaseTracking.tsx`, `snapshotAsAgg`: hoje filtra por `data <= refDate` e mantém a maior `data`. Passa a usar `effectiveCutoff = min(refDate, últimoDiaDe(year_month))` por linha e a preferir `tipo_snapshot = 'fechamento'` em empate.
- Nenhuma alteração de banco: os dados canônicos em `metabase_monthly_agg` já estão corretos; a correção é só de leitura.
- Teste novo em `src/test/growthBaseline.test.ts` (ou arquivo dedicado) cobrindo: snapshot `carry_forward` posterior ao fim do mês não sobrescreve o `fechamento`.
