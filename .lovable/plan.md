# Funis CRM — auditoria e correção dos números inflados

## Sua percepção está certa: os números estão superfaturados

Auditei o funil conectado ([Sales] Time Financeiro (Novo), 546 negócios) comparando o histórico de movimentações com o estado real de cada negócio.

Em setembro (01–17), a tela mostra:

| Indicador | Tela hoje | Real (negócios distintos) |
|---|---|---|
| Perdidos | 109 | 66 |
| Ganhos | 25 | 22 |
| Valor ganho | R$ 6.995,60 | R$ 5.828,60 |

Ou seja: perdas ~65% acima do real e ganhos ~14% acima. Isso contamina também win rate, ticket médio, ranking por executivo, motivos de perda, série diária e as taxas por etapa.

## Por que acontece

O histórico foi montado em dois momentos: o acompanhamento contínuo (que registrou o fechamento no instante em que percebeu) e um preenchimento retroativo (que registrou o fechamento na data real do negócio). Os dois registros do mesmo fechamento ficaram gravados, porque a chave de duplicidade inclui a data/hora — datas diferentes, mesmo fato.

Confirmado no banco: 49 negócios com perda registrada duas vezes e 5 com ganho registrado duas vezes. Além disso, o preenchimento retroativo gravou dezenas de perdas todas no mesmo horário de execução (ex.: 64 perdas às 20:18 de 15/08), então parte das perdas está no dia errado. Também existem 31 registros de negócios que já não existem mais no funil.

## Como corrigir

1. **Fechamentos passam a vir do estado do negócio, não do histórico.** Ganhos, perdidos, valor ganho, win rate, ticket médio, ciclo de fechamento, ranking por executivo e motivos de perda serão contados uma vez por negócio, na data real de fechamento. O histórico de movimentações continua servindo para entradas, movimentações entre etapas e taxas de passagem.
2. **Limpeza do histórico:** remover os fechamentos duplicados (mantendo o que tem a data real do negócio) e os registros de negócios que já não existem no funil.
3. **Impedir que volte a acontecer:** o registro de fechamento passa a ser único por negócio e por data real de fechamento, tanto no acompanhamento contínuo quanto no preenchimento retroativo; reabertura seguida de novo fechamento continua sendo tratada corretamente.
4. **Conferência contra o ActiveCampaign:** após a correção, comparo os totais do período direto na API do Active (negócios abertos, ganhos, perdidos e valor) com o que a tela mostra, e registro o resultado. A tela também ganha uma nota de "última conferência" com a data do último sincronismo.
5. **Rodada de sincronismo completa** para reconciliar os 14 negócios que existem no histórico mas não na base atual.

## Detalhes técnicos

- Fonte canônica de fechamento: `ac_funnel_deals` (`status`, `closed_at`, `value`, `loss_reason`); `ac_funnel_stage_events` fica restrito a `created` / `stage_change` e à leitura de movimentações.
- `src/lib/acFunnelKpis.ts`: `computeKpis`, `ownerRanking`, `stageConversion` e `meetingsByOwner` recebem os fechamentos derivados dos negócios (lista já deduplicada) em vez de filtrar `event_type in ('won','lost')`; testes em `src/test/acFunnelKpis.test.ts` cobrem o caso de fechamento duplicado.
- `src/pages/AcFunnelMetrics.tsx`: monta a lista de fechamentos do período a partir de `allDeals` (com `closed_at` no fuso America/Sao_Paulo) e passa aos cálculos; troca o `limit(5000)` de negócios por leitura paginada.
- Migração de limpeza: apaga duplicatas `won`/`lost` mantendo a linha cujo `occurred_at` bate com `deals.closed_at`, apaga eventos órfãos e cria índice único parcial por (`ac_deal_id`, `event_type`, dia de `occurred_at`) para fechamentos.
- `supabase/functions/ac-funnel-sync/index.ts` e `_shared/acFunnel.ts`: fechamento gravado com `occurred_at = closed_at` do Active (nunca o horário da execução) e upsert idempotente na nova chave.
- Sem alteração de escrita no ActiveCampaign; nada em Metas, comissionamento ou Stripe é tocado.
