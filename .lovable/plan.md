## Objetivo

Criar uma visão "Low-touch" na aba **Metas Táticas** que mostre as vendas sem atuação de Sales/CS, classificadas pelas áreas (rótulo de Vendedor/Área do Mapa de Preços) que você escolher.

## O que existe hoje (verificado)

- O seletor de time em Metas Táticas tem "Visão Geral" + os times **Sales**, **CS**, **Suporte**.
- As conversões do Stripe recebem vendedor **exclusivamente** pelo Mapa de Preços. Nos últimos 60 dias, 40 conversões com valor > R$ 0 estão **sem vendedor pessoa**, e vêm de rótulos de área como **Produto, Marketing, Parceria, CX, 4blue** (além de rótulos que são pessoas, ex. Eduarda Nunes).

## Como vai funcionar

1. **Nova opção no seletor de time: "Low-touch"** (ao lado de Visão Geral e dos times), disponível para Admin/Tático.
2. **Classificação configurável**: a venda é Low-touch quando o rótulo de Vendedor/Área do Mapa de Preços do `price_id` da conversão está na lista de áreas marcadas como Low-touch.
3. **Configuração das áreas**: dentro da visão Low-touch, um painel "Áreas Low-touch" lista todos os rótulos existentes no Mapa de Preços com checkboxes. A seleção fica salva no banco (não só no navegador), então vale para todos os usuários. Sugestão inicial pré-marcada: Produto, Marketing, Parceria, CX, 4blue — você ajusta à vontade.

## Conteúdo da visão Low-touch

- **Cards do dia**: Vendas do dia (quantidade) e MRR Vendas do dia, somente Low-touch, respeitando a data de referência do calendário da tela. Sem meta diária (não há meta cadastrada), então os cards mostram apenas realizado do dia + comparativo com a média dos últimos 30 dias.
- **Gráfico acumulado**: linha de vendas e MRR acumulados no período filtrado (mesmos filtros de granularidade do gráfico atual), sem linha de meta.
- **Ranking por área**: tabela com Área, nº de vendas, MRR e % do total Low-touch no período.
- **Tabela de clientes convertidos**: nome, e-mail, plano, área, data da conversão, preço e MRR — com busca, seletor de período (hoje/7/30/60 dias) e colapso, igual à tabela atual.
- Seções que dependem de meta diária/pessoas (Missão do Dia, Placar do Time, Consistência, Clientes recuperados) ficam ocultas nessa visão.

## Detalhes técnicos

- Migração: nova tabela `tactical_lowtouch_areas` (label text único, is_active) com GRANTs e RLS — leitura para `authenticated`, escrita apenas para admin/tático (`has_role`). Seed com os rótulos de área não-pessoa hoje existentes.
- `useTacticalData.ts`: passa a trazer `stripe_price_id` nas conversões e um mapa `price_id → seller_label` de `commission_price_map`, além da lista de áreas Low-touch; agrega métricas virtuais `lowtouch_vendas` e `lowtouch_mrr` por dia.
- Novo componente `src/components/goals/tactical/LowTouchView.tsx` (cards + ranking por área) e `LowTouchAreasConfig.tsx` (checkboxes das áreas).
- `TacticalConversionsTable`/`TeamConversionsTable` ganha modo `lowTouch` que filtra por área em vez de `memberIds` e exibe a coluna Área.
- `TacticalProgressChart` recebe modo sem meta para plotar apenas o acumulado realizado.
- `TacticalTracking.tsx`: nova entrada `__lowtouch__` no seletor e renderização condicional da nova visão.
- Nenhuma alteração na regra de atribuição de vendedor nem nos dados de conversão existentes — a visão é apenas de leitura/classificação.
