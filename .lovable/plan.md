# Padronizar o "Realizado" de New MRR entre Metas Operacionais, Táticas e Estratégicas

## O que já foi confirmado
- Pagamentos confirmados na Stripe em novembro (até hoje): 14 vendas novas (R$ 5.457,96) + 4 upsells (R$ 806,42 de aumento líquido) + 1 downgrade (-R$ 69,50).
- Metas Operacionais mostra R$ 2.416 no mês, bem abaixo desses valores, embora a quantidade (14 vendas) bata.
- A base diária oficial do Metabase ficou sem atualizar de 01/11 a 11/11 (falha na importação corrigida hoje). A causa provável é que cada tela trata esses dias "sem foto" de um jeito diferente: uma usa Stripe, outra lê zero ou a foto antiga. Isso ainda não foi confirmado linha a linha.

## Regra única proposta (a "correta")
Usar a mesma regra das Metas Táticas, que hoje é a mais completa:
- New MRR = vendas novas pagas + Recuperados (só o MRR que entra de fato na base) + upsell líquido por cliente.
- Dias com foto oficial do Metabase: usar a foto. Dias sem foto (ou de hoje): usar os pagamentos confirmados da Stripe.
- O filtro de Origem (Yampa/4blue) continua valendo nas três telas.

## Passos
1. Conferir dia a dia de 01/11 a 12/11 o valor de cada tela e confirmar onde aparece a diferença.
2. Criar um cálculo único de "New MRR realizado por dia", testado, a partir da regra das Metas Táticas.
3. Fazer Metas Operacionais (painel, gráfico diário, link da TV) e o mês corrente das Metas Estratégicas usarem esse cálculo.
4. Validar: os três totais de novembro precisam bater, com e sem filtro de origem.

## Detalhes técnicos
- Extrair a resolução diária de `useTacticalData` para um helper puro em `src/lib/` (com testes), reutilizado por `OperationalGoals.tsx` e pelo agregado de Metas Estratégicas (`origins.ts`/`MetabaseTracking`).
- Meses fechados nas Estratégicas continuam vindo do Metabase. Só o mês aberto passa a usar o helper.
- Registrar a regra em AGENTS.md.
