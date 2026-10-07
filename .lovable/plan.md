# Planejamento de Campanhas + Análise do Churn

## 1. Planejamento de Campanhas (Sales → Campanhas e Lives)

Nova subseção "Planejamento de Campanhas" no menu, ao lado de Histórico de Campanhas e Campanhas de Sales.

**Base de referência**
- Usa as campanhas já encerradas do Histórico (investimento líquido, contatos, conversões, MRR líquido, retenção M1–M6, receita acumulada, LTV Real, CAC, ROI).
- Agrupa por tipo/canal da campanha; o usuário filtra quais tipos entram na média.

**Previsão (3 cenários)**
- Esperado: média das campanhas do tipo.
- Otimista e Pessimista: faixa das melhores e piores campanhas do tipo (quartil superior e inferior).
- Para um investimento informado, mostra: vendas previstas, MRR gerado, crescimento a.m. que a campanha representa, LTV, LTV/CAC, ROI e mês provável do payback.

**Simulador reverso**
- O usuário escolhe a meta: MRR a gerar, crescimento a.m., LTV/CAC alvo ou ROI alvo.
- O sistema calcula o investimento necessário (ou o teto de investimento, no caso de LTV/CAC e ROI) e a quantidade de vendas, nos 3 cenários.
- Alerta quando o histórico do tipo é pequeno (menos de 3 campanhas).
- Botão "Salvar cenário" guarda a simulação para comparar depois com o realizado da campanha.

## 2. Análise do Churn (CX)

Nova seção "Análise do Churn" no menu CX, com acesso controlado pelo Nível de Acesso.

**Base oficial de Pré-churn (Metabase)**
- Nova importação diária da base de pré-churn do Metabase, guardada no sistema:
  - Pré-churn voluntário: pedidos de cancelamento, com motivo.
  - Pré-churn involuntário: inadimplência; vira churn se não pagar em até 14 dias do vencimento (contagem regressiva por cliente).
- Mesmas proteções da importação de ativos (sem apagar registros, sem duplicar).

**Painéis**
- Funil Pré-churn → Retido/Recuperado → Churn, por tipo (voluntário/involuntário), mês e motivo.
- Padrões: churn e pré-churn cruzados com plano, oferta/campanha, tempo de casa, ticket, ramo, analista de CS, CSAT, engajamento e temas da Voz do Cliente.
- Fila de antecipação: clientes em pré-churn hoje, ordenados por MRR e prazo (involuntários perto dos 14 dias em destaque), com link para a Carteira de CS.
- Taxa de reversão por motivo e por ação do CS (usa Retidos/Recuperados já registrados).

**Ações com IA para o CS**
- A IA analisa os padrões e conversas dos clientes por motivo/segmento e gera recomendações: ações de retenção, argumentos de conversa e ofertas sugeridas.
- Para cada cliente da fila, um resumo do risco e a abordagem sugerida.
- Atualização sob demanda e semanal; aviso claro se os créditos de IA acabarem.

## Ordem de implementação

1. Localizar no Metabase o card/tabela de Pré-churn e mapear colunas (primeiro passo, antes de criar a importação).
2. Tabela de pré-churn + importação diária + agendamento.
3. Página Análise do Churn (funil, padrões, fila).
4. Ações com IA.
5. Lógica de previsão de campanhas + testes.
6. Página Planejamento de Campanhas (cenários e simulador reverso, salvar cenários).
7. Menu, rotas e Nível de Acesso; validação no preview.

## Detalhes técnicos

- Tabelas novas (RLS + GRANT, escrita tático/admin): `metas_pre_churn` (email_norm, company_id, tipo voluntario/involuntario, motivo, data_pedido, data_vencimento, prazo_limite, mrr, status, data_snapshot; unique por company+data_pedido+tipo), `campaign_plan_scenarios` (inputs, meta escolhida, resultados por cenário), `churn_ai_insights` (escopo, segmento, recomendações JSON, gerado_em).
- Edge Function `pre-churn-ingest` (padrão de `ativos-ingest`: upsert idempotente, sem delete, guarda de data) + cron diário.
- Edge Function `churn-ai-insights` via Lovable AI (saída estruturada), tratando 402/429.
- Lib pura `src/lib/campaignForecast.ts` (agregação por tipo, quartis, cálculo direto e reverso) com testes em `src/test/campaignForecast.test.ts`; reaproveita métricas de `src/lib/campaignCohort.ts`.
- Páginas `src/pages/CampaignPlanning.tsx` (`/sales-campaigns/planejamento`, área `campaign_planning`) e `src/pages/ChurnAnalysis.tsx` (`/atendimentos/analise-churn`, área `analise_churn`); consultas via `fetchAllPaged`.
