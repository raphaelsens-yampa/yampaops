# Cohort — MRR líquido: simulação e caminho seguro

## Simulação feita (somente leitura, nada aplicado)

Campanhas cadastradas em 08/2026 e efeito da regra "usar `mrr_net` do Stripe em vez do MRR do Metabase":

| Campanha | Contatos | MRR atual | MRR com net (regra simples) | Alterados | Delta |
| --- | --- | --- | --- | --- | --- |
| Black Friday 2025 | 53 | 5.507,86 | 3.927,00 | 8 | -1.580,86 |
| Workshop 4blue & yampa (26/08) | 116 | 24.074,64 | 24.074,64 | 0 | 0 |
| Workshop 4blue & yampa (25/08) | 55 | 21.084,49 | 21.084,49 | 0 | 0 |
| Workshop FC (16 contatos) | 16 | 8.702,06 | 8.702,06 | 0 | 0 |
| Workshop FC (12 contatos) | 12 | 3.348,24 | 3.198,22 | 1 | -150,02 |
| Workshop FC (Aleks) | 37 | 9.870,16 | 10.084,18 | 1 | +214,02 |
| Zero ao Lucro | 47 | 9.437,31 | 9.437,31 | 0 | 0 |

## O que a simulação revelou (e por que não devemos aplicar assim)

Ao abrir os 10 contatos que mudariam, o resultado seria **errado**:

- 7 clientes **ativos** ficariam com MRR **0,00**, porque a conversão correspondente no Stripe tem `mrr_net = 0` (líquido nunca calculado nesses registros antigos) — ex.: `felippeac@gmail.com`, hoje 292,78, iria a 0.
- 3 casos apontam para uma assinatura **diferente da atual**: `diretoria@jebcontabil.com.br` (Metabase 65,00 → Stripe 279,02), `cdriomeier@gmail.com` (279,02 → 129,00), `santiagomotor@uol.com.br` (239,00 → 120,73). Aqui não é desconto, é outro plano/ciclo.

Testei também a variante conservadora (usar `mrr_net` só quando `> 0` **e** quando o bruto do Stripe casa com o MRR do Metabase, indicando mesmo plano com cupom): o resultado é **zero alteração** em todas as campanhas. Ou seja, hoje não existe nenhum caso em que o líquido seja aproveitável para contatos vindos do Metabase.

Base de apoio: `stripe_conversions` tem 685 registros, só 315 com `mrr_net` preenchido e 34 em que líquido ≠ bruto. `metas_ativos_pagantes_daily` não possui campo de MRR líquido.

## Caminho proposto

1. **Não** aplicar agora a troca na origem Metabase — como está, ela derrubaria MRR de clientes ativos.
2. **Backfill do líquido no Stripe:** recalcular `mrr_net` das conversões (aplicando cupom/desconto da assinatura vigente) para todos os registros com `mrr_net` nulo ou zero e assinatura ativa.
3. **Regra final do cohort** (após o backfill), aplicada via migração em `campaign_cohort_refresh`:
   - usar `mrr_net` quando existir, for `> 0` e o bruto do Stripe corresponder à assinatura vigente do contato;
   - senão, manter o MRR da origem que determinou o status (Metabase / histórico de churn / Stripe bruto).
4. **Alinhar as demais origens:** `campaign_cohort_stripe_fill` e a Edge Function `cohort-stripe-live` passam a descontar cupom/desconto ativo, ficando coerentes com o líquido.
5. **Reprocessar** o cohort das campanhas e repetir esta simulação para confirmar que só os casos com cupom real mudam.
6. `CohortPanel.tsx` não muda — segue exibindo o campo `mrr`, que passa a ser líquido.

## Decisão que preciso de você

Confirma seguir por esse caminho (backfill do líquido primeiro, depois trocar a regra)? Se preferir, aplico a troca já com a salvaguarda "só quando líquido > 0 e mesmo plano" — mas hoje ela não altera nenhum valor.
