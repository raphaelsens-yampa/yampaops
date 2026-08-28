# Refatoração da apuração de Comissão (canon = Base Metabase)

A lógica atual está tecnicamente completa (percentuais, elegibilidade por tipo, upsell por delta, T+2, fechamento, overrides), mas não bate com a realidade por quatro motivos verificados no banco:

1. **Dupla contagem.** Jul e ago/2026 têm linhas de origem `stripe` (67 e 77) convivendo com linhas de origem `metabase` (23 e 152). Os totais das telas somam as duas verdades.
2. **Bug de fotografia na rotina Metabase.** A rotina usa a fotografia mais recente da base inteira, não a do mês apurado. Por isso julho gerou só 23 linhas: julho tem 165 linhas comissionáveis na fotografia de 31/07, mas a rotina leu a de 27/08, onde esses clientes já são "regular".
3. **Não filtra assinatura ativa.** A rotina considera qualquer linha da fotografia; a tela já filtra `ativo`. Dá diferença entre o que se vê e o que se apura.
4. **4blue entra na conta.** Na fotografia atual são 64 novos pagantes, 8 recuperados e 5 upsells de origem 4blue. Já existem 77 linhas de comissão 4blue criadas.

Nada de linha órfã: quando um cliente sai da fotografia do mês, a linha de comissão criada antes continua lá para sempre. Isso também será corrigido.

## O que muda

### 1. Origem do cliente
- A rotina de apuração passa a comissionar **somente `origem_cliente = yampa`**. 4blue nunca gera comissão.
- A aba **Base Metabase** deixa de exibir 4blue: tabela, KPIs, agrupamentos, exportações e alertas passam a considerar só Yampa (mantendo o filtro atual de Novo Pagante / Recuperado / Upsell e assinatura ativa).
- As 77 linhas 4blue já criadas ficam no banco marcadas como **não comissionáveis**, fora de todos os totais e KPIs, acessíveis por um filtro na aba Conversões.

### 2. Stripe sai de cena
- As 613 linhas de origem `stripe` são apagadas do comissionamento. As conversões do Stripe continuam intactas na tela Conversões por Área — só deixam de alimentar comissão.
- O gatilho automático do Stripe (já desativado) e a aba Stripe seguem fora.
- Importações manuais (44 linhas, abr–mai/2026) e ajustes manuais são preservados.

### 3. Rotina de apuração corrigida
- Fotografia certa por mês: usa o fechamento mensal do mês apurado (ou a última fotografia dentro daquele mês) e, só para o mês vigente, a fotografia mais recente — exatamente o mesmo critério da aba Base Metabase.
- Filtra assinatura ativa e `data_pagamento` dentro do mês (fuso São Paulo).
- Comissiona apenas Novo Pagante, Recuperado e Upsell (upsell no delta `mrr - previous_mrr`, delta ≤ 0 não comissiona; `previous_mrr` vazio vira pendência).
- Ao reprocessar um mês, linhas Metabase daquele mês que não existem mais na fotografia são removidas — a não ser que tenham revisão manual, quando ficam sinalizadas para conferência.
- Vendedor pelo mapa de Price ID; sem correspondência vai para "Sem vendedor", e a atribuição manual persiste no reprocesso.
- Mês de pagamento continua M+2 do mês da venda; mês fechado nunca é alterado.

### 4. Reprocesso de jan a ago/2026
- Reprocessa os oito meses pela fotografia de fechamento de cada mês (jan–jul) e pela fotografia vigente (ago), preservando overrides.
- Volume esperado por mês, só Yampa e comissionáveis: os fechamentos têm 142 (jan), 132 (fev), 121 (mar), 117 (abr), 119 (mai), 171 (jun) e 165 (jul) linhas comissionáveis antes do corte 4blue.
- Ao final, um resumo por mês (linhas, MRR, comissão, pendências, sem vendedor) para conferir contra a realidade.

### 5. Conferência
- A aba Visão Geral passa a refletir apenas Metabase + importações manuais: **Mês da Venda** mostra MRR, vendas e comissão gerada; **Mês de Pagamento** mostra a comissão a pagar (referente a M-2).
- A aba Base Metabase ganha, no cabeçalho, a comparação entre linhas comissionáveis da fotografia e linhas de comissão geradas no mês, para tornar visível qualquer divergência.

## Detalhes técnicos

- Reescrita de `apply_commissions_from_metabase(p_month)`: resolução de snapshot por mês, `status_assinatura = 'ativo'`, `lower(origem_cliente) = 'yampa'`, remoção de linhas Metabase obsoletas do mês, restante das regras preservado.
- Nova coluna/flag de não comissionável em `commission_conversions` para as linhas 4blue e filtros correspondentes.
- Limpeza de dados: `delete from commission_conversions where source = 'stripe'`.
- Frontend: filtro de origem Yampa em `ComissionamentoMetabaseBase.tsx` (consulta, KPIs, tabela, exportações); filtro de não comissionáveis em `ComissionamentoConversions.tsx`; cabeçalho de conferência na Base Metabase.
- Reprocesso via chamadas mensais da rotina, respeitando `commission_month_locked`.
