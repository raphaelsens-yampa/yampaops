# Revisão do OnePage Diretoria — 100% a partir do sistema

## Diagnóstico
Hoje a tela inteira é uma foto fixa (dados até 01/09/2026) gerada por um processo externo. Nada é lido do sistema. A nova versão passa a buscar tudo direto da base do sistema, sem processo externo. O que o sistema não tem, sai da tela.

## Fica — já existe no sistema (com dado vivo)
Metas e realizado vêm do painel **Metas Estratégicas** (mesmas categorias, metas e realizado do Metabase):
- Total de MRR (atual vs meta) e Net MRR do mês.
- New MRR, Novas Vendas, Recuperados, Upsell.
- Churn de MRR, Churn de Logos, Churn % (logos), Downsell.
- Usuários Ativos Pagantes (meta vs realizado).
- Retenção (Pré-churn) — clientes em risco.
- MRR e Ativos do Yampa 2.0.
- Evolução mensal do ano: MRR e Ativos vs meta, e atingimento por mês.
- Séries diárias do mês: MRR, ativos, novos, churn (base diária do Metabase).
- Trials (base diária de trials).
- Conversões por área do mês (Conversões por Área), com filtro 4blue.
- ARPA (MRR ÷ ativos, calculado).

## Sai — não existe no sistema (vinha só do processo externo)
- P&L: Receita Geral, Margem de Contribuição, Lucro Operacional, Despesas Fixas, % Investimentos, "Estrutura de Resultado".
- Marketing do Looker: investimento, CP-FT, CAC, LTV/CAC, Branding x Sem Branding, tabela de campanhas de Junho, alerta Meta Ads.
- Produto: NPS, Must Have, Adoção YampaFin, retorno ao legado, Dados da Jornada.
- Roadmap, Riscos, Bloqueadores, Positivos, Iniciativas.
- Quadrimestre 2025×2026, Desempenho vs LY, Retração de Receita.
- Custos/decisões (regime tributário, economia IA/CTO), Impacto em empregos.
- Unit economics derivados do externo: LTV médio, Payback, Lifetime, ARPA do churn, Origem fechamentos 4Blue.
- Engajamento (donut Alto/Desengajado).
- Páginas repetidas: as 6 páginas viram 1 painel.

## Nova estrutura (uma página)
1. Faixa de KPIs: MRR atual, Net MRR, Ativos, Churn %, ARPA, Pré-churn — cada um com meta e % de atingimento das Metas Estratégicas.
2. Metas do mês: realizado vs meta de New MRR, Recuperados, Upsell, Churn MRR, Downsell (mesmos números da aba Estratégicas).
3. Evolução anual: MRR e Ativos vs meta, mês a mês.
4. Mês corrente dia a dia: MRR, novos, churn, trials.
5. Conversões do mês por área.
6. Seletor de mês (padrão: mês atual; meses fechados usam o fechamento oficial) e exportação em PDF mantida.

## Detalhes técnicos
- Remover `src/data/onePageData.ts` (estático) e reescrever `OnePageDiretoria.tsx` lendo: `goal_categories` + `goals` + `metabase_monthly_agg`/`metas_snapshot_diario` (mesma lógica de `MetabaseTracking.tsx`, extraída para um hook compartilhado para os números baterem com a aba Estratégicas), `metas_ativos_pagantes_daily`, `metas_trials_daily`, `metas_pre_churn`, `stripe_conversions`.
- Sem novas tabelas nem processos externos.
- Teste: KPIs do OnePage iguais aos da aba Metas Estratégicas para o mesmo mês.
