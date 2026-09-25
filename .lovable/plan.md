# Metas Operacionais — north star por time

## Objetivo
Criar uma nova aba **Metas Operacionais** na tela de Metas, com leitura rápida e uma única métrica principal por área:

- **Sales:** **New MRR** = novas vendas + recuperações de churn + upsell.
- **CS:** **Churn MRR** = churns + downsell; quanto menor, melhor.

A visão será um placar em cascata: **Mês** como destaque principal, depois **Semana** e **Dia**, todos com Meta versus Realizado e acesso aos períodos anteriores.

## Experiência da nova aba
- Adicionar **Metas Operacionais** junto às abas atuais de Metas.
- Exibir um seletor simples **Sales | CS**:
  - gestores podem alternar entre os dois;
  - demais usuários entram no placar correspondente ao próprio time.
- No topo, mostrar o nome da north star com tooltip explicativo:
  - New MRR: “Soma novas vendas, recuperações de churn e upsell.”
  - Churn MRR: “Soma churns e downsell. Quanto menor, melhor.”
- **Placar mensal dominante:** Meta de um lado, Realizado do outro, percentual, saldo e barra de progresso.
- **Bloco semanal:** semana atual por padrão, com navegação pelas semanas anteriores do mês e os mesmos números essenciais.
- **Bloco diário:** dia atual por padrão, com seletor para consultar dias anteriores e Meta versus Realizado.
- Tratar corretamente a direção da meta:
  - New MRR melhora quando o realizado cresce;
  - Churn MRR melhora quando o realizado permanece abaixo do limite.
- Estados de carregamento, ausência de meta e ausência de realizado serão explícitos, sem transformar ausência em zero silenciosamente.

## Direção visual aprovada
Aplicar a direção **Compact Cascade Metrics**:

- paleta intensa com azul profundo, ciano Yampa, fundo claro e âmbar para atenção;
- tipografia existente **Sora + Manrope**;
- composição em uma coluna, conectando visualmente Mês → Semana → Dia;
- números grandes apenas no mês e densidade progressivamente menor nos períodos inferiores;
- raio máximo de 8px, sem cards aninhados e sem alterar a barra lateral;
- transições curtas ao trocar área ou período, respeitando redução de movimento.

## Dados e cálculos
- Reutilizar metas, categorias, snapshots e apurações já existentes; não criar uma fonte paralela.
- Resolver as categorias agregadoras pelos componentes canônicos:
  - New MRR operacional = `new_mrr` + recuperados + upsell;
  - Churn MRR operacional = churn de MRR + downsell.
- Mês: usar o mesmo realizado canônico do **Acompanhamento Metas**.
- Semana: usar o fechamento real por data de ativação já adotado na quebra semanal, sem previsões de campanha.
- Dia: agregar os mesmos componentes na data selecionada. Para CS, incluir a apuração diária de churn e downsell, que hoje ainda não está exposta no painel diário.
- Meta semanal e diária serão derivadas da meta mensal conforme as regras e dias úteis já usados pelo módulo, preservando eventuais metas específicas existentes quando houver.
- Garantir invariantes entre granularidades: dias fecham a semana; semanas fecham o mês; componentes fecham a north star.

## Renomeação em todos os relatórios
- Alterar os rótulos visíveis de **MRR Increase** para **New MRR**.
- Alterar os rótulos visíveis de **MRR Decrease** e **Churn de MRR** agregador para **Churn MRR**, sem alterar os identificadores internos que sustentam os cálculos.
- Atualizar tooltips, legendas, tabelas, gráficos, seletores e textos explicativos que exibem esses nomes.
- Preservar métricas componentes quando aparecem como detalhamento: “Novas vendas”, “Recuperações”, “Upsell”, “Churn” e “Downsell”.

## Validação
- Testar as fórmulas de soma dos componentes e a inversão de leitura do Churn MRR.
- Conferir Mês, Semana e Dia para Sales e CS em períodos atual e anteriores.
- Comparar os totais da nova aba com o Acompanhamento Metas e a quebra semanal existentes.
- Verificar permissões de gestor e usuário de time.
- Validar visualmente em desktop e celular, incluindo tooltips, troca de período e ausência de dados.

## Detalhes técnicos
- A aba será integrada em `Goals.tsx` com um componente focado de placar operacional.
- Os hooks existentes serão reutilizados ou compostos para evitar duplicação das regras de apuração.
- A classificação Sales/CS usará as categorias formais (`area`) e a associação atual do usuário ao time; não dependerá apenas do texto do nome do time.
- Não será criada uma nova tabela para armazenar resultados calculados.
