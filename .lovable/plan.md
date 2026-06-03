## Objetivo

Novo menu **Sales → Precificação Serviços** que reproduz fielmente a engine da planilha "Precificação Com Ficha Yampa", permitindo: (1) editar todos os parâmetros pela tela, (2) versionar a precificação inteira (snapshot), (3) importar/exportar a planilha .xlsx, (4) gerar proposta comercial em PDF com a marca da empresa, (5) opcionalmente vincular a uma Oportunidade do pipeline.

## Estrutura do módulo (8 abas)

```text
┌─ Visão Geral ─ KPIs: custo/min, markup por linha, # serviços, alerta de preço abaixo do ideal
├─ 1. Custos Fixos ──── editor de despesas mensais (categorias 5.1…5.99) + total apurado
├─ 2. Mão de Obra Direta ─ mesma estrutura, salários da equipe produtiva
├─ 3. Capacidade Produtiva ─ pessoas, horas/dia, dias úteis, % produtividade → custo/min
├─ 4. Markup ───────── 3 linhas (Premium/Gold/Prata): % impostos, comissão, gateway,
│                       investimento, churn, despesa fixa, lucro desejado → Mark-up
├─ 5. Insumos & Subprodutos ─ ações (min × custo/min) e combos de insumos
├─ 6. Ficha Técnica ── cada Serviço = N insumos/subprodutos com qty → custo total
├─ 7. Cadastro de Serviços ─ tabela principal: preço praticado, preço ideal sugerido,
│                       CV unitário, CF unitário, M.C.%, lucro projetado, STATUS automático
└─ 8. Propostas ────── builder de proposta (cliente, escopo, serviços, desconto) + PDF
```

Cada aba mostra os campos calculados em tempo real (memoização React) e destaca em amarelo os campos editáveis (replicando convenção da planilha).

## Versionamento

- Tabela `pricing_versions` guarda um snapshot completo (JSONB) de TODA a precificação por data, com nome e status (`draft`/`active`/`archived`). Apenas uma `active` por vez.
- Botões: **Nova versão**, **Duplicar atual**, **Importar de XLSX**, **Exportar para XLSX**, **Ativar**, **Comparar com versão X**.
- Propostas ficam carimbadas com `version_id` para auditoria mesmo após mudanças futuras.

## Importação/Exportação XLSX

- **Importar**: edge function `pricing-import-xlsx` lê o .xlsx no mesmo formato da planilha original (mesmos nomes de abas/colunas), valida, cria nova `pricing_versions` em status draft com tudo dentro.
- **Exportar**: edge function `pricing-export-xlsx` gera .xlsx idêntico em layout para edição offline.
- **Exportar Proposta (PDF)**: edge function `pricing-proposal-pdf` (pdf-lib + template estilizado com logo, paleta Yampa, capa, escopo, tabela de investimento mensal/anual, condições, rodapé).

## Schema (resumo de tabelas)

```text
pricing_versions(id, name, status, is_active, snapshot jsonb, source: manual|import, created_by)
pricing_fixed_costs(version_id, code, description, amount)
pricing_labor_costs(version_id, code, description, amount)
pricing_capacity(version_id, people, hours_per_day, work_days, productivity_pct)
pricing_markup_lines(version_id, line: premium|gold|prata, tax_pct, commission_pct,
                     gateway_pct, investment_pct, sales_commission_pct,
                     fixed_expense_pct, churn_pct, profit_pct, reinvest_pct)
pricing_inputs(version_id, name, minutes, unit)              -- insumos
pricing_subproducts(version_id, name, items jsonb)           -- combos de insumos
pricing_services(version_id, name, contract_months, line, practiced_price,
                 recipe jsonb, qty_sold)                     -- ficha técnica + preço
pricing_proposals(id, version_id, opportunity_id nullable, client_name, client_doc,
                  items jsonb, discount_pct, total, status, pdf_url, created_by)
```

Todas com RLS: leitura para `authenticated`, escrita para `admin` (parâmetros) e `admin`/`seller` autor (propostas). GRANTs explícitos. `pricing_versions.snapshot` permite "congelar" para auditoria histórica de propostas.

## Engine de cálculo (idêntica à planilha)

```text
custo_minuto = custo_fixo_total / (pessoas * horas/dia * 60 * dias * produtividade)
markup_line  = 1 / (1 - Σ(% variáveis) - lucro_desejado)
custo_insumo = minutos × custo_minuto
custo_subproduto = Σ custo_insumos do combo
custo_servico = Σ (qty × custo_item) da ficha técnica
preço_ideal  = custo_servico × markup_line  (mensalizado pelo contrato_meses)
status_preço = preço_praticado vs preço_ideal (bom / abaixo / acima)
MC%, lucro_projetado, faturamento_%, etc. — fórmulas exatas da planilha
```

Implementação em `src/lib/pricing/engine.ts` com tipos fortes; UI consome via hook `usePricingVersion(id)` (TanStack Query) com `useMemo` para recálculos instantâneos.

## Proposta comercial (PDF)

- Builder em `/sales/pricing/proposals/new`: passo 1 cliente, passo 2 escolha de serviços do Cadastro, passo 3 desconto/condições, passo 4 preview + gerar.
- Template PDF estilizado: capa com logo, dados do cliente, resumo executivo (texto editável), tabela de serviços (qty, valor mensal, valor 12m), totais, condições de pagamento, validade, espaço para assinatura.
- Opcional: campo "Vincular a Oportunidade" → atualiza `opportunities.estimated_value` / `estimated_mrr` quando proposta é enviada.

## Sidebar

Adicionar em `AppSidebar.tsx` no grupo **Sales**, abaixo de "Campanhas de Sales":

```text
Sales
├─ Campanhas de Sales
├─ Precificação Serviços   ← NOVO (icon: Calculator)
├─ Comissões
└─ Gerador de Ofertas
```

Acesso: `adminOnly` para edição de parâmetros; vendedores podem visualizar catálogo e criar propostas (controle via área `canView('pricing')` quando criada).

## Entregas em ordem

1. Migração: tabelas + RLS + GRANTs + seed da versão atual (a partir da planilha enviada).
2. Engine + tipos + hook.
3. UI das 8 abas (editor + cálculos).
4. Edge functions de import/export XLSX.
5. Builder de proposta + edge function PDF.
6. Item de menu + rota + ManagerOnly/AccessControl.

## Pontos em aberto que valem confirmar depois de aprovar este plano

- Identidade visual da proposta: usar logo "Y" atual ou o cliente vai fornecer um SVG?
- Texto padrão do "Resumo executivo" e "Condições de pagamento" — quer que eu proponha um boilerplate em PT-BR ou prefere deixar 100% editável em branco?
- Os números atuais da sua planilha devem virar a **versão "Ativa" v1** já no seed, certo?
