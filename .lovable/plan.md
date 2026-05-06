# Backfill de TM1R via Chatwoot

## Contexto

Hoje, das 3.623 conversas armazenadas, apenas:
- **46** têm `first_response_at` populado
- **8** têm `first_contact_message_at` populado

Sem esses dois timestamps a fórmula `TM1R = first_response_at − first_contact_message_at` não tem amostra suficiente para ser útil — por isso a coluna TM1R aparece quase toda vazia na tela.

A informação **existe** no Chatwoot e o código atual (`chatwoot-backfill`) já sabe buscar via endpoint `/api/v1/accounts/{id}/conversations/{convId}/messages`, identificando a primeira mensagem `incoming` (cliente) e a primeira `outgoing` (agente). O problema é apenas execução: o backfill antigo não percorreu todas as conversas históricas com essa lógica nova.

## O que será feito

Criar uma rotina dedicada que, para cada conversa já existente sem TM1R, busca as mensagens no Chatwoot e preenche os dois campos. Isolada do backfill geral para poder rodar em ritmo controlado e ser retomada de onde parou.

### Nova edge function: `chatwoot-fill-tm1r`

- Recebe parâmetros opcionais: `limit` (default 200), `only_missing` (default true).
- Lê em `chatwoot_conversations` as conversas onde `first_response_at IS NULL OR first_contact_message_at IS NULL`, ordenadas por `created_at` desc (mais novas primeiro, que é o que mais importa para o relatório).
- Para cada uma, chama `/api/v1/accounts/{accountId}/conversations/{chatwoot_conversation_id}/messages` (com paginação, pois conversas grandes podem ter centenas de mensagens).
- Identifica primeira incoming (`message_type=0`) e primeira outgoing (`message_type=1`).
- Atualiza `first_contact_message_at` e `first_response_at` na linha correspondente.
- Retorna no JSON: `processed`, `updated`, `skipped`, `errors`, `next_cursor` (id da última conversa processada).
- Throttle de ~5 req/s para respeitar o limite do Chatwoot.

### Execução em lotes

Como são ~3.500 conversas pendentes e cada uma faz 1 chamada HTTP, executar tudo de uma vez estouraria o timeout da edge function. A função processa lotes (~200 por chamada, ~40 segundos cada) e devolve um `next_cursor` para retomar.

A primeira execução será disparada manualmente algumas vezes em sequência até zerar o backlog. Não há mudança de UI nesta etapa.

### Sem mudança no fluxo "ao vivo"

Não vamos mexer nos webhooks nem no `chatwoot-backfill` — eles já populam corretamente conversas novas. Esse plano é só para limpar o passivo histórico.

## Após a execução

A coluna TM1R no relatório por Caixa de Entrada e nos KPIs deve passar a mostrar valores reais para a grande maioria das conversas. Conversas sem mensagem de saída (não respondidas) continuarão com TM1R nulo — comportamento correto.

## Detalhes técnicos

- Arquivo novo: `supabase/functions/chatwoot-fill-tm1r/index.ts`
- Endpoint Chatwoot: `GET /api/v1/accounts/{accountId}/conversations/{convId}/messages?page=N`
- Campos atualizados: `first_contact_message_at`, `first_response_at` (timestamptz)
- Concorrência: lotes de 5 conversas em paralelo, sleep ~220ms entre lotes
- Re-executável: idempotente (só preenche o que estiver nulo)

## Fora de escopo

- Não vamos recalcular TMA — `opened_at` e `conversation_closed_at` já estão populados na maioria.
- Não vamos alterar a fórmula de TM1R nem a UI dos KPIs.
- Não vamos agendar via cron — execução manual sob demanda até o backlog zerar.
