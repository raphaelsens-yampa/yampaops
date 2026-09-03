# Voz do Cliente — Temas e Dores nos Atendimentos

Nova tela em CX que lê **apenas as mensagens recebidas dos clientes** (nunca as enviadas pelos agentes) e mostra o que está sendo falado: principais temas, dores recorrentes, nuvem de palavras e evolução ao longo do tempo.

## O que a tela vai mostrar

1. **Cards de topo** — conversas analisadas no período, mensagens de cliente consideradas, nº de temas ativos, tema que mais cresceu vs. período anterior.
2. **Ranking de Temas / Dores** — tema, volume de conversas, % do total, variação p.p. vs. período anterior, sentimento predominante, score médio de auditoria das conversas daquele tema e quantas foram `critical`.
3. **Nuvem de palavras** — termos mais frequentes nas falas dos clientes, com stopwords em PT-BR, remoção de saudações/assinaturas e agrupamento de bigramas ("segunda via", "não consigo emitir"). Clique no termo filtra a lista de conversas.
4. **Evolução dos temas** — gráfico de linhas por semana com os temas selecionáveis, para ver dor subindo ou caindo.
5. **Drill-down** — ao clicar num tema: lista de conversas com trechos literais citados pelo cliente, caixa de entrada, atendente, severidade da auditoria e link direto para o Chatwoot.
6. **Filtros** — período, caixa de entrada, atendente/time, severidade da auditoria e busca por palavra.

## Como os temas são descobertos

A IA nomeia os temas livremente (descoberta aberta), em duas etapas:

- **Etapa 1 — por conversa:** junta as mensagens do cliente daquela conversa e extrai 1–3 temas, a dor central, o sentimento e trechos literais. Cruza com a auditoria existente (resumo, severidade, sinais de churn) para enriquecer o contexto, sem usar as falas do agente na medição.
- **Etapa 2 — consolidação:** um passe agrupa rótulos parecidos ("cobrança duplicada" / "cobraram 2x") num tema canônico, gerando um catálogo com nome, descrição e sinônimos. Isso mantém a comparabilidade mês a mês sem engessar a taxonomia. O catálogo fica editável (renomear tema, fundir dois temas, ocultar tema) numa aba de configuração.

## Automação

- **Cron diário** processa o dia anterior em lotes, marcando progresso por conversa (reprocessa só o que faltou) e com trava de execução única.
- **Botão manual** na tela para (re)processar um período escolhido, com barra de progresso e cancelamento, no mesmo padrão já usado na Auditoria IA.
- Interrompe e sinaliza na tela caso a IA fique sem crédito ou bloqueada; volta sozinho na próxima execução quando for limite temporário.

## Detalhes técnicos

- Fonte: `chatwoot_messages` filtrando `sender_type = 'client'` e `is_private = false`. Observação: a coluna guarda até 500 caracteres por mensagem — suficiente para tema/dor; mensagens longas ficam truncadas.
- Novas tabelas (com GRANTs e RLS para admin/tático): `chatwoot_voice_runs` (execuções + lock + estado pausado), `chatwoot_conversation_themes` (tema, dor, sentimento, trechos, hash das mensagens para idempotência), `chatwoot_theme_catalog` (tema canônico, sinônimos, ativo).
- Nova edge function `chatwoot-voice-extract` (lote limitado por execução, idempotente, circuit breaker) + `chatwoot-voice-consolidate` para o catálogo; agendamento via pg_cron.
- Nuvem de palavras calculada no cliente a partir de contagem agregada retornada por RPC, sem custo de IA.
- Nova página `src/pages/ChatwootVoiceOfCustomer.tsx`, rota em `App.tsx`, item "Voz do Cliente" no grupo CX do `AppSidebar.tsx` abaixo de Auditoria IA, e permissão nova em `AccessLevelManager.tsx`.
- Datas e agrupamentos em `America/Sao_Paulo`; consultas usando `fetchAllPaged`.
