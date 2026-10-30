# Roadmap

## Metas Operacionais — dias sem base (30/10/2026)
- [x] Remover a nota do rodapé
- [x] Usar pagamentos confirmados na Stripe para dias sem base fechada, incluindo 29/10
- [x] Validar testes e 29/10 no sistema e na TV (R$ 1.777)

## Metas Táticas — Recuperados FT como vendas + padrão do placar (30/10/2026)
- [x] Recuperados FT somam como venda nova em "Vendas do dia / no período" (contados na fonte do realizado, sem duplicar o MRR)
- [x] Testar a regra e validar no navegador o card de vendas com a nota de low-touch + recuperados FT
- [x] Placar da direita abre por padrão em "MRR do dia"

## Metas Táticas — Vendas no Período com low-touch (30/10/2026)

- [x] Contar as vendas Low-touch no card de meta "Vendas no período" (outubro: 90 de 132, antes 73)
- [x] Testar a partição (low-touch soma em Vendas e em Upsell, nunca nas demais métricas) e validar no navegador sem duplicar o card pequeno

## Metas Táticas — filtro de período "de até" (30/10/2026)

- [x] Seletor Hoje / 7 dias / 30 dias / Mês atual / Trimestre atual / Personalizado, com data "de" e "até"
- [x] Acumular realizados e metas do período nos cards, no placar e na missão individual (metas somadas por dia útil)
- [x] Limitar o intervalo a no máximo 1 ano e paginar as leituras de volume (1.086 conversões pagas em 2026)
- [x] Validar no navegador: hoje inalterado (meta diária consolidada), 7 dias (9 de 30), mês (73 de 132 = 6×22 dias úteis) e personalizado 15/10–30/10; 179 testes e typecheck OK

## Precificação — Tabela de Serviços (27/10/2026)
- [x] Ordenação por valores nos cabeçalhos das colunas (validada no navegador)
- [x] Custo/mês, Custo Total, Mínimo/mês e Mínimo Total independentes (validado no navegador)
- [x] Reordenar a sequência das colunas (arrastar o cabeçalho), com posição salva no navegador (validado: Produto movido e mantido após recarregar)


## Precificação Serviços — salvamento da Keila (27/10/2026)
- [x] Reproduzir a recusa de salvamento na conta da Keila
- [x] Publicar o catálogo de forma atômica respeitando as permissões de precificação
- [x] Validar criação na conta da Keila, permanência após recarregar e formulário preservado em falha; 3 testes passaram e catálogo original restaurado após a verificação

## Bases de campanhas — telefone da Stripe e do Metabase (21/10/2026)
- [x] Salvar o telefone da conta de cobrança na Stripe quando a campanha é consultada em tempo real
- [x] Cruzar também o telefone das bases do Metabase (pré-churn e churn) por e-mail
- [x] Testar a ordem de prioridade das fontes e validar a cobertura na tela (160 testes; 7→89 telefones em 116 clientes; 0→5 em 35 clientes)

## Bases de campanhas — telefone e campanha (21/10/2026)
- [x] Incluir telefone disponível na base e nome da campanha na tabela e nos arquivos CSV/XLSX
- [x] Validar com clientes reais e testar o cruzamento dos telefones (5 testes; CSV com 116 clientes e 7 telefones disponíveis)

## Atendimentos — caixas de entrada e CSAT (19/10/2026)
- [x] Permitir marcar mais de uma caixa de entrada (soma das caixas; "(sem caixa)" disponível)
- [x] Testar a regra de multisseleção e validar os totais na tela (682 geral; 433 com duas caixas; 260 com uma)
- [x] Adicionar gauge de CSAT (score, nota média, respostas) e validar com setembro (87,9%) e março (74,2%)

## Recuperações táticas — filtros históricos (19/10/2026)
- [x] Adicionar trimestre atual e período personalizado limitado a um ano
- [x] Carregar o histórico completo do período e a comparação anterior
- [x] Testar limites e validar filtros no painel (12 testes; consulta de 2025 e bloqueio acima de um ano verificados)

