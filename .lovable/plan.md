# Vendas do cupom LmgNu12A: por que faltou valor

## O que a checagem mostrou

Os 10 e-mails estão todos na base de ativos pagantes (fotografia de 13/09), como **novo pagante**, R$ 279,02 cada = **R$ 2.790,20**. Ou seja, o valor total está correto no sistema.

O problema é o recorte **Campanha**: só 7 dos 10 são reconhecidos como venda de campanha (R$ 1.953,14). Faltam **R$ 837,06** (3 clientes), por dois motivos confirmados:

1. **Data diferente entre as duas fontes** — o vínculo com o cupom hoje só é aceito quando a data da cobrança no Stripe é exatamente igual à data de início do cliente na base.
   - botebrasil@outlook.com.br: início 10/09, cobrança 11/09
   - gustavo_moreira_campos@yahoo.com.br: início 10/09, cobrança 11/09
2. **Venda sem registro no Stripe dentro do sistema** — simonetto.sertaozinho@gmail.com não tem nenhum registro de conversão do Stripe (nem com cupom, nem sem). A venda existe na base de ativos, mas o evento de cobrança não chegou aqui.

Observação: há também um registro duplicado (renovação) para contato@seccol.com.br no mesmo dia; ele não infla o valor hoje, mas convém limpar.

## O que fazer

1. **Tolerância de data no vínculo do cupom**: aceitar a cobrança do Stripe quando ela ocorrer até 3 dias antes ou depois da data de início do cliente, pegando a mais próxima. Isso recupera botebrasil e gustavo automaticamente.
2. **Marcação manual de campanha**: permitir marcar/desmarcar um cliente como venda de campanha quando não existe registro de cobrança (caso simonetto), com registro de quem marcou. A marcação manual tem prioridade sobre a automática.
3. **Painel de divergências**: na tela de Campanhas, listar clientes com cupom de campanha sem correspondência e clientes da base sem registro de cobrança no período, para conferência rápida.
4. **Reprocessar** o período 10/09–12/09 e confirmar que o recorte Campanha fecha em R$ 2.790,20 e que Campanha + Não-campanha continua igual a Tudo.

## Detalhes técnicos

- `tactical_weekly_mrr_actual`: substituir a igualdade `(sc.converted_at AT TIME ZONE 'America/Sao_Paulo')::date = d.activation_date` por janela `BETWEEN activation_date - 3 AND activation_date + 3`, mantendo o filtro de compatibilidade de classificação e `tactical_campaign_coupons.is_campaign`.
- Nova tabela `tactical_campaign_manual_links` (email_norm, activation_date, coupon_id, is_campaign, created_by, timestamps) com RLS para admin/tático; a RPC faz `LEFT JOIN` e usa `coalesce(manual.is_campaign, auto_match)`.
- Ignorar `conversion_type = 'renewal'` já ocorre; adicionar `DISTINCT` na busca para evitar dupla contagem quando houver mais de uma cobrança na janela.
- Divergências: nova RPC `tactical_campaign_match_gaps(p_from, p_to)` consumida por um card na tela de Campanhas.
