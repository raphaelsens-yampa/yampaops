Implementação das 3 fases de evolução do módulo Auditoria IA, na ordem aprovada. Cada fase é um conjunto coeso de mudanças.

---

## Fase 1 — Fundamentos de QA em escala

### 1.1 Amostragem estratificada
Migração: adicionar em `chatwoot_audit_settings`:
- `sampling_enabled boolean default false`
- `sampling_percent_per_seller numeric default 10` (% aleatório de cada vendedor)
- `sampling_new_seller_days int default 30` e `sampling_new_seller_percent numeric default 30`
- `must_audit_lost boolean default true` (100% das oportunidades perdidas)
- `must_audit_critical boolean default true` (100% se já marcada com churn signal em análise prévia)
- `must_audit_sla_breach boolean default true` (TM1R acima de threshold)
- `sla_breach_seconds int default 1800`

Edge function `chatwoot-audit-run`: antes do loop, aplicar regras de seleção. Conversas "must audit" entram sempre; restante é amostrado aleatoriamente por vendedor respeitando o percentual.

UI nova aba "Amostragem" em settings com sliders e switches.

### 1.2 Override humano
Migração: adicionar em `chatwoot_conversation_audits`:
- `human_overall_score numeric`, `human_severity text`, `human_notes text`
- `override_reason text`, `human_reviewed_by uuid`, `human_reviewed_at timestamptz`

`reviewed_by`/`reviewed_at`/`review_notes`/`review_status` já existem — vamos usar como aprovação simples e os novos campos como "ajuste de nota".

Dashboard e ranking passam a usar `COALESCE(human_overall_score, overall_score)` e `COALESCE(human_severity, severity)`. Badge "revisado" quando `human_reviewed_at` não é nulo.

### 1.3 Fila de revisão (`/atendimentos/auditoria/revisao`)
Nova página com tabs: Pendentes / Aprovadas / Ajustadas / Rejeitadas. Filtros por vendedor, severidade, período. Por linha:
- Resumo + score + severity da IA
- Botões: **Aprovar** (set `review_status='approved'`), **Ajustar** (abre dialog para mudar score/severity + motivo, grava `human_*`), **Rejeitar** (`review_status='rejected'`), **Abrir no Chatwoot**
- Atalhos: J/K navega, A aprova, E ajusta, R rejeita

Adicionar item no sidebar dentro de "Auditoria IA" (sub-rota).

### 1.4 Notificação ao vendedor
- Página `/atendimentos/auditoria/minhas` para o vendedor ver suas auditorias (RLS já existe via email)
- Badge no sidebar com contador de auditorias críticas não vistas (nova coluna `seller_seen_at timestamptz` em `chatwoot_conversation_audits`)
- Adicionar item no menu apenas para usuários com permissão view em `auditoria_ia` que não sejam admin/tatico

---

## Fase 2 — Calibração e confiabilidade

### 2.1 Versionamento de rubrica
Nova tabela `chatwoot_audit_rubric_versions`:
- `id`, `version_label text`, `scoring_rubric text`, `playbook_markdown text`, `playbook_items jsonb`, `tone_categories jsonb`, `churn_signal_types jsonb`, `ai_model text`, `created_by uuid`, `created_at`, `notes text`

Em `chatwoot_conversation_audits`: adicionar `rubric_version_id uuid` (referência por id, sem FK rígida).

Trigger ou lógica em settings: ao salvar mudanças relevantes em `chatwoot_audit_settings`, criar nova row em rubric_versions automaticamente. Edge function `chatwoot-audit-run` lê settings, garante que existe versão atual e grava o id em cada audit.

UI: na aba Rubrica, lista de versões com data, autor, notas, botão "Restaurar" (carrega no editor) e "Ver diff" (modal com diff simples das strings).

### 2.2 Golden Set
Nova tabela `chatwoot_audit_golden_set`:
- `id`, `conversation_id bigint unique`, `expected_severity text`, `expected_overall_score numeric`, `expected_flags jsonb`, `notes text`, `created_by`, `created_at`, `updated_at`

