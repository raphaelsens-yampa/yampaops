# Cohort: usar MRR líquido em todos os cenários

## Situação atual (verificada)

- `campaign_cohort_refresh` grava o MRR do cohort com esta precedência: Metabase (`metas_ativos_pagantes_daily.mrr`) → histórico de churn (`metas_churn_historico.mrr`) → Stripe (`COALESCE(stripe_conversions.mrr_net, mrr)`).
- Ou seja: só a origem Stripe já é líquida; Metabase e histórico são MRR bruto.
- A tabela do Metabase **não possui** campo de MRR líquido (só `mrr` e `previous_mrr`), então o líquido precisa vir do Stripe.
- Em `stripe_conversions`: 685 registros, 315 com `mrr_net` preenchido, 34 em que o líquido difere do bruto (casos com cupom/desconto).

## O que será feito

Passar a usar o MRR líquido do Stripe como valor preferencial em **todas** as origens do cohort, mantendo o bruto apenas como fallback quando não existir líquido para o e-mail.

Nova precedência do campo MRR gravado em `campaign_cohort_results`:

```text
1. stripe_conversions.mrr_net (líquido, por e-mail normalizado)
2. MRR da origem que determinou o status (Metabase ativo / histórico de churn / Stripe bruto)
3. 0
```

Assim, um cliente ativo na base do Metabase que teve cupom aplicado passa a exibir o valor líquido real; quem não tem registro de líquido continua com o valor atual (sem regressão).

## Mudanças técnicas

1. **Migração** — recriar `public.campaign_cohort_refresh`:
   - na CTE `sc`, expor separadamente `mrr_net` e `mrr_gross`;
   - na expressão de MRR do `INSERT`, aplicar a nova precedência com `COALESCE(j.s_mrr_net, <valor da origem>, 0)`;
   - manter intactos status, datas, plano, origem, churn e o resto da lógica.
2. **`campaign_cohort_stripe_fill`** — revisar e garantir que também escreve `COALESCE(mrr_net, mrr)`.
3. **Edge Function `cohort-stripe-live`** — já calcula valor a partir do preço da assinatura; ajustar para descontar cupom/desconto ativo da assinatura, ficando coerente com o conceito de líquido.
4. **Reprocessamento** — após a migração, rodar o refresh das campanhas existentes para os valores serem regravados (botão de atualizar cohort na tela já dispara isso).
5. Nenhuma alteração de layout em `CohortPanel.tsx` — ele apenas exibe o campo `mrr` que passa a ser líquido.
