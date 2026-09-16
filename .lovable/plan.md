# Filtro Campanha nos cards de crescimento (Acompanhamento Metas)

## Objetivo
Na linha dupla de crescimento ("% de Crescimento MRR a.m." e "% de Crescimento Ativos Pagantes a.m."), acrescentar um seletor **Tudo · Campanha · Não-campanha**, para ver quanto do crescimento do mês veio das ofertas de campanha e quanto veio do resto.

## Regras acordadas
- **Campanha** = clientes que entraram no mês por uma oferta com cupom marcado como campanha (Configurações → Cupons de campanha) **mais** as marcações manuais do painel Divergências de campanha.
- **Não-campanha** = o crescimento do mês sem essas entradas de campanha. Clientes de campanha de meses anteriores continuam no estoque (não são removidos do passado).
- Por construção, **Campanha + Não-campanha = Tudo** em cada mês, tanto em MRR quanto em contagem.

## Como o número é calculado
Base do mês anterior fica sempre a mesma (estoque do mês anterior). O que muda é a parcela do mês atual:

```text
Tudo          = (estoque atual / estoque anterior - 1)
Campanha      = (entradas de campanha do mês / estoque anterior)
Não-campanha  = ((estoque atual - entradas de campanha do mês) / estoque anterior - 1)
```

Aplica-se igual para MRR (soma de MRR) e para Ativos Pagantes (contagem de clientes).

O sub-texto de cada card passa a indicar o recorte, ex.:
- Campanha: "Set entradas R$ 2.790 · base Ago R$ 329.509"
- Não-campanha: "Set R$ 330.017 · vs Ago R$ 329.509"

## Comportamento na tela
- Seletor pequeno (3 botões) no topo da linha de crescimento, visível apenas na visão **Mês vigente**; o padrão é "Tudo" e a escolha fica guardada no navegador.
- Quando não há dado de cupom/mês anterior, o card mostra "—" como hoje.
- A linha de 4 cards abaixo (Meta, Realizado, Saldo, % Atingido) **não** muda.

## Detalhes técnicos
- Nova função no banco `metabase_campaign_entries_monthly(p_year int, p_as_of date)`: para cada mês, soma MRR e conta clientes distintos de `metas_ativos_pagantes_daily` (snapshot as-of, dedup por company_id/e-mail) cujo `data_inicio` cai no mês e cujo e-mail é reconhecido como campanha por:
  - `stripe_conversions` com `coupon_id` em `tactical_campaign_coupons` (is_campaign) e data de cobrança dentro de ±3 dias de `data_inicio` (mesma tolerância já usada em `tactical_weekly_mrr_actual`);
  - ou `tactical_campaign_manual_links` com `is_campaign = true` (marcação manual tem precedência).
  SECURITY INVOKER, `search_path = public`, EXECUTE apenas para `authenticated` e `service_role`; registrar na tipagem gerada.
- Novo hook `src/components/goals/useCampaignEntriesMonthly.ts` consumindo a função (mesmo padrão de `useOriginRealized`), retornando mapas `mrrByMonth` / `ativosByMonth` de entradas de campanha.
- `src/components/goals/MetabaseTracking.tsx`: estado `growthCampaign` ("all" | "campaign" | "non_campaign") persistido em `localStorage`, aplicação da fórmula acima em `growthPct` / `growthPctAtivos` (linhas ~1530-1535), seletor e sub-textos na linha de crescimento (linhas ~1615-1645).
- Sem mudança nos demais cards, gráficos ou abas.
