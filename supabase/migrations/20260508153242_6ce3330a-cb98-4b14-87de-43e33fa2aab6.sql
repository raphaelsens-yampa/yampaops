
ALTER TABLE public.chatwoot_audit_settings
  ADD COLUMN IF NOT EXISTS scoring_rubric text,
  ADD COLUMN IF NOT EXISTS tone_categories jsonb NOT NULL DEFAULT '[
    {"key":"palavrao","label":"Palavrão / linguagem chula"},
    {"key":"ironia","label":"Ironia / sarcasmo"},
    {"key":"grosseria","label":"Grosseria / desrespeito"},
    {"key":"impaciencia","label":"Impaciência / falta de empatia"},
    {"key":"outros","label":"Outros desvios de tom"}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS churn_signal_types jsonb NOT NULL DEFAULT '[
    {"key":"irritacao","label":"Irritação explícita"},
    {"key":"ameaca_cancelamento","label":"Ameaça de cancelamento"},
    {"key":"insatisfacao","label":"Insatisfação grave"},
    {"key":"decepcao","label":"Decepção / frustração"},
    {"key":"outros","label":"Outros sinais"}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS playbook_markdown text,
  ADD COLUMN IF NOT EXISTS system_message_patterns text[] NOT NULL DEFAULT ARRAY[
    '^Conversa foi marcada como',
    '^Conversation was marked as',
    '^Envio via app',
    '^Atribuída? a ',
    '^Assigned to ',
    '.{1,80} resolveu a conversa',
    '.{1,80} marcou a conversa como'
  ];

UPDATE public.chatwoot_audit_settings
SET scoring_rubric = COALESCE(scoring_rubric, $rubric$# Rubrica de Análise

## overall_score (0-100)
Média ponderada: tone_score (40%), playbook_score (35%), (100 - churn_risk_score) (25%).

## tone_score (0-100)
- 100 = tom impecável, cordial e empático
- 80 = neutro adequado
- 60 = pequenos deslizes (ex: respostas secas)
- <40 = grosseria, ironia, impaciência ou palavrão

## churn_risk_score (0-100, MAIOR = MAIOR risco)
- 0-20 = cliente satisfeito
- 30-50 = sinais leves de insatisfação
- 60-80 = irritação clara, menção a concorrentes
- 90-100 = ameaça explícita de cancelamento

## playbook_score (0-100)
Percentual de itens do playbook marcados como `passed=true`.

## severity
- "critical": overall_score < {{critical_threshold}} OU flag de tom severity=high OU ameaça de cancelamento.
- "attention": overall_score < {{attention_threshold}} OU qualquer flag relevante (tom medium, churn>=60, item crítico do playbook não cumprido).
- "ok": caso contrário.

NUNCA invente trechos. Se não houver evidência, deixe arrays vazios.$rubric$),
    playbook_markdown = COALESCE(playbook_markdown, $pb$# Playbook de Atendimento

## Abertura
- Saudar o cliente cordialmente identificando-se (nome + empresa).
- Demonstrar disponibilidade ("Em que posso ajudar?").

## Diagnóstico
- Fazer perguntas abertas para entender o problema.
- Confirmar entendimento parafraseando.

## Solução
- Apresentar caminho claro e objetivo.
- Validar se a solução atende.

## Encerramento
- Perguntar se pode ajudar com algo mais.
- Despedir-se de forma cordial.$pb$)
WHERE id IS NOT NULL;
