# Regras canônicas dos realizados — Metas Táticas

Objetivo: definir uma única fonte de verdade por dia para Vendas do Dia (New MRR), Recuperados FT e Upsell, com Stripe valendo só para o dia vigente e Metabase (D-1) valendo para todo o histórico.

## Regra canônica

| Métrica tática | Dia vigente (hoje) | Dias anteriores (histórico) |
| --- | --- | --- |
| Vendas do Dia (New MRR) | Stripe (tempo real) | Metabase — Pagante Direto + Conversão |
| Recuperados FT | Stripe (reativações) | Metabase — Recuperado |
| Upsell | sem dado (fica "—") | Metabase — Upsell |
| Clientes Recuperados / Retidos (CS manual) | lançamento manual | lançamento manual (inalterado) |

Complementos:
- Se um dia passado não tiver snapshot do Metabase, o realizado é 0 com o aviso "sem dado Metabase" na célula/linha (nunca cai silenciosamente para o Stripe).
- O backup diário do Stripe existe para consulta e para a substituição manual, mas nunca é a fonte padrão do histórico.

## Nova tabela de entrada do Metabase (a ser populada pelo Claude)

Como a base atual (`metas_daily`) só traz `novos_pagantes` agregado, criamos uma tabela dedicada à quebra dos Novos Pagantes:

`metas_novos_pagantes_daily`
- `data` (date) — dia da coleta (D-1)
- `mes_ref` (text)
- `classificacao` (text) — `pagante_direto` | `conversao` | `recuperado`
- `vendedor`, `area` (text, opcionais)
- `qtd_mtd` (int) e `mrr_mtd` (numeric) — acumulado do mês, no mesmo padrão do `metas_daily`
- `tipo_snapshot`, `fonte`, `coletado_em`
- índice único por (`data`, `classificacao`, `vendedor`, `area`) para permitir reenvio idempotente

Uma view `metas_novos_pagantes_delta` calcula o valor **por dia** (diferença de MTD entre snapshots consecutivos), igual à `metas_daily_delta` já existente.

## Backup diário do Stripe

`tactical_stripe_daily_backup`
- `data` (date), `metric_key` (`vendas_dia` | `recuperados_ft`), `user_id` (vendedor), `qtd`, `mrr`
- `captured_at`, único por (`data`, `metric_key`, `user_id`)
- Gravado automaticamente a partir de `stripe_conversions` (valor líquido > 0) ao carregar/atualizar o painel do dia, e por um botão de recaptura de período.
- Visível para Admin/Tático em uma seção recolhível no painel de Metas Táticas.

## Botão "Forçar Atualização com base Stripe"

- Visível somente para Admin, dentro do painel de Metas Táticas.
- Permite escolher um **intervalo de datas** e substitui o realizado desses dias pelos números do backup Stripe.
- A substituição é registrada como override explícito (tabela `tactical_realized_overrides`: `data`, `metric_key`, `user_id`, `qtd`, `mrr`, `origem = 'stripe_backup'`, `created_by`), então a resolução final por dia passa a ser: override > (hoje ? Stripe : Metabase).
- Interface mostra prévia (antes/depois) antes de confirmar e permite remover o override, voltando à regra canônica.

## Onde isso aparece na tela

- Cards da Missão do Dia, Placar, Metas semanais do mês e gráfico de progresso passam a usar o mesmo resolvedor de realizado, de modo que hoje mostre Stripe e os dias anteriores mostrem Metabase.
- Legenda de origem por dia ("Stripe · hoje", "Metabase · D-1", "Override Stripe") para leitura clara.
- Dias sem Metabase aparecem como 0 com aviso.

## Detalhes técnicos

- Migração: cria `metas_novos_pagantes_daily` (+ GRANTs, RLS: leitura para autenticados, escrita para service_role/admin), a view de delta, `tactical_stripe_daily_backup` e `tactical_realized_overrides`.
- Novo hook `useTacticalRealized` centraliza a resolução por (dia, métrica, usuário): consulta os deltas do Metabase para o intervalo, o agregado Stripe do dia vigente e os overrides; expõe também a origem de cada dia.
- `useTacticalData.ts` deixa de somar Stripe em dias anteriores e passa a delegar Vendas do Dia / Recuperados FT / Upsell ao novo hook; lançamentos manuais de CS (recuperados/retidos) continuam como hoje.
- `WeeklyGoalsPanel.tsx` e `CategoryWeeklyGoalsPanel.tsx` consomem o mesmo realizado, mantendo as metas atuais por categoria.
- Novo componente `StripeBackupPanel.tsx` com a tabela de backup, seletor de intervalo, prévia e o botão de forçar atualização.
