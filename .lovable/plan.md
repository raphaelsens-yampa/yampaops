# Auditoria: por que "Upsell" aparece com Realizado zerado

## O que os dados mostram

A base diária do Metabase (`metas_price_daily`) tem upsell em agosto:

```text
09/08  yampa  5 clientes  R$ 1.597,04 (MTD)
       price_1OVF5lDrhWjWTprTQUGk6eZf  2  R$ 397,30
       price_1OVF5yDrhWjWTprTFuwOUwSg  1  R$ 199,95
       price_1OVF5yDrhWjWTprTzjxwzAcZ  1  R$ 199,89
       price_1T6zKvDrhWjWTprTs4ceB2hk  1  R$ 799,90
09/08  4Blue  1 cliente   R$ 65,00 (MTD)
```

E `tactical_manual_entries` está **vazia** para agosto (nenhum lançamento manual em 2026-08).

## A causa

O painel "Metas semanais do mês" lê o realizado da métrica `upsell_dia` a partir da série diária montada em `useTacticalData`. Nessa montagem:

- `upsell_dia` (quantidade) e o MRR de upsell só são alimentados por **lançamento manual** (`tactical_manual_entries.mrr_value`) — que não existe em agosto;
- a base diária `metas_price_daily` é lida, mas o bloco só roda quando o recorte **não** é "yampa" e só consome as chaves `4blue|...`, atribuindo tudo ao vendedor virtual 4blue.

Resultado: o upsell de origem **yampa** (o volume real de agosto) nunca entra na série tática, e o card/coluna fica em 0 — inclusive no recorte "Geral", onde só o pedaço 4blue apareceria.

Isso vale igualmente para "Recuperados FT": mesma dependência de lançamento manual.

## A correção proposta

Em `useTacticalData.ts`, tratar a base diária como fonte de realizado para **todas** as origens, não só 4blue:

1. Ler `metas_price_daily` no período sempre (independente do recorte) e converter MTD → diário com `computeOriginDaily` (já existente).
2. Para cada dia, alimentar as métricas a partir do recorte ativo:
   - recorte `yampa` → série `yampa|...`, atribuída a um vendedor virtual yampa (ou a um bucket "base diária") para não inflar ranking individual;
   - recorte `4blue` → série `4blue|...` no vendedor virtual 4blue (comportamento atual);
   - recorte `all` → série `all|...`, já consolidada no hook (não soma yampa + 4blue, para não duplicar o dia 07/08).
3. Evitar dupla contagem com o Stripe: `upsell_dia`/`recuperados_ft` e seus MRR virtuais passam a vir exclusivamente da base diária; vendas novas (`mrr_dia`, `vendas_dia`) continuam do Stripe no recorte yampa, e da base diária apenas para 4blue, como hoje.
4. Se houver lançamento manual para uma métrica/dia já coberto pela base diária, a base diária prevalece (o manual serve de backup para dias sem captura) — com nota na tela indicando a fonte.
5. **Classificação manda, origem não.** Nenhuma linha entra em Upsell por ser 4blue: só entra o que o Metabase marcou com `classificacao = upsell`. A origem (`yampa` / `4Blue`) apenas decide em qual recorte a linha aparece. Linhas 4blue de `novos_pagantes`, `recuperados` ou `downsell` continuam indo para as métricas correspondentes — nunca para upsell.


## Detalhes técnicos

- Arquivo principal: `src/components/goals/tactical/useTacticalData.ts` (remover a condição `origin !== "yampa"` e o hardcode de `4blue|` nas chaves; introduzir `YAMPA_USER_ID` virtual análogo a `FOURBLUE_USER_ID`).
- `WeeklyGoalsPanel.tsx` e `MissionToday.tsx` não mudam de lógica: passam a receber os valores porque a série tática agora existe.
- `computeOriginDaily` em `src/hooks/useOriginFlows.ts` fica como está (já produz as três séries).
- Sem migração de banco.

## Observação sobre o número citado

Os R$ 1.198,50 correspondem ao upsell do agregado mensal (`metabase_monthly_agg`), que está defasado. A base diária mostra R$ 1.597,04 yampa + R$ 65,00 4blue no MTD de 09/08 — é esse valor que a tela passará a exibir.
