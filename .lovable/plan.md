## Cockpit de Descontos Dinâmicos por TPV

Novo módulo dentro do Yampa, com 3 rotas sob `/discounts/*`, integrado à sidebar e ao sistema de papéis atual (`admin` = Sales Ops, `seller` = CS). Toda integração externa (subadquirente, WhatsApp) é **simulada** — o usuário sobe um CSV/cola dados e um botão "Processar Descontos do Mês" roda o cálculo localmente sobre as tabelas.

---

### 1. Modelo de dados (Lovable Cloud)

Quatro novas tabelas com RLS. Clientes do cockpit **referenciam `opportunities`** (reaproveita base existente: nome empresa, CNPJ, CS responsável via `consultant_id`).

- **`discount_tiers`** — faixas configuráveis (nome, tpv_min, tpv_max, valor_desconto). Seed inicial com as 3 faixas do brief (Test Drive R$40, Parceiro R$100, Yampa Total R$180).
- **`discount_clients`** — extensão da `opportunity` para o cockpit: `opportunity_id`, `cnpj`, `saas_plan_name`, `saas_base_price`, `plan_type` (`software` | `consultoria_bpo`), `embedded_software_value` (para combos BPO), `cs_user_id` (default = `consultant_id` da opp), `active`.
- **`tpv_monthly`** — TPV transacionado por cliente/mês: `client_id`, `reference_month` (date, dia 1), `tpv_amount`, `sync_status` (`pending`|`synced`|`error`), `synced_at`. Unique (`client_id`, `reference_month`).
- **`invoice_log`** — fatura calculada: `client_id`, `reference_month`, `original_value`, `discount_applied`, `final_value`, `tier_id`, `processed_at`, `processed_by`. Unique (`client_id`, `reference_month`).

**RLS:**
- `discount_tiers`: leitura todos autenticados; escrita só `admin`.
- `discount_clients`, `tpv_monthly`, `invoice_log`: `admin` vê tudo; `seller` vê apenas registros onde `cs_user_id = auth.uid()` (em `tpv_monthly`/`invoice_log`, via join com `discount_clients`). Escrita só `admin`.

**Função SQL helper** `calculate_discount(plan_type, base_price, embedded_value, tpv) returns jsonb` — encapsula as regras de negócio (tier matching + clamp a R$0 + cálculo sobre valor embutido para BPO). Usada pelo botão de processamento.

---

### 2. Telas e navegação

Adiciona 3 itens na sidebar (`AppSidebar.tsx`) num novo grupo "Descontos TPV", visíveis conforme papel.

#### 2.1 `/discounts/overview` — Sales Ops (admin)
- **KPI Cards**: TPV total do mês, desconto concedido acumulado (R$), clientes com desconto ativo, churn transacional (TPV zerado últimos 7 dias / sem registro recente).
- **Painel de Sincronização**: 
  - Textarea/upload CSV simulado (colar linhas `cnpj;tpv_amount`) com mês de referência selecionável.
  - Botão **"Sincronizar TPV"** → upsert em `tpv_monthly` com `sync_status=synced`.
  - Botão **"Processar Descontos do Mês"** → para cada cliente com TPV no mês, chama `calculate_discount` e faz upsert em `invoice_log`. Mostra log de execução (X processados, Y zerados, Z erros).
- **Distribuição por faixa**: gráfico de barras (Recharts) + tabela com contagem de clientes por faixa.

#### 2.2 `/discounts/portfolio` — Carteira do CS (seller + admin)
- **KPI Cards da carteira**: contas atribuídas, na faixa máxima, alertas de oportunidade (a <15% da próxima faixa).
- **Lista priorizada "Próximos da Faixa"**: clientes a menos de 15% do `tpv_max` da próxima faixa, ordenada por proximidade. Cada item: nome, TPV atual, falta R$X, ganha R$Y de desconto. Botão "Gerar mensagem".
- **Tabela geral**: busca por CNPJ/nome, colunas: cliente, plano, TPV mês, faixa atual, desconto próxima fatura, ação.
- **Modal lateral — Gerador WhatsApp**: ao clicar num cliente, abre `Sheet` com texto pré-formatado usando o template do brief, preenchido dinamicamente (nome cliente, nome CS via `profiles`, TPV, diferença, valor desconto). Botão "Copiar" + toast de confirmação. Sem envio real.
- Admin vê todas as carteiras com filtro por CS.

#### 2.3 `/discounts/rules` — Configuração (admin)
- CRUD inline das faixas em `discount_tiers`: nome, TPV mín/máx, valor desconto. Validação de não-sobreposição.
- Pequena prévia "como ficariam X clientes" usando dados do mês atual.

---

### 3. Regras de negócio (centralizadas em `calculate_discount`)

1. Match de faixa: maior tier onde `tpv_min <= tpv <= tpv_max` (ou `tpv_max` nulo = sem teto).
2. Base de cálculo:
   - `plan_type = 'software'` → desconto sobre `saas_base_price`.
   - `plan_type = 'consultoria_bpo'` → desconto sobre `embedded_software_value`; resto do plano preservado.
3. **Clamp**: `final_value = max(0, original_value - discount_applied)`. Se desconto > base aplicável, desconto efetivo = base aplicável (nunca negativo).
4. Sem TPV no mês ou TPV < menor `tpv_min` → desconto = 0, faixa = nenhuma.

---

### 4. Detalhes técnicos

- Arquivos novos:
  - `supabase/migrations/<timestamp>_discount_cockpit.sql` (tabelas + RLS + grants + função + seed das 3 faixas)
  - `src/pages/discounts/Overview.tsx`, `Portfolio.tsx`, `Rules.tsx`
  - `src/components/discounts/KpiCards.tsx`, `SyncPanel.tsx`, `TierDistributionChart.tsx`, `OpportunityAlerts.tsx`, `PortfolioTable.tsx`, `WhatsAppMessageSheet.tsx`, `TiersEditor.tsx`
  - `src/hooks/useDiscountClients.ts`, `useTpvMonth.ts`, `useDiscountTiers.ts`
  - `src/lib/discounts.ts` (helpers de cálculo no front, espelhando SQL para previews)
- `src/App.tsx`: 3 rotas novas com `RequireArea` apropriado.
- `src/components/AppSidebar.tsx`: novo grupo "Descontos TPV".
- Design: usa tokens existentes (primary `#01B8E0`, secondary `#2D094C`), Sora/Manrope. Cards de alerta usam `warning` (amarelo) e `success` (verde) já no design system.
- PT-BR em toda UI.
- Sem dependências novas (Recharts já está no projeto).

---

### 5. Fora de escopo (v1)

- Integração real com subadquirente (TPV é colado/carregado manualmente).
- Envio real de WhatsApp (apenas gera texto e copia).
- Geração de fatura/cobrança real (apenas registra em `invoice_log`).
- Histórico/auditoria detalhada de alterações em faixas.

---

Após aprovação, implementarei na ordem: (1) migração, (2) sidebar+rotas, (3) tela Regras, (4) Overview com simulador, (5) Carteira CS com gerador WhatsApp.