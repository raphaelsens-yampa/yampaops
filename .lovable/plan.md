
# Módulo Comissionamento (Sales)

Recriar o fluxo de comissões inspirado na planilha "Performance Financeira - Sales 2025-26.xlsx". A planilha funciona como três blocos que vamos modelar no sistema:

1. **Base de conversões** (aba `NOVO_BD_METABASE_AP` / "Resultado da consulta") — vendas/conversões do mês com Price ID, MRR, cliente.
2. **Catálogos de referência** (`MRR_Prices`, `Tab_Price_Sales`) — mapeiam Price ID → Plano, Área, Vendedor, MRR oficial.
3. **Regras de comissão** (`Tab Referência Comissionamento`) — para cada Plano + Tipo de Pagamento (Mensal / Anual à Vista / Anual Mensalizado / Setup) definem o % de comissão.

A aba `Performance Duda (nova base)` é só um pivot que reproduzimos diretamente em SQL/JS: filtra por (mês × plano × vendedor), soma o MRR e multiplica pelo % correto da Tab Referência.

---

## Navegação

- Nova entrada no sidebar **Sales → Comissionamento** (`/comissionamento`).
- Mantém a página atual `/commissions` por enquanto; aposentamos depois que validarmos.
- Abas dentro da nova página:
  - **Visão Geral** — totais por vendedor/mês, ranking, totais por plano.
  - **Conversões** — listagem das linhas importadas com cálculo individual.
  - **Importar** — upload do XLSX + preview antes de salvar.
  - **Tabela de Referência** — CRUD do `commission_reference`.
  - **Mapa de Preços** — CRUD do `commission_price_map` (Price ID / Nome Oferta → Plano + Vendedor).

## Regra de pagamento (M+2)

Toda venda gerada num mês de referência **M0** é paga em **M0 + 2 meses** (mês fechado → desembolso 2 meses depois). Ex.: planilha de **Abril/2026** importada → comissão paga em **Junho/2026**.

- Cada `commission_conversions` guarda `sale_month` (M0) e `payment_month` (M+2, calculado automaticamente no import).
- Visão Geral tem **dois seletores de mês**: "Mês da Venda" (M0) e "Mês de Pagamento" (M+2). Os totais consolidam por `payment_month` por padrão (que é o que o financeiro precisa para pagar).
- Card de **"A pagar nos próximos 2 meses"** mostrando provisões M+1 e M+2 para planejamento de caixa.

## Banco de dados (Lovable Cloud)

```text
commission_reference
 ├ plan_name        text       "+Controle", "Pro - Mensal", "Time Financeiro"...
 ├ payment_type     enum       'mensal' | 'anual_avista' | 'anual_mensalizado' | 'setup'
 ├ plan_price       numeric
 ├ plan_mrr         numeric
 ├ commission_pct   numeric    % sobre caixa do 1º mês
 ├ av_pct           numeric    % AV (só anual à vista)
 └ is_active        bool

commission_price_map           de-para Price ID (ou Nome Oferta) → catálogo
 ├ price_id         text?      "price_1RTlTZDrhWjWTprT..." (NULL p/ casos não-Stripe)
 ├ offer_name       text?      fallback quando não há Price ID (gateway 4blue etc.)
 ├ price_name       text
 ├ plan_name        text
 ├ payment_type     enum
 ├ area             text
 ├ seller_user_id   uuid?      profiles.user_id
 ├ seller_label     text
 └ mrr_override     numeric?
 UNIQUE(price_id) WHERE price_id IS NOT NULL
 UNIQUE(offer_name) WHERE price_id IS NULL

commission_imports
 ├ period_month     date       M0 (mês fechado importado)
 ├ payment_month    date       M+2 (calculado)
 ├ source_file      text
 ├ row_count        int
 ├ matched_count    int
 ├ pending_count    int
 ├ uploaded_by      uuid
 └ status           enum       'draft' | 'committed'

commission_conversions         1 linha por venda importada
 ├ import_id        uuid FK
 ├ sale_month       date       M0
 ├ payment_month    date       M+2
 ├ company_id       text
 ├ customer_name    text
 ├ customer_email   text
 ├ price_id         text?
 ├ offer_name       text
 ├ gateway          text       "stripe" | "4blue" | ...
 ├ mrr              numeric
 ├ recurrence_days  int        30 = mensal, ~365 = anual
 ├ origem_cliente   text       "novo pagante" | "recuperado" | ...
 ├ resolved_plan    text
 ├ resolved_payment_type enum
 ├ resolved_seller_user_id uuid?
 ├ resolved_seller_label text
 ├ commission_pct   numeric
 ├ commission_amount numeric
 └ status           enum       'calculated' | 'pending_mapping' | 'manual_override' | 'ignored'
```

