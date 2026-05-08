## Objetivo
Tornar a auditoria mais transparente, editável e confiável: acessar a conversa original, ver/editar a rubrica usada pela IA, ter o playbook como markdown rico e ignorar ruído de mensagens de sistema do Chatwoot.

## Mudanças

### 1. Link "Abrir no Chatwoot" na conversa auditada
- No detalhe de cada conversa em `/atendimentos/auditoria` (Sheet) e no cabeçalho do card da lista, adicionar botão **"Abrir no Chatwoot"** (ícone external-link) que abre em nova aba.
- URL montada no frontend a partir de `integration_settings.chatwoot_base_url` + `chatwoot_account_id` + `conversation_id`:
  `{base_url}/app/accounts/{account_id}/conversations/{conversation_id}`
- Buscar `chatwoot_base_url` e `chatwoot_account_id` uma vez via React Query e reusar em todos os links.

### 2. Rubrica de scoring editável (severity, score, flags)
Hoje a rubrica está hardcoded no system prompt (`chatwoot-audit-run/index.ts`). Vamos expor tudo via banco e UI.

**Migração**: adicionar colunas em `chatwoot_audit_settings`:
- `scoring_rubric` (text) — markdown explicando como calcular `overall_score`, `tone_score`, `churn_risk_score`, `playbook_score` e como decidir `severity` (ok/attention/critical). Vem com um default que reproduz a lógica atual.
- `tone_categories` (jsonb) — lista editável das categorias de tom (palavrao, ironia, grosseria, impaciencia, outros) com label e exemplos.
- `churn_signal_types` (jsonb) — lista editável de tipos de sinal de churn.

**Edge function** (`chatwoot-audit-run`): substitui o bloco "Severity da conversa..." hardcoded pelo conteúdo de `scoring_rubric`. Mantém o tool schema, mas o que o modelo segue como critério vem 100% do banco.

**UI** (`/atendimentos/auditoria/configuracoes`): nova aba/seção **"Rubrica de Análise"** com:
- Editor markdown (textarea grande com preview) para `scoring_rubric`.
- Tabelas para gerenciar `tone_categories` e `churn_signal_types`.
- Sliders existentes (`attention_threshold`, `critical_threshold`) ficam, mas a rubrica passa a referenciá-los explicitamente.
- Botão "Restaurar padrão" para a rubrica.

### 3. Playbook como markdown rico
Hoje o playbook é uma lista chave/label simples. Vamos suportar um documento markdown completo, mantendo também os itens de checklist (porque a IA precisa devolver `passed` por item).

**Migração**: adicionar `playbook_markdown` (text) em `chatwoot_audit_settings`. Os `playbook_items` continuam para o checklist verificável.

**Edge function**: o system prompt passa a incluir o `playbook_markdown` completo como contexto, e os `playbook_items` continuam sendo a lista que a IA marca como passed/failed.

**UI** (settings):
- Nova seção **"Playbook"** com editor markdown grande (mesmo componente da rubrica) para `playbook_markdown`.
- A seção atual de "Itens do playbook" (checklist) continua logo abaixo.
- Texto explicativo: "O markdown é o contexto completo; os itens abaixo são as checagens que a IA marcará item a item."

### 4. Filtro de mensagens de sistema do Chatwoot
No `chatwoot-audit-run/index.ts`, função `fetchTranscript`, ampliar o filtro além de `!m.private`:
- Ignorar `m.message_type === 2` ou `"activity"` (mensagens de atividade do Chatwoot — "Conversa marcada como resolvida por X", "Atribuída a Y", etc.).
- Ignorar `m.content_type` quando for `"input_csat"`, `"text"` com `content_attributes.type === "activity"`, e demais tipos não-conversacionais.
- Adicional: regex de segurança para descartar conteúdos com padrões típicos de sistema, configurável via novo campo `system_message_patterns` (text[]) em `chatwoot_audit_settings` com defaults:
  - `^Conversa foi marcada como`
  - `^Conversation was marked as`
  - `^Envio via app`
  - `^Atribuída? a `
  - `^Assigned to `
  - `^.{1,80} resolveu a conversa`

**UI** (settings): adicionar campo de chips/tags **"Padrões de mensagens a ignorar"** editável.

## Detalhes técnicos
- Migração única adicionando: `scoring_rubric text`, `tone_categories jsonb`, `churn_signal_types jsonb`, `playbook_markdown text`, `system_message_patterns text[]` com defaults sensatos.
- `ChatwootAuditSettings.tsx`: refatorar para abas (`Geral`, `Rubrica`, `Playbook`, `Filtros & Palavras-chave`) para não virar uma página gigante.
- `ChatwootAudit.tsx`: hook `useChatwootIntegration()` para montar URL do Chatwoot; botão no card e no Sheet.
- `chatwoot-audit-run/index.ts` e `chatwoot-audit-analyze-one/index.ts`: ler todos os novos campos de settings, aplicar filtro de regex no transcript antes do hash.
- Reanalisar conversas existentes invalidará o `transcript_hash` (transcript fica menor sem mensagens de sistema), então o force=true ou novo hash naturalmente refazem.

## Fora de escopo
- Editor markdown WYSIWYG (vamos com textarea + preview simples usando `react-markdown` que já deve estar disponível, ou um preview básico).
- Versionamento histórico das rubricas/playbook.
- Re-rodar automaticamente todas as auditorias após mudar a rubrica (usuário roda backfill manualmente).
