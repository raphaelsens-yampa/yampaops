# Base de crescimento revisável por mês (ex.: 1,2% a.m. de setembro em diante)

## O que muda para o usuário

Hoje a base de crescimento embutida nas metas é fixa em 1% a.m. (constante no código) e o único ajuste disponível é uma simulação local no seletor "Cenário de crescimento".

Passa a existir um cadastro de **Revisões da base de crescimento** salvo no banco e visível para todos:

- Uma linha por revisão: "a partir de 2026-09 → 1,2% a.m." (com observação opcional).
- Pode-se adicionar novas revisões no futuro (histórico de bases); a mais recente com mês de início ≤ mês avaliado é a que vale.
- Meses anteriores à primeira revisão continuam com 1% a.m. e nada do passado é recalculado.
- Onde fica: nova seção **Base de crescimento** no painel de Configurações das Metas (junto de Metas diárias / Configurações Financeiras), restrita a admin/tático.

Efeito da base revisada:

- Aba **Acompanhamento Metas**: as metas de MRR (estoque, Net MRR, entradas e saídas) do mês vigente em diante passam a considerar a base cadastrada.
- Aba **Metas Táticas**: metas diárias e semanais seguem o mesmo fator.
- O seletor de cenário continua existindo como simulação por cima da base: o item "Cadastrado" passa a exibir o percentual vigente (ex.: "Cadastrado (1,2% a.m.)") e os cenários 5%/10%/personalizado seguem sendo simulação local que não altera o banco.

## Como funciona o cálculo

A base é o crescimento considerado "normal"; o cenário é a diferença sobre ela.

```text
base vigente do mês (do cadastro)      -> ex.: 1,2%
cenário selecionado (simulação local)  -> 0 = usar a base
crescimento aplicado = cenário > 0 ? cenário : base
```

O motor atual já faz crescimento composto ancorado no último mês fechado; passa a receber a taxa por mês em vez de um único percentual global, de forma que a mudança de setembro só afete setembro em diante.

## Detalhes técnicos

Banco (migração):
- Nova tabela `goal_growth_baselines` (`effective_month` date único, `growth_pct` numeric, `note` text, `created_by`, timestamps) com GRANTs, RLS: leitura para `authenticated`, escrita apenas para admin/tático via `is_tatico_or_admin(auth.uid())`, trigger de `updated_at`.
- Seed opcional da revisão de setembro/2026 com 1,2% após aprovação.

Frontend:
- `src/lib/goalScenario.ts`: aceitar um mapa/lista de taxas base por mês (`baseGrowthFor(month)`) e usar `growth = cenário || base` por mês em `buildScenarioFactors` e `scenarioDailyFactor`. `BASELINE_GROWTH_PCT` fica apenas como fallback padrão (1%).
- Novo hook `src/hooks/useGrowthBaselines.ts` (fetch + cache + resolução por mês), consumido por `MetabaseTracking.tsx`, `useCategoryWeeklyData.ts`, `useScenarioDailyFactor.ts` e `GoalScenarioSelector.tsx`.
- Novo componente `src/components/goals/GrowthBaselineConfig.tsx` (tabela + adicionar/editar/excluir revisão) incluído em `TacticalSettingsPanel.tsx`.
- Testes em `src/test/` cobrindo: base por mês respeitada, meses anteriores intactos e cenário sobrepondo a base.