## Vendas 4blue — cobertura 2026 (19/10/2026)
- [x] Corrigir paginação da importação diária e testar leitura histórica completa
- [x] Completar as vendas de 2026 e reconciliar cada mês com o Metabase (453 adicionadas; 532 no ano disponível)
- [x] Validar os totais na tela: 2026 R$ 34.580/532; Q2 R$ 12.025/185; Q3 R$ 11.310/174; reexecução sem duplicatas

## Funis CRM (17/09/2026)
- [x] Auditoria e correção dos fechamentos duplicados (ganhos/perdidos inflados)
- [x] Trocar card "Movimentações" por "MRR Gerado" (1a linha, ao lado de Ticket Médio Ganho) e descer "Ciclo médio de fechamento"

## Metas Operacionais (25/09/2026)
- [x] Criar placar north star Sales/CS com Mês, Semana e Dia
- [x] Adicionar permissões independentes para os placares Sales e CS
- [x] Renomear os agregadores nos relatórios para New MRR e Churn MRR
- [x] Validar cálculos, acesso e visual em desktop/celular
- [x] Metas Operacionais como 3ª aba; renomear Acompanhamento Metas → Metas Estratégicas; meses fechados com status Atingido/Abaixo/Acima
- [x] Usar Stripe no Realizado do dia vigente e Metabase nos dias anteriores, igual às Metas Táticas

## Planejamento Comercial (01/10/2026)
- [x] Seção própria no menu (grupo Sales) com Plano de MRR, Quotas e Cobertura de pipeline
- [x] Validar números e fluxo de edição no preview com o usuário

## Conversões por Área (14/10/2026)
- [x] Corrigir filtros, datas, contribuição MRR e conciliação de gráficos/exports
- [x] Agrupar Time Financeiro e BPO como "Time Financeiro" nos gráficos por plano
- [x] Renomear plano "+Controle À Vista" para "+Controle" nos registros
- [x] Corrigir paginação, atualização após edição, líquido em lote e apresentação
- [x] Migrar modelos depreciados da Auditoria IA conforme aprovação
- [x] Validar testes, dados reais e fluxos no navegador

## Conversões por Área — gráficos, cards e ranking (15/10/2026)
- [x] Ordenar "Conversões por Plano (quantidade)" do maior para o menor, independente do gráfico de MRR
- [x] Alternar estilo coluna/pizza nos dois gráficos por plano
- [x] Incluir/retirar rótulos de quantidade e % na apresentação dos gráficos
- [x] Validar os novos estilos no navegador
- [x] Ranking de Vendedor abaixo da tabela de vendas por plano (nome, quantidade, MRR produzido)
- [x] "Sem Vendedor" assumir o nome da área como vendedor nos painéis
- [x] Listar vendas com área "desconhecida" para correção manual pelo usuário
- [x] Remover cards Contração MRR e Renovações; excluir downgrade/renovação de MRR e quantidades
- [x] Card Conversões = Novas Vendas + Recuperados + Upsell; card Nova Venda → "New MRR" (Novas + Recuperados)
- [x] Reorganizar os 4 cards restantes em uma linha
- [x] Corrigir rótulos (quantidade/%) que não aparecem no modo pizza
- [x] Filtro de Tipo: remover Downgrade e Renovação e incluir Recuperação








