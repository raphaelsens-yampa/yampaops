## Subseção: Auditoria de Leads via CSV

Nova subseção dentro de **Insights → Jornada do Lead** (aba/sub-rota) que recebe um CSV do Marketing, cruza cada linha com **100% das conversas do Chatwoot** e com pagamentos da Stripe, e gera um painel + relatório pronto para reunião de gerência.

---

### 1. Banco de dados (nova migration)

**`lead_imports`** — cabeçalho de cada importação
- `id`, `created_at`, `created_by`, `name` (nome dado pelo usuário), `source_file_name`
- `total_rows`, `matched_chatwoot`, `matched_paying`
- `column_mapping jsonb` (mapeamento escolhido: email→col0, phone→col2, etc.)
- `status` (`processing` | `done` | `error`)

**`lead_import_rows`** — linhas individuais com resultado calculado
- `id`, `import_id` (FK), `row_index`
- Entrada: `lead_email`, `lead_phone_raw`, `lead_phone_normalized`, `lead_name`, `lead_origin`, `lead_campaign`, `lead_created_at`, `extra jsonb`
- Match Chatwoot: `cw_match_method` (`phone`|`email`|null), `cw_conversation_ids int[]`, `cw_first_contact_at`, `cw_first_agent_name`, `cw_first_agent_email`, `cw_total_conversations`, `cw_total_messages`, `cw_customer_replied bool`, `cw_last_status`, `cw_last_label` (motivo de perda/tabulação)
- Match Stripe: `stripe_paying bool`, `stripe_converted_at`, `stripe_mrr`, `stripe_plan`
- Cálculo: `hours_to_first_contact`, `sla_bucket`

RLS: admin + tatico podem ler/escrever; seller não vê.

---

### 2. Edge function `lead-csv-audit`

Recebe `{ import_id, rows: [{email, phone, created_at, name?, origin?, campaign?, extra?}] }`.

Para cada lote (em chunks de 500):
1. Normaliza email/phone.
2. Busca conversas Chatwoot com match por **telefone primeiro, email fallback** (mesma lógica do `lead-journey-report`), mas considera **qualquer conversa antes ou depois** do `created_at`.
3. Para cada lead resolve:
   - `cw_first_contact_at` = menor `first_contact_message_at`/`opened_at` entre as conversas casadas.
   - `cw_first_agent` = `assignee_name`/`assignee_email` da conversa de menor timestamp.
   - `cw_total_messages` somado, `cw_customer_replied` true se existir msg de contato.
   - `cw_last_label` = última label/`tabulacao_atendimento`.
4. Cruza com `stripe_conversions` por `customer_email` (e por `matched_opportunity_id` se houver opp ligada ao contato).
5. Insere/atualiza `lead_import_rows`, atualiza contadores em `lead_imports`.

Também expõe `GET ?import_id=...` para devolver o relatório agregado (KPIs + buckets + breakdowns + linhas).

---

### 3. Frontend — nova aba na página Jornada do Lead

`src/pages/LeadJourney.tsx` ganha um `<Tabs>` no topo:
- **Aba 1: Pipeline AC** (relatório atual existente, sem alteração)
- **Aba 2: Auditoria via CSV** (nova)

#### Componentes da aba CSV

**a) Histórico de importações** (`lead_imports`): lista compacta com nome, data, total, % contactados, % pagantes. Botão para reabrir relatório de uma importação anterior.

**b) Wizard de upload (3 passos)**
1. Drop/seleção do CSV (parse client-side com PapaParse).
2. **Mapeamento de colunas**: detecta cabeçalhos automaticamente, sugere via heurística (`email`/`mail`, `phone`/`telefone`/`whats`, `data`/`created`/`criado`). Usuário ajusta selects para email/phone/created_at/name/origin/campaign. Preview das 5 primeiras linhas.
3. Validação: data parseável (ISO ou `dd/mm/yyyy`), pelo menos email **ou** phone por linha. Mostra contagem de linhas válidas/descartadas. Botão "Processar".

**c) Painel de resultado** (após processamento ou ao reabrir importação)

KPIs no topo:
- Leads recebidos (total CSV)
- Abordados pelo time (com 1ª msg do agente)
- Responderam (cliente respondeu)
- Pagantes Stripe + MRR total
- SLA médio até 1º contato

Funil visual 4 etapas: Recebidos → Abordados → Responderam → Pagantes (com taxa entre etapas).

Gráficos:
- Distribuição SLA buckets (`<24h`, `1-3d`, `4-7d`, `>7d`, `Sem contato`)
- Série temporal por dia (recebidos vs abordados vs pagantes)

Breakdowns (tabs):
- **Por consultor (1º a atender)**: leads atendidos, taxa de resposta, taxa de conversão, MRR.
- **Por origem/campanha** (do CSV): mesmas métricas, mostra qualidade do lead que o Marketing entrega.
- **Qualidade do lead**: ranking de origens por taxa de resposta + taxa de conversão.

Tabela detalhada (paginada, exportável CSV):
- Lead | Email | Tel | Origem | Criado | 1º contato | Atendente | Msgs | Cliente respondeu? | Pagante? | MRR | Tabulação
- Filtros: status, consultor, origem, bucket SLA, "só sem match", "só pagantes".

Seção de **debug** (igual à existente da aba Pipeline): expande lead e mostra IDs das conversas Chatwoot vinculadas + motivo do match.

Botão **"Exportar relatório completo"** (CSV) com todos os campos.

---

### Detalhes técnicos

- Parsing CSV no cliente com `papaparse` (já leve, ~45kb).
- Edge function processa em background mas síncrona até 500 linhas; acima disso processa em chunks com progresso opcional (versão 1: limitar a 5.000 linhas/CSV e aguardar).
- Lógica de match reusa helpers `normPhone`/`normEmail` do `lead-journey-report` (duplicar para manter functions independentes — não compartilham módulos).
- Match telefone: pré-carrega todas conversas com `contact_phone not null` no Chatwoot e indexa por telefone normalizado (mesmo padrão da função existente).
- Buckets SLA: `<24h`, `1-3d`, `4-7d`, `>7d`, `Sem contato` (consistente com aba existente).
- Sidebar: nenhum item novo — entra via aba dentro de `/insights/lead-journey`.

### Arquivos afetados
- **Migration**: cria `lead_imports`, `lead_import_rows` + RLS.
- **Nova edge function**: `supabase/functions/lead-csv-audit/index.ts`.
- **Edit**: `src/pages/LeadJourney.tsx` — envolve conteúdo atual em `<Tabs>` e adiciona aba "Auditoria via CSV".
- **Novos componentes**: `src/components/lead-journey/CsvAuditTab.tsx`, `CsvUploadWizard.tsx`, `CsvAuditReport.tsx`, `ImportsHistory.tsx`.
- **Dependência nova**: `papaparse` + `@types/papaparse`.