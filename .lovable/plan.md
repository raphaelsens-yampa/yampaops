# Metas semanais vivas (rebalanceamento entre semanas)

Hoje a meta de cada semana é sempre `meta do mês ÷ dias úteis do mês × dias úteis da semana` — um valor estático que ignora o que já foi realizado. A proposta é manter esse valor como **Meta original** e adicionar uma **Meta revisada**, recalculada semana a semana conforme o realizado das semanas já fechadas.

## Regra

- Semanas **fechadas** (terminaram antes de hoje): meta revisada = meta original. Nunca muda.
- Semana **vigente**: meta revisada = meta original. Nunca muda (o dado da semana ainda não é oficial).
- Semanas **futuras**: recebem o saldo que falta para fechar o mês, rateado por dias úteis.

Cálculo para as semanas futuras:

```text
saldo = meta do mês
      - realizado das semanas fechadas
      - meta original da semana vigente

meta revisada (semana futura) = max(0, saldo) x dias úteis da semana
                                          / dias úteis das semanas futuras
```

Exemplo do enunciado (MRR Increase, agosto):
S2 tinha meta R$ 4.895 e realizou R$ 4.913 (+R$ 18). S1 e S2 continuam com R$ 4.895/R$ 0; S4 (vigente) segue R$ 4.895; o excedente de R$ 18 e o déficit de S3 são somados e redistribuídos entre S5 e S6 proporcionalmente aos dias úteis (5 e 1).

Casos tratados:
- **Excedente** reduz as semanas futuras (piso zero), diferente da regra mensal de trimestre onde superávit não abate nada — aqui é o mesmo mês, o compromisso é a meta mensal.
- **Categorias "menor é melhor"** (churn, MRR Decrease): saldo = limite do mês − realizado; se o realizado já estourou o limite, as semanas futuras vão a zero.
- **Categorias de estoque** (MRR total, ativos, churn %): não têm rateio semanal hoje e continuam comparando o nível da semana com a meta do mês — sem revisão.
- Se não existir semana futura (fim do mês), o resíduo é mostrado como "não recuperável no mês".

## O que muda na tela

Nos dois painéis semanais da aba **Metas Táticas**:
- `Metas semanais do mês` (métricas táticas: Vendas do dia, MRR, Recuperados, Retidos, Upsell, Recuperados FT)
- `Metas por categoria — quebra semanal` (MRR Increase, MRR Decrease e demais categorias)

Adições:
1. Toggle **Original / Revisada** no cabeçalho de cada painel (padrão: Revisada), persistido em `localStorage`.
2. Na visão Revisada, semanas futuras mostram a meta recalculada com um chip discreto (`▲ +R$ 710` / `▼ −R$ 18`) e tooltip "meta original R$ 4.895 — reajustada pelo saldo das semanas fechadas".
3. Semanas fechadas e a vigente ficam visualmente inalteradas, com legenda "metas oficializadas".
4. Total do mês continua igual nas duas visões (a soma é preservada), servindo de conferência.
5. Colunas financeiras (Meta R$ / Saldo R$) do painel de métricas táticas seguem a mesma revisão.

Nada é gravado no banco: as metas cadastradas (mensal e diária) continuam sendo a única fonte; a revisão é derivada em tempo de leitura, então o registro das metas iniciais nunca é perdido.

## Detalhes técnicos

- Nova função pura `computeRevisedWeeklyTargets()` em `src/lib/revisedGoals.ts`, recebendo `[{ index, businessDays, originalTarget, realized, status: closed|current|future }]`, `monthTarget` e `lowerIsBetter`, devolvendo `revisedTarget` e `delta` por semana + `unrecovered`.
- Testes em `src/test/revisedGoals.test.ts`: excedente, déficit, mês sem semana futura, categoria teto, semana com 0 dias úteis.
- `WeeklyGoalsPanel.tsx`: aplicar sobre `rows` (campos `target` e `finTarget`) depois do cálculo atual, antes de `totals`.
- `CategoryWeeklyGoalsPanel.tsx`: aplicar por bloco de categoria, pulando `STOCK_CATEGORY_SLUGS`, usando `isBetterBelow(cat.goal_direction)` como `lowerIsBetter`.
- Semanas futuras sem realizado seguem com `realized = null` (exibindo "—"), apenas a meta muda.
