# Fechamento semanal real de MRR

## Objetivo
Substituir o rateio atual por uma apuração cliente a cliente, usando a data real de ativação e o MRR registrado na base de Ativos Pagantes. A soma entre os filtros será consequência dos mesmos registros, não de compensações matemáticas.

## Regra de cálculo
- Usar a fotografia mais recente disponível de `metas_ativos_pagantes_daily` até a data consultada.
- Considerar somente clientes ativos e movimentos cuja `data_inicio` esteja dentro do mês exibido.
- Deduplicar pelo identificador do cliente, produto/preço e classificação antes de somar.
- Calcular por cliente:
  - **New MRR:** MRR integral quando a classificação for `novo pagante`.
  - **Recuperados:** MRR integral quando a classificação for `recuperado`.
  - **Upsell:** somente `max(MRR atual − MRR anterior, 0)`.
  - **Downsell:** somente `max(MRR anterior − MRR atual, 0)`.
  - **MRR Increase:** New MRR + Recuperados + Upsell apurados acima.
- Alocar cada movimento na semana que contém sua `data_inicio`, em `America/Sao_Paulo`.
- Aplicar o filtro de origem diretamente no cadastro do cliente, sem percentuais ou estimativas.
- Classificar Campanha somente quando houver conversão Stripe do mesmo cliente vinculada a um cupom marcado como campanha e compatível com a ativação. Sem evidência, o movimento será Não-campanha.
- Assim, **Tudo = Campanha + Não-campanha** por construção, pois cada cliente pertence a exatamente um grupo.

## Implementação
- Criar uma função de leitura no banco que devolva o fechamento diário por classificação, origem e campanha, junto da data da fotografia usada.
- Trocar a quebra semanal para consumir esse fechamento nas categorias de fluxo, removendo dela o rateio por snapshots MTD e qualquer limitação/compensação de campanha.
- Manter categorias de estoque e metas semanais com a lógica atual.
- Mostrar no painel a data de corte da fotografia para deixar semanas atuais incompletas claramente auditáveis.

## Validação
- Conferir setembro de 2026 cliente a cliente contra a fotografia disponível.
- Testar New MRR, Recuperados, Upsell e MRR Increase por semana.
- Validar os invariantes naturais: soma das semanas = mês e Campanha + Não-campanha = Tudo, sem arredondamentos artificiais.
- Rodar as validações automatizadas e revisar a tela autenticada.
