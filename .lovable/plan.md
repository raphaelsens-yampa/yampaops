# Revisão do Comissionamento

Quatro frentes aprovadas, na ordem de dependência. Conversões antigas de fev/2024 ficam como estão.

## 1. Atribuição de vendedor (maior impacto hoje)

Hoje o vendedor só vem do `price_id` no Mapa de Preços — por isso 306 conversões estão sem vendedor, ainda que 350 conversões do Stripe já tenham vendedor atribuído no próprio registro da conversão.

Nova cascata de atribuição, aplicada na apuração:

1. Override manual na linha de comissão (mantido intacto).
2. Vendedor atribuído na conversão do Stripe (o mesmo que a tela Conversões por Área usa).
3. Oportunidade vinculada à conversão (vendedor responsável).
4. Mapa de Preços (quando o price é dedicado a um vendedor).
5. Sem vendedor → linha entra como pendência de atribuição, não some do total.

Guardamos também a origem da atribuição (conversão, oportunidade, mapa, manual) para auditoria, e a tela passa a ter um filtro/aba "Sem vendedor" com ação de atribuir em lote.

## 2. Regras por tipo de conversão

A conversão do Stripe já é classificada como new / upsell / downgrade / renewal, e reativação (gap de 2 meses) já é marcada — mas nada disso muda o cálculo hoje.

Passa a existir, por tipo de conversão, uma regra de elegibilidade e multiplicador:

- Nova venda: 100% do percentual da Referência.
- Reativação: tratada como nova venda (padrão), configurável.
- Upsell: comissiona sobre o incremento de MRR (delta), não sobre o MRR total.
- Renovação: não comissiona (padrão).
- Downgrade: não comissiona.

Configurável em Configurações de Comissão, com os padrões acima. A linha de comissão passa a registrar o tipo e a base usada (MRR total ou delta), para o vendedor entender o valor.

## 3. Clawback / estorno por churn

Hoje a garantia está em 0 mês (estorno desligado) e a base de cancelamentos do Stripe está vazia — sem ela não há como estornar.

- Ligar a captura de cancelamentos (webhook + carga retroativa) e conferir volume antes de ativar regra.
- Definir garantia em meses nas Configurações (sugestão: 3).
- Cancelamento dentro da garantia gera uma linha de estorno vinculada à comissão original, com valor negativo, no mês de pagamento seguinte — nunca apagando o registro original.
- Estorno não é gerado se a comissão original ainda não foi paga: nesse caso a comissão é cancelada antes do pagamento.
- Painel de estornos por vendedor/mês, com possibilidade de perdão manual (justificado e logado).

## 4. Fechamento e pagamento

- Fechamento por mês de pagamento: ao fechar, os valores do mês são congelados e reprocessamentos deixam de alterá-los (ajustes viram estorno/complemento no mês seguinte).
- Estados: aberto → em revisão → fechado/pago, com quem fechou e quando.
- Extrato por vendedor do mês fechado (comissões, estornos, líquido a pagar) com exportação XLSX/CSV.
- Reprocessamento em lote respeita fechamento e overrides manuais.

## Detalhes técnicos

- `apply_commission_from_stripe`: nova cascata de vendedor, aplicação do multiplicador/elegibilidade por `conversion_type`/`is_reactivation`, base delta para upsell, respeito a `override_fields` e a mês fechado.
- `commission_settings`: colunas para elegibilidade e multiplicador por tipo de conversão, e uso efetivo de `guarantee_months`.
- `commission_conversions`: novas colunas para origem da atribuição, tipo de conversão e base de cálculo.
- Nova tabela de estornos (clawback) referenciando a comissão original e o evento de churn; nova tabela de fechamento por mês de pagamento.
- Ingestão de churn: ativar gravação em `stripe_churn_events` via webhook `customer.subscription.deleted` e função de carga retroativa.
- Reprocessamento retroativo limitado a 2026 (fev/2024 fica como está), via a rotina de reaplicação por período já existente.
- Telas: aba Conversões ganha filtro "Sem vendedor" e atribuição em lote; Visão Geral ganha bloco de estornos; nova aba Fechamento (admin) com extrato por vendedor.
