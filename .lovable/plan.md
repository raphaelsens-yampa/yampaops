# Pivot da Precificação — foco no time Comercial

A página deixa de ser uma "réplica da planilha" e passa a ser uma **ferramenta de montagem e envio de propostas**, escondendo a parte operacional/contábil.

## Nova estrutura de abas

```
[ Visão Geral ] [ Nova Proposta ] [ Propostas ] [ Catálogo ] [ Markup ] [ Insumos & Subprodutos ] [ Versões ]
```

- **Escondidas do front:** Custos Fixos, Mão de Obra, Capacidade, Cenário de Receita, Cenários de Capacidade.
  - Continuam existindo no `snapshot` (engine usa para calcular CPM e markup), apenas sem UI. Importação via XLSX continua alimentando esses campos.
- **Catálogo** = renomeação de "Serviços" (linguagem comercial).
- **Nova Proposta** vira aba dedicada (hoje está dentro de "Propostas" como dialog).

## Nova Visão Geral (focada em vendas)

Substitui os cards atuais (despesa fixa, mão de obra, CPM, contagem) por um painel orientado a vender:

1. **Cards de topo:**
   - Versão ativa + data
   - Nº de produtos/serviços no catálogo
   - Propostas no mês (total / aceitas / valor)
   - Ticket médio das últimas propostas

2. **Catálogo rápido:**
   - Tabela enxuta com Nome, Linha (Premium/Gold/Prata), Prazo, Preço sugerido (ideal), Preço praticado, status (badge).
   - Botão "Adicionar à proposta" por linha → abre o builder com o item já incluído.

3. **Últimas propostas:** lista das 5 mais recentes com cliente, valor, status e link para abrir/baixar PDF.

4. **Atenção comercial:** apenas serviços com `status = prejuizo` (sem expor lógica de markup interna — texto tipo "preço abaixo do custo, revisar antes de propor").

## Nova Proposta (aba dedicada, multi-passos numa única tela)

Layout em duas colunas:

**Esquerda — Builder:**
- Dados do cliente (nome, doc, email, telefone) + oportunidade vinculada (opcional)
- Catálogo selecionável: busca por nome, filtros por linha e prazo, botão "+" para adicionar
- Itens adicionados: editar **quantidade**, **preço praticado** (override por item, com aviso visual se ficar abaixo do ideal), **prazo**, **observação**
- Desconto global (% ou R$), validade, condições de pagamento, resumo executivo

**Direita — Pré-visualização ao vivo:**
- Totais (mensal e total contrato), economia do desconto, MRR estimado
- Por item: subtotal, indicador "ok / abaixo do ideal / prejuízo" (sem expor markup cru)
- Botões: **Salvar rascunho**, **Gerar PDF**, **Enviar ao cliente** (mantém função `pricing-proposal-pdf` existente)

## Propostas (lista)

Tabela com filtros (status, cliente, período), ações: ver, duplicar, baixar PDF, marcar aceita/recusada. Sem mudanças no schema da tabela `pricing_proposals`.

## Markup / Insumos & Subprodutos / Versões

Mantidos como estão hoje (apenas para `canEditPricing`). Markup volta a usar `fixed_expense_pct` manual (a UI de "auto" depende do card de Receita que estamos removendo — fica como valor estático editável, fiel ao que vem da planilha importada).

## Permissões

- `canEditPricing` → vê tudo (Markup, Insumos, Catálogo edição, Versões).
- Vendedor (sem edit) → vê **Visão Geral**, **Nova Proposta**, **Propostas**, **Catálogo** (somente leitura).

---

## Detalhes técnicos

**Arquivos a alterar:**
- `src/pages/Pricing.tsx` — remover abas Custos Fixos / Mão de Obra / Capacidade, adicionar "Nova Proposta" e "Catálogo", ajustar permissões.
- `src/components/pricing/PricingOverview.tsx` — reescrever do zero com os 4 blocos acima. Remover `RevenueScenarioCard`.
- `src/components/pricing/MarkupEditor.tsx` — voltar `fixed_expense_pct` a campo simples editável (remover dependência de `revenue.auto_fixed_expense`).
- `src/components/pricing/ProposalsManager.tsx` — split em dois: `ProposalBuilder.tsx` (aba Nova Proposta, layout 2 colunas, com override de preço por item) e `ProposalsList.tsx` (lista). Reaproveita queries e mutations atuais.
- `src/components/pricing/ServicesEditor.tsx` — reusado como "Catálogo" com flag `readOnly` para vendedores.

**Arquivos a remover do fluxo (mantém o arquivo, só desplugar):**
- `RevenueScenarioCard.tsx`, `CapacityScenarios.tsx`, `CapacityEditor.tsx`, `CostListEditor.tsx` — não importados na page, mas mantidos no repo caso queiramos rehabilitar.

**Engine (`src/lib/pricing/engine.ts`):** sem mudança estrutural. `RevenueScenario` continua opcional no snapshot — engine só usa se `auto_fixed_expense=true`, então fica inerte sem UI.

**Schema do banco:** nenhuma migração. `pricing_proposals` já suporta itens, desconto, validade, termos.

---

## Pontos a confirmar

1. **Override de preço na proposta:** vendedor pode digitar preço diferente do "praticado" do catálogo? (proposto: sim, com aviso visual se < ideal e bloqueio se < custo).
2. **Catálogo somente leitura para vendedor:** ok ou vendedor também pode marcar/desmarcar serviços como "ativos para venda"?
3. **"Atenção comercial" na Visão Geral:** mostro só `status=prejuizo` ou também `abaixo_ideal`?
