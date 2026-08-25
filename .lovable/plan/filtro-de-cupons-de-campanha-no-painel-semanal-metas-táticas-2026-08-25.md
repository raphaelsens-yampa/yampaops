# Filtro de cupons de campanha no painel semanal (Metas Táticas)

Objetivo: no painel de Metas x Realizado por semana da aba **Metas Táticas**, poder alternar entre **Tudo / Campanha / Não-campanha**, usando cupons da Stripe para identificar o que veio de campanha.

## Como vai funcionar

1. **Cadastro de cupons de campanha** (bloco novo em Configurações do painel tático, só admin/tático):
   - Lista os cupons encontrados nas conversões da Stripe (id, nome, nº de vendas, período de uso).
   - Checkbox "é campanha" por cupom, persistido em tabela própria.
   - Hoje existem ~30 cupons distintos; os mais usados incluem "(Sales) Workshop +Resultado 19/08", "(SALES) - YampaFin - Parceiro", "yampa +Controle [4b Manaus]".

2. **Seletor no painel semanal**: `Tudo` (atual) | `Campanha` | `Não-campanha`, ao lado do seletor de categorias, persistido no navegador junto das outras preferências do painel.

3. **Como o recorte é calculado**: o realizado semanal vem do snapshot do Metabase, que não tem cupom. Então o cupom é aplicado como **participação (share)**, exatamente no mesmo padrão já usado no filtro de origem 4blue/Yampa:
   - Para Vendas/New MRR, Recuperados e Upsell: share = MRR (ou qtd) das conversões Stripe do período com cupom de campanha ÷ total das conversões Stripe do mesmo período/classificação. O realizado da semana é multiplicado por esse share (ou por `1 − share` no modo Não-campanha).
   - Para **MRR Increase**: soma das componentes já recortadas.
   - Para **Churn e MRR Decrease**: cruzamento por e-mail — os cancelamentos do histórico de churn cujo e-mail aparece em alguma conversão Stripe com cupom de campanha contam como churn de campanha; o share do período sai dessa proporção (MRR e contagem) e é aplicado ao realizado do snapshot.

4. **Transparência**: quando não houver base para o recorte em uma categoria/semana (nenhuma conversão Stripe no período, ou nenhum cancelamento cruzável), a célula mostra "—" com dica explicando a ausência de recorte, igual ao filtro de origem. O modo Tudo nunca é afetado.

## Detalhes técnicos

- **Migração**: nova tabela `tactical_campaign_coupons` (`coupon_id` único, `coupon_name`, `is_campaign`, timestamps), com GRANTs e RLS: leitura para `authenticated`, escrita para `is_tatico_or_admin`.
- **Novo módulo** `src/components/goals/tactical/campaignCoupons.ts`: tipo `CouponFilter = "all" | "campaign" | "non_campaign"`, hook para ler o cadastro e helpers de share (espelhando `src/lib/origins.ts`: `buildCouponShares`, `couponShareAsOf`).
- **Fontes de dados**: `stripe_conversions` (`coupon_id`, `converted_at`, `mrr_net`/`mrr`, `conversion_type`, `is_reactivation`, `customer_email`) para o share de vendas/upsell/recuperados; `metas_churn_historico` (`email_norm`, `data_cancelamento`, `mrr`) cruzado com os e-mails de cupom de campanha para o share de churn.
- **`useCategoryWeeklyData.ts`**: aceita o parâmetro `coupon: CouponFilter`, carrega as bases acima quando o filtro é diferente de `all`, aplica o share sobre os pontos da série (mesmo ponto onde hoje aplica o share de origem) e marca as categorias sem recorte no conjunto já existente de "sem recorte".
- **`CategoryWeeklyGoalsPanel.tsx`**: novo seletor de modo, propagação para o hook e badge indicando o recorte ativo. As metas continuam as cadastradas (o filtro afeta apenas o realizado exibido) — o rótulo deixa isso explícito.
- **Escopo**: nenhuma alteração na aba Acompanhamento Metas nem nas demais visões táticas.
