# Metas semanais: superávit não reduz as semanas futuras

Hoje a revisão semanal rateia o **saldo** que falta do mês entre as semanas futuras. Quando as semanas fechadas superam a meta, esse saldo fica menor que a soma das metas originais das semanas futuras e a meta revisada **cai abaixo da original** (o painel mostra um chip `▼`). A regra passa a ser: bater a meta antes do tempo nunca alivia as semanas seguintes.

## Regra nova

Para categorias/métricas de crescimento ("maior é melhor" — Vendas, MRR, Recuperados, Retidos, Upsell, MRR Increase):

```text
meta revisada (semana futura) = max( meta original,
                                     saldo x dias úteis da semana
                                     / dias úteis das semanas futuras )
```

- Déficit continua sendo redistribuído para cima (`▲`), como hoje.
- Superávit deixa de gerar `▼`: a semana futura mantém a meta original.
- Categorias "menor é melhor" (churn, MRR Decrease) seguem a lógica atual de teto — lá, consumir menos limite deve mesmo aliviar as semanas seguintes.
- Categorias de estoque continuam fora da revisão.

## Impacto (o que muda na tela)

Aba **Metas Táticas**, nos dois painéis semanais:
- `Metas semanais do mês` — colunas Meta e Meta R$ das semanas futuras nunca ficam abaixo do valor original; chips `▼` desaparecem nas métricas de crescimento.
- `Metas por categoria — quebra semanal` — mesma coisa por categoria, exceto as de teto.

Consequência importante: o **total do mês na visão Revisada passa a poder ser maior que a meta mensal** quando houver superávit acumulado (hoje a soma era preservada). O rodapé de total deixa de servir como conferência exata; é o comportamento esperado — a meta mensal é piso, não teto. Sem superávit, nada muda em relação ao que já é exibido.

Nada é gravado no banco: a revisão continua derivada em tempo de leitura, as metas cadastradas seguem intactas e o toggle Original/Revisada permanece.

## Detalhes técnicos

- `src/lib/revisedGoals.ts` / `computeRevisedWeeklyTargets`: novo parâmetro `allowDecrease` (default `false`). Quando `false` e `lowerIsBetter === false`, aplicar `revised = Math.max(originalTarget ?? 0, rateio)`. O caminho "sem semana futura" também deixa de zerar metas futuras nesse modo.
- `WeeklyGoalsPanel.tsx`: nas duas chamadas (meta e `finTarget`) usar o novo default; nada mais muda.
- `CategoryWeeklyGoalsPanel.tsx`: passar `allowDecrease: isBetterBelow(cat.goal_direction)` para preservar o alívio nas categorias de teto.
- `src/test/revisedWeeklyGoals.test.ts`: ajustar o caso "reduz as semanas futuras quando houve excedente" para esperar a meta original, e manter/incluir casos de déficit e de categoria teto.
