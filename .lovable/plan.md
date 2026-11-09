# Pacing e Comparativo de New MRR (Metas Táticas)

## Avaliação de esforço
- **Tamanho:** médio (equivalente a 1 entrega focada, similar ao Resultado Projetado).
- **Banco:** nenhuma mudança. Todos os dados já existem (vendas pagas Stripe, recuperações reconciliadas, upsell por cliente).
- **Risco:** baixo/médio. O principal cuidado é reaproveitar exatamente as mesmas regras do placar tático (recuperações só com MRR efetivo, upsell líquido por cliente, origem Yampa/4blue), para os números baterem com o resto da tela.
- **Partes:**
  1. Cálculo puro e testado (séries diárias, acumulado, média móvel 90 dias, tendência por dias úteis, cenários) — maior parte do trabalho.
  2. Busca dos dados (mês atual, mês anterior, mês escolhido e 90 dias) com leitura paginada.
  3. Tela: cards de potencial, gráfico de linhas e tabela de números.

## O que o usuário verá
Novo bloco recolhível "Pacing & Comparativo de New MRR" dentro de Metas Táticas:
- **Modos:** "Mês atual (MTD)" (padrão) e "Comparar meses fechados" (ex.: Out/26 vs Set/26).
- **Métrica:** New MRR ou Quantidade de vendas; composição Total / Novos / Recuperados / Upsell.
- **Visão:** Diário ou Acumulado.
- **Gráfico de linha** com dias 1–31 no eixo X: mês atual (sólido até hoje, tracejado até o fim do mês = tendência), mesmo período do mês anterior, média móvel 90 dias, outro mês à escolha e linha da meta.
- **Cards:** Potencial de New MRR e Potencial de Vendas (realizado, projeção, % da meta, vs mês anterior, ritmo diário necessário) com cenários Pessimista / Atual / Acelerado (últimos 7 dias úteis).
- **Tabela** dia a dia com os mesmos números do gráfico.
- Respeita o filtro de origem já existente.

## Detalhes técnicos
- `src/lib/newMrrPacing.ts` (puro) + `src/test/newMrrPacing.test.ts`: tendência = realizado + (realizado/dias úteis passados) × dias úteis restantes; nos 3 primeiros dias úteis mistura com média dos últimos 15 dias úteis; vendas sempre inteiras (meio para cima).
- `src/hooks/useNewMrrPacing.ts`: `fetchAllPaged` em `stripe_conversions` (paid), recuperações via `recoveryReconciliation.ts`, upsell via `tactical_customer_upsell_actual`, origem via `stripeConversionOrigin`.
- `src/components/goals/tactical/NewMrrPacingPanel.tsx` com Recharts, inserido em `TacticalTracking.tsx`.
- Registrar regra no `AGENTS.md`.
