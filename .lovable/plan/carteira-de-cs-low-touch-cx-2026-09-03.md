# Carteira de CS Low-touch (CX)

Nova seção em CX para o analista de CS trabalhar a carteira low-touch como um CRM: quem precisa de contato hoje, o que já foi conversado no Chatwoot, em quais funis do CRM o contato está, e relatórios de cobertura da carteira.

Base de dados: snapshot diário de ativos pagantes (Metabase). No snapshot de 02/09 há 2.301 e-mails ativos, R$ 331k de MRR e 6 planos — a carteira sai desse universo.

## Como vai funcionar

### 1. Segmentos (motor de regras editável)
- O usuário cria segmentos com regras combináveis: plano, oferta, faixa de MRR, origem (4blue/Yampa), tempo de casa, recorrência, área do Mapa de Preços, ramo de atuação, faixa de engajamento, gateway.
- Cada segmento tem prévia ("X clientes, R$ Y MRR") antes de salvar.
- Segmentos servem para três coisas: encarteirar, filtrar a tela e alimentar relatórios.

### 2. Encarteiramento por CS
- Regra de atribuição por segmento: escolhe o CS responsável (ou rateio automático round-robin / equilibrado por MRR entre vários CS).
- Atribuição manual pontual sempre vence a regra, e é registrada com autor e data.
- Botão "Reprocessar carteira" reaplica as regras aos clientes novos do snapshot e mostra o que mudou.

### 3. Ciclo de contato (cadência)
- Cada segmento define uma cadência em dias (ex.: 60 dias para CONTROL, 30 para SUCCESS).
- Para cada cliente calculamos o último contato (registro manual do CS ou última conversa do Chatwoot) e o próximo contato devido.
- Status derivado: **Em dia**, **Vence em breve**, **Vencido**, **Nunca atendido**.
- Cada contato é registrado com canal (WhatsApp, e-mail, call), resultado (respondeu, sem resposta, agendou, risco) e nota.

### 4. Tela do cliente (visão 360)
- Dados do plano, MRR, origem, tempo de casa, ramo, engajamento, CS responsável.
- Conversas do Chatwoot associadas por e-mail/telefone: data, caixa de entrada, tabulação, agente, e link direto para a conversa.
- Resumo das conversas reaproveitando o que já existe (Auditoria IA e Voz do Cliente): resumo, tema principal, dor principal, sentimento e risco de churn — sem custo novo de IA.
- Funis do CRM (ActiveCampaign): negócios do contato com etapa atual, valor e link direto para o deal.
- Timeline unificada de contatos registrados.

### 5. Filtros e relatórios
- Filtros na lista: CS responsável, segmento, status de cadência, plano, MRR, ramo, engajamento, risco de churn, com ou sem conversa no período.
- Relatórios: cobertura da carteira (% atendida no período), carteira por CS (clientes, MRR, vencidos), evolução de contatos por semana, distribuição por segmento/plano/ramo, ranking de temas e dores da carteira, clientes em risco sem contato recente.
- Exportação CSV/XLSX da lista filtrada.

### 6. Enriquecimento: ramo e engajamento
- **Ramo de atuação**: importação por planilha (e-mail + ramo) com histórico de atualização, mais edição manual na ficha do cliente. Hoje esse dado não existe em nenhuma tabela.
- **Índice de engajamento (0–100)**: calculado no app a partir de conversas nos últimos 90 dias, recência do último contato do cliente, CSAT quando houver, risco de churn da Auditoria IA e tempo de casa. Faixas Alto / Médio / Baixo / Silencioso, com os pesos configuráveis por admin.

## Detalhes técnicos

Novas tabelas (RLS: leitura para autenticados com permissão, escrita para admin/tático e para o CS dono):
- `cs_segments` — nome, cor, cadência em dias, JSON de regras, prioridade, ativo.
- `cs_assignment_rules` — segmento, modo (fixo/round-robin), CS elegíveis, ordem.
- `cs_portfolio` — e-mail normalizado, `cs_user_id`, segmento resolvido, origem da atribuição (regra/manual), snapshot de plano/MRR, ramo, engajamento, `last_contact_at`, `next_contact_due`.
- `cs_contact_logs` — cliente, autor, data, canal, resultado, nota, conversa Chatwoot vinculada.
- `cs_client_enrichment` — e-mail, ramo, notas, fonte (importação/manual), atualizado em.
- `cs_engagement_config` — pesos e faixas do índice.

Funções/RPC (security definer, `is_tatico_or_admin` ou dono da carteira):
- `cs_portfolio_refresh()` — lê o último snapshot de `metas_ativos_pagantes_daily`, aplica segmentos por prioridade e regras de atribuição, insere novos, marca inativos, recalcula engajamento e `next_contact_due`.
- `cs_segment_preview(rules jsonb)` — contagem e MRR da prévia.
- `cs_portfolio_list(filtros)` — lista paginada com joins de Chatwoot, temas e auditoria.
- `cs_client_360(email)` — conversas, resumos/temas, deals do CRM e timeline.
- `cs_portfolio_reports(periodo)` — agregados de cobertura, por CS e por segmento.

Front-end, seguindo os padrões atuais (`fetchAllPaged`, timezone `America/Sao_Paulo`, tokens do design system):
- `src/pages/CsPortfolio.tsx` — abas Carteira, Fila do dia, Relatórios, Configurações (segmentos, atribuição, engajamento, importação de ramo).
- `src/components/cs-portfolio/` — `PortfolioTable`, `PortfolioFilters`, `ClientDrawer360`, `ContactLogDialog`, `SegmentBuilder`, `AssignmentRules`, `EnrichmentImportDialog`, `PortfolioReports`.
- `src/hooks/useCsPortfolio.ts`, `useCsSegments.ts`, `useCsClient360.ts`.
- Rota protegida `/atendimentos/carteira-cs`, permissão `carteira_cs` em `AccessLevelManager` e defaults em `useAuth`, item no grupo CX do `AppSidebar`.
- Vinculação Chatwoot por e-mail normalizado com fallback em telefone (`phone_digits`), registrando a chave usada — mesmo critério já adotado na integração.
- Links: conversa via `useChatwootIntegration().buildConversationUrl`; deal do CRM pelo padrão de URL já usado em Funis CRM.

Testes: regras de segmentação, resolução de cadência/`next_contact_due` e cálculo do índice de engajamento em `src/test/`.

## Insights e sugestões

- **Priorização em vez de lista plana**: com ~1.700 clientes por poucos analistas, a "Fila do dia" ordenada por risco × MRR × dias de atraso é o que garante uso diário. Sem isso, a tela vira um relatório.
- **Cobertura como meta tática**: a % da carteira atendida no ciclo pode virar meta em Metas Táticas, no mesmo padrão de retenção que já existe.
- **Alerta de risco silencioso**: cliente com risco de churn alto na Auditoria IA e sem contato há mais de um ciclo entra numa lista vermelha destacada.
- **Detecção de queda de MRR**: comparando snapshots consecutivos, sinalizar downgrade recente na carteira dispara contato proativo.
- **Ramo de atuação sem planilha**: se preferir, dá para inferir por domínio de e-mail/nome da empresa em uma fase posterior — a importação continua sendo a fonte confiável.
- **Faseamento sugerido**: (1) segmentos + encarteiramento + lista com cadência; (2) visão 360 com Chatwoot/CRM/resumos; (3) relatórios, engajamento e importação de ramo.
