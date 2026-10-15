# Filtro de Origem (4blue) em Conversões por Área

## Objetivo
Ver a produção geral, só 4blue ou sem 4blue em toda a tela de Conversões por Área. Como o Stripe não contém as vendas 4blue, elas serão trazidas do Metabase para a base de conversões do sistema.

## Estado atual (confirmado)
- A tela usa `stripe_conversions` (só Stripe) — as vendas 4blue **não existem** lá.
- A base de ativos pagantes (`metas_ativos_pagantes_daily`, alimentada do Metabase pela ingestão diária) já tem cada cliente com `origem_cliente`, `gateway = 4blue`, plano, MRR, data de início e classificação "novo pagante" — é a fonte das vendas 4blue.
- Cruzamento por e-mail com as conversões Stripe: 745 Yampa, 49 4blue, 119 sem correspondência.

## O que será feito

### 1. Origem registrada na base de conversões
- Nova coluna `origem_cliente` ("yampa" | "4blue") em `stripe_conversions`.
- Backfill das conversões existentes por e-mail contra a base de ativos pagantes.
- Conversões Stripe futuras recebem a origem automaticamente na ingestão.

### 2. Entrada das vendas 4blue (que não estão no Stripe)
- Rotina de sincronização (função de backend, rodando junto com a ingestão diária do Metabase) que lê os "novo pagante" com `origem_cliente = 4blue` da base de ativos pagantes e insere em `stripe_conversions` as vendas que ainda não existem lá:
  - `conversion_type = 'new'`, `area = 'Sales'`, plano e MRR da base Metabase, `converted_at = data_inicio`, `origem_cliente = '4blue'`, fonte marcada como Metabase/4blue.
  - Deduplicação por e-mail + data de início, para nunca repetir venda.
- Upsells/recuperações 4blue ficam fora deste primeiro passo (a base de conversões Stripe não os tem; se quiser, avaliamos depois).

### 3. Filtro "Origem" na tela
- Novo seletor na linha de filtros: **Todas / Só 4blue / Sem 4blue** (padrão: Todas).
- Afeta cards, gráficos (área, plano, vendedor, evolução), ranking, tabela de detalhes e exportações CSV — igual aos demais filtros.
- "Sem 4blue" = Yampa + eventuais registros sem origem identificada.

### 4. Validação
- No navegador: Todas = Só 4blue + Sem 4blue (quantidade e MRR batem).
- Testes do helper de filtro atualizados; nada é publicado sem sua aprovação.

## Detalhes técnicos
- Migration: `ALTER TABLE stripe_conversions ADD COLUMN origem_cliente text` + backfill por e-mail.
- Sync 4blue: nova etapa na função de ingestão existente (ou função `stripe-4blue-sync`) lendo `metas_ativos_pagantes_daily` e inserindo ausentes com `stripe_event_id` sintético único (`4blue:<email>:<data_inicio>`) para idempotência.
- Frontend: estado `origin` em `StripeConversions.tsx` + `matchesConversion`/`ConversionFilters` em `src/lib/stripeConversions.ts`.