## Ranking de Vendedor (15/10/2026)
- [x] Toggle no card "Ranking de Vendedor" para ordenar por Quantidade ou MRR Produzido
- [x] Listar vendas com Vendedor "Sales" sem vendedor apropriado (assigned_seller_id null) para correção manual
- [x] Listar vendas com Vendedor "Sales" sem vendedor apropriado — 2-5 Eduarda Nunes, 6 Leticia Calor atribuídos; venda 1 (mercadoprecojusto2429) fica sem vendedor, exibindo "Sales"
- [x] Atribuir assigned_seller_id nas vendas conforme resposta do usuário
- [x] Corrigir página em branco: rótulos dos gráficos liam payload indefinido do recharts e derrubavam a página (agora usam índice da série)
- [x] Validar no navegador: toggles Quantidade/MRR/% nos dois gráficos (colunas e pizza), ranking por Quantidade (Eduarda 108 em 1º) e por MRR (Leticia 1º), sem erros de página

## Conversões por Área — toggle "Ambos" e confirmação de unicidade (15/10/2026)
- [x] Toggle "Ambos" nos gráficos por Plano (valor fora + % dentro, em colunas e pizza)
- [x] Confirmar que cada conversão conta apenas no mês de `converted_at` (sem duplicidade por evento ou assinatura)

## Conversões por Área — filtro de origem 4blue (15/10/2026)
- [x] Coluna origem_cliente em stripe_conversions + backfill por e-mail
- [x] Função stripe-4blue-sync (cron diário 3h45): insere vendas 4blue "novo pagante" do Metabase ausentes no Stripe (79 na 1ª execução) e preenche origem das conversões Stripe
- [x] Filtro "Origem" (Todas / Só 4blue / Sem 4blue) afetando cards, gráficos, ranking, tabela e exports
- [x] Validado: 92 (4blue) + 243 (sem 4blue) = 335 (todas); testes 22/22

## Conversões por Área — origem 4blue corrigida e toggles dos gráficos por área (15/10/2026)
- [x] Só as 79 vendas do sync (PROFIT, R$ 65) mantêm origem 4blue; as 24 conversões do Stripe marcadas por e-mail voltaram para yampa
- [x] stripe-4blue-sync não carimba mais origem_cliente em conversões do Stripe (Stripe é sempre yampa)
- [x] Vendas 4blue entram com área Parceria
- [x] "Distribuição por Área": rótulos só Quantidade ou %
- [x] "Acréscimo de MRR por Área": rótulos só MRR ou %
- [x] Validado no navegador: cada card oferece apenas as duas opções pedidas, sem erros de página

## Metas Táticas — Upsell low-touch conta como Upsell (15/10/2026)
- [x] useLowTouchData: separar upsells (conversion_type "upsell", delta_mrr > 0) das vendas; vendas continuam sendo só "new"
- [x] TacticalOverview: "Clientes Upsell" e "MRR Upsell" somam os upsells low-touch do dia vigente (Stripe); histórico segue Metabase D-1
- [x] Testes em src/test/lowTouchPartition.test.ts (5 testes) e validação no navegador: Upsell 1 · R$ 30, Vendas do dia segue 2

## Filtro de Origem nas Metas (30/10/2026)
- [x] Estratégicas: auditado (já usa origem real, cliente a cliente)
- [x] Táticas: dias fechados e vendas Stripe/low-touch pela origem real
- [x] Operacionais: filtro de Origem + relatório do mês filtrado
- [ ] Metas específicas da Yampa — aguardando o usuário cadastrar/definir

## Resultado Projetado — tabela de churn previsto (30/10/2026)
- [x] Ordem padrão: data decrescente (mais recente no topo), empate por maior MRR
- [x] Colunas reorganizáveis arrastando o cabeçalho; ordem salva no navegador
- [x] Filtro por coluna: texto (cliente), data DD/MM, selects de tipo/origem/situação, MRR com >, <, =
- [x] Botão "Colunas" para ocultar/mostrar + "Mostrar tudo e limpar filtros"
- [x] Rodapé da tabela: clientes visíveis, filtros ativos e MRR somado
- [x] Testes em src/test/churnCaseTable.test.ts (7) + ordem padrão no projectedResult.test.ts
- [x] Validado no navegador: 45 linhas em 31/10 → 30/10, filtro 31/10 = 32, arraste persiste após recarregar
