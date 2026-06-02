## Objetivo
Hoje na aba Evolução já existem dois mecanismos:
- Checkbox individual por linha (IA / Humano).
- Ações em massa aplicadas ao **filtro atual** (só aparecem quando o filtro IA/Humano é diferente de "Todos").

O que falta — e é o que o usuário está pedindo — é poder **selecionar contatos específicos** (não a página inteira nem o filtro inteiro) e marcar/desmarcar IA ou Humano nesse lote escolhido manualmente.

## O que será entregue (apenas na aba Evolução de `SalesCampaignDetail.tsx`)

### 1. Seleção por linha
- Nova coluna à esquerda da tabela com um `Checkbox` por linha.
- Checkbox no `TableHead` para **selecionar/deselecionar a página atual** (estado indeterminate quando seleção é parcial).
- Estado `selectedIds: Set<string>` mantido na página; preservado entre mudanças de página até o usuário limpar.

### 2. Barra de ações da seleção
- Aparece fixa acima da tabela quando `selectedIds.size > 0`, no mesmo estilo da barra de ações em massa atual.
- Mostra: `N selecionados` + botão "Limpar seleção".
- Botões:
  - "Marcar IA" / "Desmarcar IA"
  - "Marcar Humano" / "Desmarcar Humano"
- Ao clicar: `update` no Supabase com `.in("id", [...selectedIds])` no `sales_campaign_contacts`, setando `handled_by_ia` ou `handled_by_human` (e `ia_source = 'manual'` quando marca IA pela primeira vez, mesma regra do `toggleHandled` já existente).
- Após sucesso: toast com a quantidade afetada, invalida a query e mantém a seleção (útil para aplicar a outra flag em seguida); botão "Limpar seleção" desfaz.

### 3. Ações em massa existentes
- Mantidas como estão (aplicar ao filtro inteiro). Apenas reposicionadas para conviver com a nova barra de seleção, deixando claro a diferença:
  - Barra superior (quando há seleção): "Aplicar aos **N selecionados**".
  - Barra inferior (quando filtro ≠ all e sem seleção): "Aplicar a **todo o filtro atual**".

### 4. Detalhes técnicos
- Reaproveitar `toggleHandled` para o caso 1 contato; novo helper `bulkApplyToSelection(field, value)` para múltiplos IDs.
- Atualização otimista opcional; mais simples: aguardar resposta e invalidar `["sales-campaign-base", ...]` no React Query.
- Nenhuma mudança de schema, RLS ou edge function.
- Nenhuma mudança em outras abas/páginas.

## Fora de escopo
- Seleção "todos os X que batem com o filtro" (já coberto pela barra de filtro). Esta entrega cuida apenas da seleção manual.
- Mudanças na aba Visão Geral, métricas ou Stripe/Chatwoot.
