# Planejamento Comercial — seção própria no menu

## Conceito

Lugar onde o plano é montado e revisado (hoje o sistema só apura realizado). Estrutura em 4 blocos, alinhada a revenue planning de SaaS:

1. **Plano de MRR (12 meses)** — bridge mensal: New MRR, Churn MRR, Net MRR e MRR final previsto por mês, partindo do último realizado oficial e aplicando a base de crescimento cadastrada (% a.m., ex. 1,2%). Meses com meta cadastrada usam a meta; meses futuros sem cadastro são extrapolados pela taxa.
2. **Quotas** — decomposição do New MRR do mês entre vendedores por performance histórica (janela de 3–6 meses, configurável), com ajuste manual e persistência. Quota de vendas para Sales; CS acompanha retenção/recuperação da carteira.
3. **Cobertura de pipeline (completo)** — cálculo reverso com as taxas dos Funis CRM: entradas necessárias = meta de vendas ÷ % Ganho; pipeline necessário = entradas × ticket médio ganho; cobertura = pipeline atual ÷ necessário, com alerta quando abaixo do alvo.
4. **Cenários** — reutiliza o motor existente (Cadastrado / Otimista 5% / Pessimista 0% / Personalizado) para recalcular o plano inteiro em memória.

## Dados e lógica

### Migração (2 tabelas novas, RLS + GRANT)

- `commercial_plan_months` — um registro por mês (unique `year_month`): `target_new_mrr`, `target_churn_mrr`, `target_deals`, `target_ativos` (nulos = extrapolado pela base de crescimento), `notes`, `is_locked`. Edição manual preenche os valores; o resto permanece calculado.
- `commercial_plan_quotas` — uma linha por vendedor/mês (unique `year_month`+`seller_id`): `quota_new_mrr`, `quota_deals`, `weight`, `is_manual`, `notes`.

RLS: leitura para `authenticated`; escrita apenas admin/tatico (função `is_tatico_or_admin` existente). Grants na mesma migração.

### Fontes reutilizadas (nada é recalculado do zero)

- Metas cadastradas por categoria (`goals`) e base de crescimento (`goal_growth_baselines`) para o Plano de MRR.
- Realizado oficial: snapshots do Metabase (`metabase_monthly_agg` / `metas_snapshot_diario`) — mesma apuração da Metas Estratégicas.
- Taxas de conversão e ticket médio ganho: funis ActiveCampaign (`ac_funnel_*` + lib `acFunnelKpis` — % Ganho e Passagem já implementados).
- Pipeline atual: negócios abertos dos funis (não fechados) na etapa de proposta/negociação.
- Cenários: `src/lib/goalScenario.ts` (presets 0/5/10 + custom).

### Cobertura de pipeline

- Por mês do plano, usando as taxas médias dos últimos 3 meses do funil selecionado.
- Cobertura = pipeline atual ÷ pipeline necessário; abaixo do alvo (padrão 1,0×; configurável) vira alerta vermelho no card do mês.

## Frontend

- Nova página `src/pages/CommercialPlanning.tsx`, rota `/planejamento-comercial`.
- Item "Planejamento Comercial" no menu (grupo Sales, ao lado de Comissionamento/Precificação).
- Nova área `planejamento_comercial` no Nível de Acesso (`AccessLevelManager` → `CRM_SECTIONS`/`CRM_AREAS`), padrão visível para gestores; gestor ajusta quem vê.
- Componentes: `PlanMrrBridge` (tabela/gráfico mensal com plano × realizado), `QuotasPanel` (tabela de quotas com rateio automático + edição inline), `PipelineCoverage` (cards por mês com cobertura e alerta), seletor de cenário reaproveitando `useGoalScenario`.
- Lib nova `src/lib/commercialPlan.ts` (cálculos puros: bridge, rateio por peso, cobertura) com testes em `src/test/commercialPlan.test.ts`.
- Hook `src/hooks/useCommercialPlan.ts` (leitura das fontes, CRUD de quotas/plano). Todas as consultas ao banco paginadas (`fetchAllPaged`) conforme guardrail do projeto.

## Ordem de implementação

1. Migração das 2 tabelas (aprovada pelo runtime).
2. Lib de cálculo + testes.
3. Hook + página + rotas/menu/permissões.
4. Plano de MRR e Quotas (blocos 1 e 2).
5. Cobertura de pipeline e cenários (blocos 3 e 4).
6. Validação no preview (desktop) e atualização do `roadmap.md`.

## Fora do escopo desta fase

- Planejamento de capacidade (contratações) e cobrança por produto — podem vir como próximos passos se quiser.
