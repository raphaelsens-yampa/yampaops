# Clientes Upsell nas Metas Táticas

## Objetivo
Adicionar ao painel diário o acompanhamento de Upsell por cliente, seguindo o mesmo padrão visual dos cards atuais.

## Implementação
- Corrigir a apuração para considerar **Upsell somente quando o MRR total do cliente aumentar**, comparando o MRR atual com o MRR anterior do cliente; mudanças internas de plano sem aumento líquido não contarão.
- Contar cada cliente uma única vez no dia e usar apenas o aumento líquido como **MRR Upsell**.
- Exibir no topo o card **Clientes Upsell**, com realizado versus meta, percentual, saldo restante e estado de meta batida.
- Cadastrar a meta inicial de **2 clientes por dia** para Sales, mantendo-a editável em Configurações como as demais metas diárias.
- Exibir abaixo dois indicadores: **Clientes Upsell** (quantidade) e **MRR Upsell** (soma dos aumentos líquidos).
- Aplicar a mesma leitura na visão geral, no time e no colaborador, respeitando a data histórica e os filtros já existentes.

## Validação
- Testar cliente que aumentou o MRR, cliente que apenas trocou de plano sem aumento total e cliente com múltiplas assinaturas.
- Confirmar que quantidade, MRR e meta diária permanecem consistentes entre os cards superiores, inferiores e a quebra semanal.
- Verificar o painel em desktop e celular e confirmar que o projeto continua compilando sem erros.

## Detalhes técnicos
A apuração será centralizada na fonte canônica de ativos pagantes, agrupando por cliente antes de calcular `máximo(MRR atual total − MRR anterior total, 0)`. A mudança da função de consulta será aplicada por migration, preservando permissões e segurança atuais.
