# Filtro de Origem (4blue) em Conversões por Área

## Objetivo
Permitir ver a produção geral, só 4blue ou sem 4blue em toda a tela de Conversões por Área, com a origem registrada no banco do sistema (cruzada com o Metabase), não calculada na hora.

## Estado atual (confirmado)
- A tela usa a tabela `stripe_conversions`, que **não tem** coluna de origem.
- A origem existe na base de ativos pagantes (`origem_cliente` = yampa/4Blue), alimentada pelo Metabase.
- Cruzamento por e-mail hoje: 745 conversões Yampa, 49 4blue, **119 sem correspondência** (R$ 27.053,65) — essas precisam ser resolvidas na base do Metabase.

## O que será feito

### 1. Origem registrada no banco
- Nova coluna `origem_cliente` ("yampa" | "4blue" | null) em `stripe_conversions`.
- Preenchimento retroativo em duas passadas:
  1. Cruzamento por e-mail com a base de ativos pagantes já existente (resolve ~864 registros).
  2. Para os ~119 sem correspondência, consulta ao Metabase (base de clientes com origem) para classificar e gravar.
- Conversões futuras passam a receber a origem automaticamente na ingestão (a função que grava as conversões fará a busca por e-mail; se não achar, fica nula e entra numa rotina de reconciliação).

### 2. Filtro "Origem" na tela
- Novo seletor na linha de filtros: **Todas / Só 4blue / Sem 4blue** (padrão: Todas).
- Comportamento igual aos demais filtros: afeta cards, gráficos (área, plano, vendedor, evolução), ranking, tabela de detalhes e exportações CSV.
- "Sem 4blue" inclui Yampa + registros sem origem identificada (estes ficam visíveis para revisão).

### 3. Validação
- Conferir no navegador: Todas = Só 4blue + Sem 4blue (quantidade e MRR batem).
- Testes do helper de filtro atualizados.

## Detalhes técnicos
- Migration: `ALTER TABLE stripe_conversions ADD COLUMN origem_cliente text` + backfill SQL por e-mail.
- Resolução dos sem correspondência: consulta única ao Metabase via conector (base de clientes/origem), depois UPDATE por e-mail.
- Ingestão: ajuste na função que insere conversões para preencher `origem_cliente` no insert.
- Frontend: estado `origin` em `StripeConversions.tsx`, opção no helper `matchesConversion`/`ConversionFilters` em `src/lib/stripeConversions.ts`.
- Nada é publicado sem sua aprovação.