RLS:
- `commission_reference` / `commission_price_map`: leitura `authenticated`, escrita só `admin`.
- `commission_imports` / `commission_conversions`: admin lê tudo; vendedor lê só onde `resolved_seller_user_id = auth.uid()`; escrita só admin.

**Seeds iniciais (rodam na migration)**:
1. `commission_reference`: as 29 linhas da `Tab Referência Comissionamento`.
2. `commission_price_map`: extraio todas as linhas válidas da `Tab_Price_Sales` (≈340 Price IDs) e caso `Vendedor = "Duda"` com `eduarda.nunes@yampa.com.br` via lookup em `profiles.email`; demais vendedores ficam em `seller_label` até serem mapeados manualmente.

## Fluxo de importação

Admin abre **Importar** e envia o XLSX (aba "Resultado da consulta"):

1. Parsing client-side com `xlsx`. Identifico colunas **por header** (não por índice) — o arquivo real tem 23 cols e o original tinha 21 (ex.: o novo input inseriu "Data Pagamento"). Headers usados: `Company ID, Nome, Email, Plano Atual, Inicio Vigencia Plano, Recorrencia Pagamento, Nome Oferta, Stripe Price ID, Gateway, Classificacao Company, MRR, Origem Cliente, Data Ref Analise`.
2. Admin escolhe o **mês de referência (M0)**, default = mês de `Data Ref Analise`. Sistema calcula automaticamente `payment_month = M0 + 2 meses` e mostra na tela.
3. Para cada linha, resolução em cascata:
   - Tem `Stripe Price ID` → busca em `commission_price_map.price_id`.
   - Senão → busca em `commission_price_map.offer_name` (case-insensitive trim).
   - Achou → resolve plano + payment_type + seller. Resolve `commission_pct` em `commission_reference (plan_name, payment_type)`.
   - Não achou → `status = 'pending_mapping'`.
4. Cálculo da comissão:
   - **Mensal** → `mrr * commission_pct` (default 5%).
   - **Anual Mensalizado** → `mrr * commission_pct` (default 15%).
   - **Anual à Vista** → `mrr * av_pct` (default 36%).
   - **Setup** → `mrr * commission_pct`.
5. Preview com totais, # matched, # pendentes, breakdown por vendedor e aviso claro "Comissão a pagar em <Mês M+2>". Botão **Confirmar importação** persiste tudo.
6. Botão **Recalcular** numa importação salva re-aplica regras atuais.

## Telas

- **Visão Geral**: filtros de M0 e M+2; cards (Total Comissão do mês, # Conversões, MRR Total, A pagar em M+1, A pagar em M+2); tabela "Comissão por Vendedor × Tipo (Mensal / Anual 12x / Anual AV / Setup / Total)"; gráfico de evolução.
- **Conversões**: tabela filtrável (mês venda, mês pagamento, vendedor, plano, status) com Mês Venda · Mês Pagamento · Cliente · Plano · Tipo · MRR · % · Comissão · Status. Export PDF/XLSX. Botão "mapear" para criar entrada no `commission_price_map` direto da pendência.
- **Importar**: dropzone XLSX, preview, confirmar.
- **Referência / Mapa**: CRUD com inline edit e busca.

Vendedor (`role = seller`) vê só Visão Geral e Conversões do próprio user_id (filtradas por `payment_month` por padrão = quando vai cair o dinheiro).

## O que NÃO faz parte deste passo

- Não removo a página `/commissions` antiga nem mexo nas tabelas legadas (`commissions`, `commission_products`).
- Sem integração direta com Stripe — input é sempre a planilha do Metabase.
- Cálculo é **snapshot** no momento do import (com botão "Recalcular" quando precisar).