UI: botão "Marcar como golden" no detalhe da conversa (admin) que abre dialog para definir os "valores corretos". Nova página `/atendimentos/auditoria/golden-set` listando todos os golden e divergência atual com a última análise.

Nova edge function `chatwoot-audit-golden-test`: roda a rubrica/modelo atual contra todas as conversas do golden set e devolve matriz de confusão + score de calibração (% de severities iguais).

Botão "Testar rubrica" na aba Rubrica que dispara essa função.

### 2.3 Métricas de concordância IA × humano
Card no dashboard principal "Concordância IA-Humano (30d)":
- % de auditorias com `human_severity` igual à `severity` da IA (entre as revisadas/ajustadas)
- Distribuição: IA superestima vs subestima
- Top 5 itens do playbook com mais override

Query agregada feita no front; sem nova migração.

---

## Fase 3 — Métricas avançadas e novas dimensões

### 3.1 Dashboard de tendências
Nova rota `/atendimentos/auditoria/insights` com:
- **Linha temporal** de score médio por vendedor (últimas 12 semanas), usando recharts
- **Heatmap do playbook**: vendedores × itens, cor por % de pass — usa `playbook_checks` jsonb
- **Distribuição de churn signals** por inbox (bar chart)
- **Scatter** score médio × taxa de win por vendedor (cruzando com `opportunities`)
- **Funil** ok/attention/critical no tempo

### 3.2 Alertas proativos
Nova tabela `chatwoot_audit_alerts`:
- `id`, `alert_type text` (3_criticals_week / score_drop / churn_spike), `target_user_id uuid`, `target_inbox text`, `severity text`, `message text`, `metadata jsonb`, `created_at`, `acknowledged_at`, `acknowledged_by`

Nova edge function `chatwoot-audit-alerts-check` rodando em cron diário (pg_cron + pg_net). Regras:
- Vendedor com 3+ críticas em 7 dias
- Queda >20% no score médio semanal vs semana anterior
- Spike de churn signals num inbox (>2x mediana 4 semanas)

Bell icon no header do módulo com badge de alertas não-acknowledged.

### 3.3 Novas dimensões de análise
Migração: adicionar em `chatwoot_conversation_audits`:
- `sla_compliance jsonb` ({tm1r_seconds, was_acceptable, reasoning})
- `sentiment_arc jsonb` ({start, end, trajectory})
- `missed_opportunities jsonb` (array de {moment, what_client_wanted, what_seller_did})
- `compliance_flags jsonb` (array de {type, severity, excerpt})
- `technical_accuracy jsonb` ({issues: array, accuracy_score})

Em `chatwoot_audit_settings`: `product_knowledge_base text` (markdown editável com fatos do produto para a IA usar como referência).

Edge function `chatwoot-audit-run`:
- Tool schema do AI ganha as 5 novas seções
- System prompt injeta `product_knowledge_base`
- Passa `tm1r_seconds` da `chatwoot_conversations` no contexto da conversa

UI no detalhe da auditoria: novas seções colapsáveis para cada dimensão.

Settings: nova aba "Knowledge Base" com editor markdown.

### 3.4 Exportação
- Botão "Exportar CSV" na lista de auditorias (gera no front com PapaParse)
- Botão "Exportar PDF" no detalhe (nova edge function `chatwoot-audit-export-pdf` usando jsPDF/html-to-pdf-node ou geração HTML + impressão)
- Relatório executivo semanal: nova edge function `chatwoot-audit-weekly-report` em cron semanal (segunda 8h) que monta resumo agregado e armazena em nova tabela `chatwoot_audit_reports` (admin baixa em PDF da UI)

---

## Ordem de execução

Vou implementar em sequência: Fase 1 inteira → confirma funcionando → Fase 2 → Fase 3. Cada fase é uma série de migrações + alterações nas edge functions + novas páginas/abas. RLS sempre seguindo o padrão atual (admin manage, tatico view, seller vê próprias).

## Fora de escopo
- A/B de prompts em paralelo
- Integração com Klaus/MaestroQA
- Treinamento automático com IA
- Análise de áudio
- Gamificação