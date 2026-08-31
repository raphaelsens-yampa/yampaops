# Validação: realizado das metas por `classificacao_company`

## Conclusão: já está implementado assim — nenhuma mudança necessária

O realizado das metas vem de `metabase_monthly_agg` (e do histórico as-of em `metas_snapshot_diario`), e os valores conferem exatamente com a soma por `classificacao_company` da base canônica do Metabase.

## Conferência feita (soma da base x valor exibido nas metas)

Agosto/2026 (fotografia de 30/08):

| Categoria | Base Metabase (`classificacao_company`) | Realizado nas Metas |
| --- | --- | --- |
| New MRR | novo pagante — 114 · R$ 16.753,96 | 114 · R$ 16.753,96 |
| Recuperados | recuperado — 30 · R$ 4.792,77 | 30 · R$ 4.792,77 |
| Upsell | upsell — 8 · R$ 1.523,50 | 8 · R$ 1.523,50 |
| Downsell | downsell — 5 · R$ 606,80 | 5 · R$ 606,80 |

Julho/2026 (mês fechado):

| Categoria | Base Metabase | Realizado nas Metas |
| --- | --- | --- |
| New MRR | 119 · R$ 12.982,79 | 119 · R$ 12.982,79 |
| Recuperados | 41 · R$ 6.756,15 | 41 · R$ 6.756,15 |
| Upsell | 5 · R$ 773,39 | 5 · R$ 773,39 |
| Downsell | 10 · R$ 2.082,97 | 10 · R$ 2.082,97 |

Nenhuma linha `regular` ou sem classificação entra nessas categorias, e Stripe não é somado ao realizado dessas linhas.

## Um ponto de atenção (não é erro, é diferença de regra proposital)

Nas Metas, o **Upsell** usa o MRR cheio da linha (agosto: R$ 1.523,50), exatamente como você descreveu aqui.
No **Comissionamento**, o Upsell usa o delta positivo `mrr − previous_mrr` (agosto: R$ 845,63).

Ou seja, as duas telas divergem por definição — é esperado, mas vale confirmar se você quer manter assim ou alinhar as duas na mesma regra.

## Próximo passo
Nada a implementar. Se quiser alinhar o Upsell das Metas ao delta usado no Comissionamento, é uma mudança pequena e faço um plano específico para isso.