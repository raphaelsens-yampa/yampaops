# Trazer o CSAT do Chatwoot

Objetivo: sincronizar as respostas de pesquisa de satisfação (CSAT) do Chatwoot para o app e exibi-las na seção Atendimentos, com cards, gráfico de evolução e ranking por agente/time.

## O que será feito

### 1. Armazenamento do CSAT
Nova tabela para guardar cada resposta de pesquisa: nota (1 a 5), comentário, conversa, contato, agente, time, caixa de entrada e data da resposta. Uma resposta por conversa (atualizada caso o cliente responda de novo).

### 2. Sincronização com o Chatwoot
- Nova função de backfill que percorre todo o histórico disponível de respostas de CSAT via API do Chatwoot, de forma paginada, com progresso e possibilidade de reexecução (idempotente).
- Sincronização contínua: o webhook já existente do Chatwoot passa a registrar/atualizar a resposta de CSAT quando ela chega.
- Botão "Sincronizar CSAT" no painel da Integração Chatwoot, mostrando total de respostas importadas e data da última sincronização.

### 3. Visualização em Atendimentos
Todos os blocos respeitam os filtros atuais da tela (período, status, agente, time, tabulação, labels, caixa, horário comercial):
- Cards: CSAT médio (0–5), % de satisfeitos (notas 4–5), % de insatisfeitos (1–2), nº de respostas e taxa de resposta (respostas / conversas resolvidas no período).
- Gráfico de evolução diária do CSAT médio, com volume de respostas e valores visíveis nas séries.
- Gráfico de distribuição de notas (1 a 5).
- Ranking por agente e por time: CSAT médio, nº de respostas e % de satisfeitos, ordenável, com exportação junto aos relatórios já existentes (CSV/PDF/PNG).

## Detalhes técnicos

- Tabela `chatwoot_csat_responses`: `chatwoot_account_id`, `chatwoot_conversation_id` (único), `csat_id`, `rating` (smallint), `feedback_message`, `contact_email/phone/name`, `assignee_name/email`, `team_name`, `inbox_name`, `responded_at`, `created_at/updated_at`. RLS habilitada com leitura para usuários autenticados e escrita pelo `service_role`, mais os GRANTs correspondentes.
- Edge Function `chatwoot-csat-backfill`: consome `GET /api/v2/accounts/{id}/csat_survey_responses` (paginado); fallback para leitura das mensagens `content_type = input_csat` das conversas já sincronizadas caso o endpoint não retorne dados naquela instância. Faz upsert por `chatwoot_conversation_id` e enriquece agente/time/caixa a partir de `chatwoot_conversations`.
- `chatwoot-webhook`: tratar evento de resposta de pesquisa (`conversation_updated` com `csat_survey_response`) fazendo o mesmo upsert.
- Frontend: agregações no `src/pages/ChatwootReports.tsx` (novo bloco de CSAT + tabelas de ranking), reaproveitando os componentes de gráfico e os helpers de exportação já usados na tela.

## Fora de escopo

- Coluna de CSAT por conversa na tabela de atendimentos e aba dedicada de CSAT (podem ser adicionadas depois).
