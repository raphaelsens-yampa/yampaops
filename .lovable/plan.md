# Revisão do OnePage Diretoria

## Diagnóstico
A tela inteira é uma "foto" fixa gravada em 02/09/2026 (dados até 01/09). Nada é lido do sistema; o gerador que atualizava a foto não está no projeto, então ela não é atualizada há ~45 dias. Hoje (16/10) nenhum número reflete outubro e setembro não aparece.

## O que ainda está correto (como histórico de Agosto fechado)
- MRR fechado ago R$329,5k, Ativos 2.298, Novos 118, Churns 132, Saldo MRR R$4,7k.
- Cards de Metas ago (New, Recuperado, Upsell, Churn, Downsell vs meta).
- Série mensal Jan–Ago (MRR, ativos, metas, saldo, atingimento).
- Metas anuais Dez/26 (MRR R$512k, Ativos 3.540) — válidas se não foram revisadas.
Tudo isso já existe, atualizado, em Metas / Acompanhamento.

## O que está defasado (números "atuais" que já não são atuais)
- MRR Atual, Ativos, Churn atual, ARPA, Pré-churn, Trials (posição 01/09).
- Séries diárias de agosto.
- Marketing/Campanhas e LTV/CAC (coorte de Junho, Looker não integrado).
- P&L (Receita, Margem, Lucro Operacional, Despesas Fixas) — projeção de Julho.
- NPS, Must Have, Adoção YampaFin (ago).

## O que pode ser descartado
- Roadmap/Riscos/Bloqueadores/Positivos e Iniciativas (texto fixo, sem dono nem atualização).
- "Quadrimestre 2025×2026", "Desempenho vs LY -88%", "Retração Receita".
- Bloco Branding x Sem Branding e tabela de campanhas de Junho (já há Histórico de Campanhas).
- Alertas de LTV/CAC "até Jun/26" (prazo vencido).
- "Dados da Jornada — em breve", "Impacto em empregos", custos/decisões (IA design, CTO).
- Página 2 (Financeiro) duplicada da página 1, e KPIs repetidos em 4 das 6 páginas.

## Proposta (após sua aprovação)
Enxugar para 1 página viva, lendo direto do sistema:
1. MRR atual, Net MRR do mês, Ativos, Churn, ARPA — da base do Metabase já usada nas Metas.
2. Metas do mês: realizado vs meta (New, Recuperado, Upsell, Churn).
3. Evolução mensal MRR x meta no ano.
4. Conversões do mês por área (Conversões por Área).
5. Pré-churn atual.
Remover os blocos descartados e os sem fonte (P&L, NPS, Marketing Looker) até existir integração; manter exportação em PDF.

## Detalhes técnicos
- Hoje: `src/data/onePageData.ts` estático, gerado por `build_onepage_data.py` ausente.
- Nova versão: hooks existentes (useTacticalData / metas_ativos_pagantes_daily, stripe_conversions, metas_pre_churn), sem novas tabelas.
