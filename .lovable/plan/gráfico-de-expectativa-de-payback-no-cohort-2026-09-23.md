# Gráfico de expectativa de payback no Cohort

## Objetivo
Adicionar, logo abaixo de **Retenção de assinantes (M0 em diante)**, uma seção recolhível que mostre visualmente a evolução da receita acumulada até recuperar o investimento.

## O que será exibido
- Linha sólida de **Receita acumulada real**, mês a mês, usando os mesmos valores líquidos já utilizados pelo card de Receita Acumulada.
- Linha horizontal de **Investimento**, deixando claro o ponto necessário para o payback.
- Quando o payback já aconteceu, destacar no gráfico o primeiro mês em que a receita acumulada alcançou o investimento, com a indicação **Payback atingido**.
- Quando ainda não aconteceu, prolongar a curva com uma linha tracejada de **Expectativa**, somando a cada mês o **MRR ativo atual** da campanha, conforme definido.
- Destacar o mês estimado de cruzamento com a indicação **Payback previsto**.
- Tooltip por mês com mês calendário, referência M0/M1..., receita real ou projetada e valor do investimento.
- Estado vazio claro quando não houver investimento válido ou MRR ativo suficiente para calcular a projeção.

## Comportamento e posição
- Criar a seção **Evolução do payback** imediatamente após a matriz de retenção e antes da lista de clientes.
- Incluir controle para abrir e fechar, seguindo o mesmo padrão visual já usado nas seções do Cohort.
- Manter o gráfico aberto inicialmente e adaptar a visualização para telas menores.

## Regra de cálculo
- O histórico seguirá a receita líquida mensal já calculada no Cohort, incluindo ajustes manuais e snapshots mensais.
- O payback real continuará sendo o primeiro mês em que a receita acumulada real for maior ou igual ao investimento realizado.
- A projeção começará no mês seguinte ao último mês realizado e repetirá o MRR ativo atual até alcançar o investimento.
- Se o payback já foi atingido, o gráfico mostrará apenas a trajetória real e o marco ocorrido, sem criar uma previsão futura desnecessária.
- O card **ROI Real (payback)** continuará alinhado ao mesmo marco apresentado no gráfico.

## Implementação técnica
- Isolar o gráfico em um componente próprio com Recharts e tokens visuais existentes.
- Criar uma função pura para montar a série real/projetada e identificar o marco de payback, facilitando testes.
- Adicionar testes para: payback já atingido, payback futuro pelo MRR ativo atual, investimento ausente e MRR ativo igual a zero.
- Validar a seção com uma campanha que já atingiu o payback e outra que ainda não atingiu.
