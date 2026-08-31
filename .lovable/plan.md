# Verificação do New MRR no Acompanhamento Metas

## Resultado confirmado
- A linha **New MRR** corresponde à categoria `New MRR` (`slug: new_mrr`), da área Sales.
- No modo atual, o realizado mensal vem de `metabase_monthly_agg`; ao consultar uma data histórica com snapshot disponível, vem de `metas_snapshot_diario` na posição mais recente até a data escolhida.
- O valor exibido é a soma de `realized_amount` do mês para essa categoria; a quantidade é a soma de `deals_count`.
- A categoria é separada de **Recuperados** e **Upsell**. Esses componentes entram somente no agregado **MRR Increase**, quando esse agregado está sendo exibido.
- Não entram na linha New MRR: Renovação, Downgrade, Downsell, Churn ou o estoque de Total de MRR.

## Valores atualmente confirmados na base mensal
- Jan/2026: R$ 9.685,74 — 86 vendas
- Fev/2026: R$ 10.183,99 — 88 vendas
- Mar/2026: R$ 13.867,26 — 88 vendas
- Abr/2026: R$ 9.990,44 — 85 vendas
- Mai/2026: R$ 10.113,18 — 95 vendas
- Jun/2026: R$ 14.072,08 — 123 vendas
- Jul/2026: R$ 12.982,79 — 119 vendas
- Ago/2026: R$ 16.753,96 — 114 vendas

## Próximo passo
Nenhuma alteração de código é necessária para responder à pergunta. Se houver divergência em um mês específico, a investigação deve comparar a linha da fotografia/snapshot daquele mês com o agregado mensal, sem misturar a fonte histórica com Stripe.