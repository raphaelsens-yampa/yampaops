# Campanhas de Sales

Nova seção para registrar campanhas de prospecção, subir bases em Excel, acompanhar evolução (manual + cruzamento automático com Chatwoot/Stripe) e gerar relatórios gerenciais.

## Navegação
- Novo item no sidebar **"Campanhas de Sales"** (visível para admin e tatico) com sub-rotas:
  - `/sales-campaigns` — lista geral + KPIs
  - `/sales-campaigns/:id` — detalhe da campanha (base, evolução, relatórios)
  - `/sales-campaigns/reports` — relatório consolidado (cross-campanhas)

## Modelo de dados (novas tabelas)

```text
sales_campaigns
  id, name, description, channel (whatsapp|email|cold_call|ads|outros),
  segment, owner_id, status (planejada|ativa|pausada|concluida),
  start_date, end_date, budget, target_contacted, target_replies,
  target_conversions, target_mrr, custom_field_defs (jsonb),
  created_by, created_at, updated_at

sales_campaign_contacts            -- base completa (híbrido)
  id, campaign_id, name, email, email_norm, phone, phone_digits,
  company, extra (jsonb das colunas mapeadas + custom),
  status (nao_trabalhado|contatado|respondeu|agendado|convertido|descartado),
  matched_contact_id, matched_chatwoot_contact_id, matched_opportunity_id,
  match_method, last_touch_at, mrr_generated, notes, created_at

sales_campaign_snapshots           -- séries temporais agregadas
  id, campaign_id, snapshot_date,
  contacted, replies, meetings, conversions, mrr_generated,
  notes, source (manual|auto|mixed), created_by, created_at

sales_campaign_imports             -- histórico de uploads
  id, campaign_id, file_name, total_rows, mapping (jsonb),
  status, error_message, created_by, created_at
```

- RLS: admin (ALL) e tatico (SELECT/INSERT/UPDATE) via `has_role`.
- Triggers: normalização de email/phone, `updated_at`.
- Índices em `campaign_id`, `email_norm`, `phone_digits`, `status`.

## Funcionalidades

### 1. Lista de campanhas (`/sales-campaigns`)
- Tabela com nome, canal, status, período, base (qtde), contatados, respostas, conversões, MRR, % vs meta.
- Filtros: status, canal, owner, período.
- KPIs no topo: campanhas ativas, total da base, MRR gerado no mês, taxa média de conversão.
- Botão **"Nova campanha"** (dialog com nome, canal, período, metas, custom fields).

### 2. Detalhe da campanha (`/sales-campaigns/:id`)
Tabs:

**a) Visão Geral** — KPIs, funil (base → contatados → respostas → conversões), gráfico de evolução temporal (snapshots), gap vs meta, ROI (MRR/budget).

**b) Base de Contatos**
- Upload de Excel/CSV → wizard: preview, **mapeamento de colunas** (email, telefone, nome, empresa + extras), dedupe por email/telefone.
- Tabela paginada com filtros (status, match Chatwoot/Stripe, busca), edição inline de status e notas, export CSV.
- Botão **"Recasar com Chatwoot/Stripe"** dispara edge function de match.

**c) Evolução (manual + automática)**
- Form para registrar snapshot do dia/semana: contatados, respostas, agendamentos, conversões, MRR (campos editáveis).
- Botão **"Calcular automaticamente"** que preenche valores derivados de `sales_campaign_contacts` + cruzamento Chatwoot/Stripe; usuário pode ajustar antes de salvar.
- Histórico de snapshots em tabela + gráfico de linha.

**d) Configuração**
- Editar metas, custom fields (definição dos campos extras de acompanhamento), permissões.

### 3. Relatórios gerenciais (`/sales-campaigns/reports`)
- Comparativo cross-campanhas: tabela ranqueada por ROI, MRR, conversão.
- Gráfico de barras por canal, por período, por owner.
- Funil consolidado.
- Export PDF/CSV.

## Edge Functions
- `sales-campaign-import` — processa upload, valida mapping, insere contatos em batch, dispara match inicial.
- `sales-campaign-match` — recasa contatos da campanha contra `chatwoot_contacts` (email/phone digits) e `stripe_conversions` (email/customer_id), atualiza `matched_*` e `mrr_generated`.
- `sales-campaign-auto-snapshot` — calcula snapshot automático (chamado pelo botão e por cron diário opcional).

## Ideias complementares sugeridas

1. **Cohort analysis** — performance por semana de entrada na base (retenção, time-to-conversion).
2. **Heatmap de horário/dia** — quando contatos respondem mais (base = atividades Chatwoot).
3. **A/B testing de scripts/abordagens** — campo `variant` nos contatos + comparativo de conversão.
4. **CAC e payback por campanha** — usando `budget` + MRR gerado + finance_settings.
5. **Alertas automáticos** — campanha com taxa de resposta caindo, base esgotando, meta em risco.
6. **Tags/labels reutilizáveis** — integrar com sistema de `tags` existente.
7. **Modelo preditivo de conversão** — score por contato baseado em histórico (Lovable AI Gateway).
8. **Pipeline integrado** — botão "Criar oportunidade" direto do contato, já vinculando `category_id` e `origin`.
9. **Sequência de cadência** — definir N toques planejados por campanha e marcar cumprimento.
10. **Leaderboard por campanha** — ranking de sellers dentro da campanha (já temos `Leaderboard.tsx`).
11. **Webhook de entrada** — receber novos contatos via API/Zapier direto numa campanha ativa.
12. **Comparativo "campanha vs orgânico"** — MRR atribuído à campanha vs baseline.

## Detalhes técnicos
- UI: shadcn (Card, Tabs, Table, Dialog, Form, Chart com recharts já em uso).
- Upload Excel: `xlsx` (já usado em `commissionExport.ts`) ou `papaparse` para CSV.
- Match reaproveita lógica de `lead-csv-audit` e `chatwoot-contacts-backfill` (sufixo 8 dígitos para phone).
- Tudo em PT-BR, tokens HSL do design system, sem cores hardcoded.
- Sidebar: adicionar entrada com guard `has_role(admin|tatico)`.

## Fora de escopo (fase 1)
- Envio efetivo de mensagens pela plataforma.
- Integração com WhatsApp API/SMTP de envio.
- Modelo preditivo (sugestão #7) — fica para fase 2.
