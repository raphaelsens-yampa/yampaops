# Net MRR com "Incluir 2.0" derivado do MRR Total combinado

## Problema

Hoje, quando "Incluir 2.0" está ativo, o Net MRR realizado é ajustado somando a **variação isolada do estoque de MRR do 2.0**. Como o 2.0 está em migração para o yampaFin, essa variação é sistematicamente negativa e o Net MRR **cai** quando o 2.0 é incluído — o oposto do esperado.

## Regra correta

Com o 2.0 incluído, o Net MRR realizado passa a ser medido pela evolução do **MRR Total combinado** (yampaFin + 2.0):

```text
Net MRR (com 2.0) = MRR Total combinado (data atual)
                  − MRR Total combinado (fechamento do mês anterior)
```

Assim, o Net MRR reflete o crescimento do MRR geral da empresa, sem penalizar a migração interna do 2.0. Sem o filtro ativo, nada muda (segue vindo do realizado cadastrado/Metabase).

## Onde aplicar

1. **Aba Metas Táticas** — matriz semanal por categoria: no lugar de somar o delta do 2.0 ao Net MRR, recalcular a série diária do Net MRR como (MRR yampaFin + MRR 2.0) do dia menos (MRR yampaFin + MRR 2.0) do último dia do mês anterior.
2. **Aba Acompanhamento Metas** — visão mensal: no lugar das linhas sintéticas com o delta do 2.0, substituir o realizado de Net MRR do mês pelo delta mês a mês do MRR Total combinado.

## Salvaguardas

- Se faltar o estoque combinado do mês anterior (ou do dia) na base, mantém o Net MRR original e não inventa valor.
- Nenhuma alteração no banco: tudo permanece transformação de leitura.
- Metas de Net MRR seguem intactas; muda apenas o realizado.
- O badge "inclui 2.0" continua sinalizando as linhas afetadas.

## Detalhes técnicos

- `src/components/goals/tactical/useCategoryWeeklyData.ts`: trocar o `addTo(NET_MRR_CAT, ...)` (baseline apenas do 2.0) por uma reconstrução da série do Net MRR a partir das séries de estoque combinadas (`BASE_MRR_CAT` já somado com `YAMPA20_MRR_CAT`), usando o valor de `prevEndKey` como base.
- `src/components/goals/MetabaseTracking.tsx` (`scopedAgg`, modo `all`): calcular o MRR total combinado por `year_month` (base + 2.0) e emitir a linha de Net MRR como diferença entre meses consecutivos, sobrepondo o realizado original de Net MRR em vez de somar a ele.
