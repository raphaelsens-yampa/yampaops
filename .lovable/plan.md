## Objetivo
Mudar a filosofia do módulo: **IA audita 100% das conversas resolvidas**, gera relatório agregado completo, e o humano usa amostragem inteligente apenas para revisar/refinar.

## Mudanças

### 1. Edge function `chatwoot-audit-run` — auditar tudo
- Remover o filtro de amostragem do loop de execução. Toda conversa elegível (resolvida no período, com mensagens, não auditada ainda no mesmo `transcript_hash`) é analisada.
- Manter deduplicação por `transcript_hash` para não reanalisar conversas inalteradas.
- Adicionar processamento em lotes (batches de 10–20 paralelos) e retomada automática se o tempo da função se aproximar do limite — grava progresso em `chatwoot_audit_runs` e reagenda a si mesma com cursor.
- Manter `ai_model` configurável; sugerir default `gemini-2.5-flash-lite` para volume alto + opção "modelo premium para reauditoria" nos casos críticos.

### 2. Settings — repropósito da aba "Amostragem"
A aba passa a chamar **"Amostragem para revisão humana"** e os campos passam a controlar **a fila de revisão** (não mais o que a IA audita):
- `human_review_percent_per_seller` (% das auditorias da IA que entram na fila por vendedor)
- `human_review_new_seller_percent` (boost para vendedores novos)
- `must_review_critical` (toda crítica vai pra fila)
- `must_review_lost` (toda oportunidade perdida vai pra fila)
- `must_review_sla_breach` (toda quebra de SLA vai pra fila)
- `must_review_low_confidence` (novo: auditorias com baixa confiança da IA — ver item 4)

Migração renomeia/adiciona colunas em `chatwoot_audit_settings` mantendo as antigas como deprecated (default false em `sampling_enabled`).

### 3. Fila de revisão (`/atendimentos/auditoria/revisao`)
- Hoje lista todas as auditorias pendentes. Passa a aplicar as regras de amostragem humana acima ao montar a fila ("A revisar" vs "Todas").
- Nova aba "Todas as auditorias" para o admin acessar qualquer uma fora da amostra.
- Indicador no topo: "X de Y auditorias da IA selecionadas para revisão humana (Z%)".

### 4. Confiança da IA (novo campo)
- Migração adiciona `ai_confidence numeric` em `chatwoot_conversation_audits` (0–100).
- Tool schema da IA passa a retornar `confidence` por auditoria (modelo se autoavalia).
- Auditorias com `confidence < 60` entram automaticamente na fila humana.

### 5. Relatório de 100% — nova aba "Cobertura" no dashboard
Card no `/atendimentos/auditoria` mostrando:
- Total de conversas resolvidas no período
- Total auditadas pela IA (deve ser ~100%)
- % cobertura, com quebra por inbox e vendedor
- Lista das não auditadas (com motivo: sem mensagens / hash duplicado / erro)
- Botão "Reauditar não cobertas"

### 6. Insights (`/atendimentos/auditoria/insights`)
- Como agora temos 100% das conversas, os agregados ficam estatisticamente representativos.
- Adicionar nota "Baseado em 100% das conversas (N=...)" em cada gráfico.
- Adicionar gráfico "Distribuição de severity por vendedor" (boxplot/violin substituindo a média atual onde fizer sentido).

### 7. Custo e performance
- Aviso na aba Amostragem: "IA auditará 100% das conversas. Volume estimado: X conversas/mês × custo por análise."
- Mostrar contador estimado baseado nos últimos 30 dias.
- Permitir cap diário opcional (`daily_audit_cap int`) como salvaguarda — se atingido, próximas conversas ficam em fila para o dia seguinte.

## Ordem de execução

1. Migração: `ai_confidence`, novos campos `human_review_*`, `daily_audit_cap`.
2. Edge function `chatwoot-audit-run`: remover filtro de amostragem, adicionar batching + retomada + cap diário + retorno de confidence no schema.
3. Settings UI: renomear aba e campos.
4. Review UI: aplicar amostragem humana + aba "Todas".
5. Dashboard: card de cobertura.
6. Insights: legendas N=100%.

## Fora de escopo
- Reauditar histórico antigo (manual via botão "Reauditar não cobertas").
- Mudança de modelo automática por severidade (fica como ideia futura).
