# Ajustar a conversa entre todas as metas

## Objetivo
Fazer com que a revisão da Base de crescimento afete todas as metas compatíveis, sem alterar metas de meses já encerrados, e tornar as metas agregadoras matematicamente dependentes de seus componentes.

## Diagnóstico confirmado
- O motor atual possui regras especiais para estoque, Net MRR, entradas e saídas, mas as categorias agregadoras ainda mantêm o próprio valor cadastrado; os componentes são usados para calcular fatores, não para garantir que o agregado seja a soma exibida.
- Na base atual, setembro/2026 apresenta **MRR Increase = R$ 19.108**, enquanto New MRR + Recuperados + Upsell soma **R$ 16.108**. Para MRR Decrease, o cadastro já fecha: Churn MRR + Downsell = **R$ 15.816**.
- A preservação histórica existente por mês será mantida: o mês de agosto e demais meses anteriores ao início da projeção continuarão congelados.

## Implementação
1. **Centralizar a composição mensal das metas no motor de cenários**
   - Manter a projeção já validada de Total de MRR, Total de Usuários e Net MRR, incluindo âncora no realizado e congelamento do passado.
   - Aplicar o crescimento mensal também às categorias independentes que hoje não recebem uma projeção coerente.
   - Para metas de entrada relacionadas ao MRR Increase, manter a distribuição proporcional da exigência de Net MRR + MRR Decrease ajustado entre New MRR, Recuperados e Upsell.
   - Para metas de saída relacionadas ao MRR Decrease, manter a regra de menor é melhor, reduzindo proporcionalmente o teto de Churn MRR e Downsell.
   - Para as demais categorias que não são agregadoras, usar o fator mensal de crescimento aplicável à métrica-base, respeitando a direção da meta; categorias `lte` continuam sendo ajustadas no sentido de um teto menor.

2. **Derivar os agregadores dos componentes**
   - Em cada mês, calcular MRR Increase exclusivamente como:
     `New MRR + Recuperados + Upsell`.
   - Calcular MRR Decrease exclusivamente como:
     `Churn MRR + Downsell`.
   - Aplicar essa composição depois dos fatores de crescimento para que a igualdade continue verdadeira na visão cadastrada e na visão revisada.
   - Preservar períodos, escopos e campos de métrica das metas existentes, sem gravar automaticamente alterações no banco; a correção será aplicada na leitura das telas que usam o motor.

3. **Garantir consistência entre telas**
   - Reutilizar a mesma saída no Acompanhamento de Metas e no painel semanal/tático, evitando que uma tela mostre o agregado cadastrado e outra mostre a soma dos componentes.
   - Manter os realizados inalterados; somente os alvos em memória serão recalculados.

4. **Testes de regressão**
   - Confirmar que a revisão de 1,2% afeta categorias independentes e categorias de contagem, além do Total de MRR/Usuários.
   - Confirmar a igualdade mensal dos dois agregadores após a revisão.
   - Confirmar a preservação da meta revisada histórica de agosto.
   - Confirmar que categorias `lte` continuam reduzindo o teto, sem inverter a regra de menor é melhor.

## Detalhes técnicos
- Alterar o motor compartilhado em `src/lib/goalScenario.ts` e seus testes.
- Ajustar os consumidores que calculam metas semanais/táticas caso ainda estejam lendo o valor agregado diretamente.
- Não haverá nova tabela, mudança de schema, alteração de realizados ou gravação automática das metas recalculadas.
