# Tabela de Convertidos — Origem 4blue

## O que a base traz hoje

Verifiquei as bases do Metabase:

- `metas_price_daily` é a única com marcação de origem (`origem_cliente` = "yampa" / "4Blue"). Para 4blue ela grava **1 linha por dia e classificação** (novos_pagantes, upsell, downsell, recuperados), sempre com a oferta genérica "Bônus Iluminismo", `stripe_price_id = "—"` e valores **acumulados no mês (MTD)**.
- `metabase_daily_raw` está vazia (nenhum registro), portanto não há detalhamento por cliente vindo por ali.
- Não existe nenhuma tabela com e-mail/nome/plano de cliente para a origem 4blue — esse nível de detalhe só existe para Yampa, via Stripe (`stripe_conversions`).

Conclusão: uma tabela cliente-a-cliente igual à do Stripe não é possível com os dados que o Metabase envia hoje. O que dá para montar é a **tabela diária de conversões 4blue** derivada do MTD.

## O que vou construir

Nova tabela "Convertidos · Origem 4blue" na aba Metas Táticas, no mesmo padrão visual da tabela de Clientes convertidos (card colapsável, filtro de período: Hoje / 7 / 30 / 60 dias / personalizado, badge com total, linha de Total).

Colunas:

| Data | Novos pagantes (qtd / MRR) | Upsell (qtd / MRR) | Downsell (qtd / MRR) | Recuperados (qtd / MRR) | Total do dia (qtd / MRR) |

Regras de cálculo:

- Os valores de cada dia são o **delta do MTD**: valor do dia − valor do dia anterior dentro do mesmo `mes_ref`. No primeiro dia do mês o próprio MTD é o valor do dia.
- Deltas negativos (correções de snapshot) são exibidos como estão, sem zerar, para não esconder ajustes da base.
- Dias sem snapshot 4blue aparecem como "—" (sem inventar dado).
- Downsell é mostrado como valor negativo de MRR e não entra no total de quantidade de conversões.
- Rodapé com totais do período por classificação.

Também mostro no cabeçalho um aviso curto: dados agregados do Metabase (sem detalhe por cliente), atualizados em D-1.

## Detalhes técnicos

- Novo componente `src/components/goals/tactical/FourBlueConversionsTable.tsx`, espelhando a estrutura de `TeamConversionsTable.tsx` (Card + Collapsible + Select de período + Table, versão mobile em cards).
- Fonte: `metas_price_daily` filtrando `origem_cliente = '4Blue'`, buscando o período selecionado mais o último dia do mês anterior ao início (para calcular o delta do primeiro dia).
- Normalização de classificação reutilizando `normalizeClassificacao` de `src/lib/origins.ts`.
- Renderização em `TacticalTracking.tsx` logo abaixo da tabela de clientes convertidos, visível quando o filtro de origem for "Visão Geral" ou "4blue".
- Somente leitura: nenhuma migração de banco, nenhuma alteração nas regras de realizado existentes.

## Se quiser cliente-a-cliente depois

Precisaria de uma planilha 4blue com e-mail/nome/plano/MRR/data por cliente e um importador dedicado. Posso planejar isso em um segundo passo.
