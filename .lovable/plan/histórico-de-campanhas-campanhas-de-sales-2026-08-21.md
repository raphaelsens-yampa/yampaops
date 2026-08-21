# Histórico de Campanhas (Campanhas de Sales)

Nova aba **Histórico de Campanhas** para cadastrar, comparar e apresentar a performance de campanhas desde 2022, no formato da tabela do print (Meta Atual / Realizado Atual / % Ating. Meta / % Meta Funil / % Realizado Funil).

## Como vai funcionar

### 1. Cadastro próprio de campanhas históricas
Cada campanha histórica é um registro independente: nome, período (mês/ano de referência, data início/fim), canal/tipo, responsável e observações. Não depende das campanhas atuais de Chatwoot.

### 2. Indicadores parametrizáveis (padrão do print)
O sistema já vem com a lista do print pré-cadastrada, na mesma ordem:
Investimento, Faturamento Ingressos, Vendas WS, Vendas OB, Custos, Investimento Líquido, CPL, CPL Líquido, Leads (Total), Leads (Ads), Leads (Base), Leads no Wpp (c/ saídas), Audiência Live (Usuários Únicos), Audiência Live (Pico), Pré-Pitch, Pitch, Iniciativas, Conversão, CAC, CAC Líquido, Fat. Anualizado, Investibilidade, Caixa yampa, MRR, LTV, LTV/CAC, Tempo de ROI.

Em **Configurações de indicadores** o usuário pode: adicionar, renomear, remover, reordenar (drag-and-drop), definir o formato (R$, número, %, multiplicador "x"), a direção (maior é melhor / menor é melhor), se pertence ao bloco de funil (habilita as colunas % Meta Funil e % Realizado Funil) e agrupar em seções (como os blocos separados do print).

### 3. Lançamento dos dados
- **Importação de planilha (XLSX/CSV)**: a planilha no layout do print (indicador nas linhas; Meta, Realizado e, quando houver, metas/realizados de funil nas colunas) é lida com pré-visualização, casamento automático dos nomes de indicador, criação dos indicadores novos que aparecerem e aviso de linhas ignoradas. Importação por campanha ou várias campanhas de uma vez (uma coluna por campanha).
- **Formulário manual**: tela de lançamento/edição com todos os indicadores da campanha em uma grade editável, para digitar ou corrigir Meta e Realizado.

### 4. Painel da campanha
Tabela idêntica ao print, com semáforo de cor por faixa de atingimento (verde ≥ 100%, amarelo 85–99%, vermelho < 85%, invertido para indicadores "menor é melhor") e cálculo automático de % Ating. Meta.

### 5. Evolução histórica
- Seletor de indicadores e de período (anos/meses) com gráfico de linha da evolução de Realizado (e Meta como linha de referência).
- Tabela pivô: indicadores nas linhas, campanhas/meses nas colunas, com variação vs. campanha anterior.
- Cards de destaque: melhor e pior campanha por indicador escolhido, média e mediana do período.

### 6. Comparar duas campanhas
Seleção de campanha A e campanha B, com tabela lado a lado (Meta/Realizado de cada, variação absoluta e %, setas de melhora/piora) e gráfico de barras comparativo por indicador.

### 7. Relatórios em PDF
Exportação com capa (nome, período, responsável), a tabela completa da campanha, os gráficos de evolução dos indicadores selecionados e a página de comparação A vs B. Também exportação XLSX/CSV dos dados brutos.

## Detalhes técnicos

Banco (novas tabelas em `public`, com RLS e GRANTs, acesso restrito a admin/tático como no restante da seção):
- `campaign_history_metrics`: catálogo de indicadores (`slug`, `label`, `unit`, `direction`, `section`, `is_funnel`, `position`, `is_active`).
- `campaign_history`: campanha histórica (`name`, `ref_month`, `start_date`, `end_date`, `channel`, `owner_id`, `notes`).
- `campaign_history_values`: valor por campanha × indicador (`target_value`, `actual_value`, `funnel_target_pct`, `funnel_actual_pct`), único por par.
- Seed dos indicadores do print na própria migração.

Frontend:
- Nova rota `/sales-campaigns/history` protegida pela área `sales_campaigns`, com aba/menu no topo da seção junto de Campanhas e Relatórios.
- `src/pages/CampaignHistory.tsx` com sub-abas: Painel da campanha, Evolução, Comparar, Configurações de indicadores.
- Componentes em `src/components/campaign-history/`: `CampaignHistoryTable`, `MetricEvolutionChart`, `CampaignCompare`, `MetricsConfig`, `CampaignHistoryImportDialog`, `CampaignValuesForm`, `CampaignHistoryPdfExport`.
- `src/lib/campaignHistory.ts` com formatação por unidade, cálculo de % de atingimento, faixas de cor e derivação de comparativos.
- Importação com `xlsx` e PDF com as libs já usadas no projeto; gráficos com Recharts, seguindo os tokens de design existentes.

## Validação

Cadastrar uma campanha, importar a planilha do print e conferir que os valores e % batem com a imagem; comparar duas campanhas e baixar o PDF verificando tabela e gráficos.
