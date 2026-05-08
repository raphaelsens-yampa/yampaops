// Job de auditoria: analisa conversas resolvidas via Lovable AI.
// Body: { since?: string, before?: string, limit?: number, force?: boolean, conversation_ids?: number[], triggered_by?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN = Deno.env.get("CHATWOOT_API_TOKEN") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

async function fetchTranscript(baseUrl: string, accountId: number, convId: number) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`;
  const res = await fetch(url, { headers: { api_access_token: TOKEN } });
  if (!res.ok) throw new Error(`chatwoot ${res.status}`);
  const j = await res.json();
  const arr: any[] = j?.payload || [];
  const msgs = arr
    .filter((m) => !m.private)
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .map((m) => ({
      role: (m.message_type === 1 || m.message_type === "outgoing") ? "agente" : "cliente",
      content: String(m.content).replace(/\s+/g, " ").trim(),
    }));
  let truncated = msgs;
  if (msgs.length > 80) truncated = [...msgs.slice(0, 20), ...msgs.slice(-60)];
  return { messages: truncated, total: msgs.length };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "register_audit",
    description: "Registra a análise de qualidade do atendimento.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["overall_score", "severity", "tone_score", "tone_flags", "churn_risk_score", "churn_signals", "playbook_score", "playbook_checks", "competitor_mentions", "summary"],
      properties: {
        overall_score: { type: "number", description: "Nota geral de 0 a 100." },
        severity: { type: "string", enum: ["ok", "attention", "critical"] },
        tone_score: { type: "number" },
        tone_flags: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "quote", "severity"],
            properties: {
              category: { type: "string", enum: ["palavrao", "ironia", "grosseria", "impaciencia", "outros"] },
              quote: { type: "string", description: "Trecho literal do atendente." },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
          },
        },
        churn_risk_score: { type: "number" },
        churn_signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "quote"],
            properties: {
              type: { type: "string", enum: ["irritacao", "ameaca_cancelamento", "insatisfacao", "decepcao", "outros"] },
              quote: { type: "string" },
            },
          },
        },
        playbook_score: { type: "number" },
        playbook_checks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "passed"],
            properties: {
              key: { type: "string" },
              passed: { type: "boolean" },
              note: { type: "string" },
            },
          },
        },
        competitor_mentions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "quote"],
            properties: {
              name: { type: "string" },
              quote: { type: "string" },
            },
          },
        },
        summary: { type: "string", description: "Resumo curto em PT-BR (até 2 frases)." },
      },
    },
  },
};

async function analyzeWithAI(model: string, settings: any, transcriptText: string) {
  const playbookList = (settings.playbook_items || [])
    .map((it: any) => `- ${it.key}: ${it.label}`)
    .join("\n");
  const sys = `Você é um auditor sênior de QA para um SAC de fintech brasileira.
Sua tarefa é avaliar a qualidade do atendimento do AGENTE (não do cliente) em três dimensões:
1) Tom de voz (0-100): identifique palavrões, ironia, grosseria, impaciência. Cite trechos LITERAIS.
2) Risco de churn (0-100, MAIOR = MAIOR risco): cliente irritado, ameaça cancelar, insatisfação grave, menção a concorrentes (${(settings.competitor_keywords || []).join(", ")}).
3) Aderência ao playbook (0-100): valide cada item abaixo.

Itens do playbook:
${playbookList}

Palavras consideradas inadequadas: ${(settings.profanity_keywords || []).join(", ")}.

Severity da conversa:
- "critical" se overall_score < ${settings.critical_threshold} OU houver flag de tom severity=high OU ameaça de cancelamento.
- "attention" se overall_score < ${settings.attention_threshold} OU houver qualquer flag relevante.
- "ok" caso contrário.

NUNCA invente trechos. Se não houver evidência, deixe arrays vazios.
${settings.custom_instructions || ""}

Chame a tool register_audit obrigatoriamente.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Transcrição do atendimento:\n\n${transcriptText}` },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "register_audit" } },
    }),
  });
  if (resp.status === 429) throw new Error("RATE_LIMIT");
  if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED");
  if (!resp.ok) throw new Error(`AI ${resp.status}: ${await resp.text()}`);
  const j = await resp.json();
  const call = j?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI sem tool_call");
  return JSON.parse(call.function.arguments);
}

async function analyzeConversation(conv: any, settings: any, baseUrl: string, accountId: number, runId: string | null, force: boolean) {
  const convId = Number(conv.chatwoot_conversation_id);
  const { messages, total } = await fetchTranscript(baseUrl, accountId, convId);
  if (messages.length === 0) return { skipped: true, reason: "no_messages" };

  const transcriptText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const hash = await sha256(transcriptText);

  // Idempotência
  if (!force) {
    const { data: existing } = await service
      .from("chatwoot_conversation_audits")
      .select("id, transcript_hash")
      .eq("conversation_id", convId)
      .maybeSingle();
    if (existing && existing.transcript_hash === hash) return { skipped: true, reason: "unchanged" };
  }

  const result = await analyzeWithAI(settings.ai_model, settings, transcriptText);

  // Resolve assignee_id pelo email
  let assigneeId: number | null = null;
  if (conv.assignee_id) assigneeId = Number(conv.assignee_id);

  await service.from("chatwoot_conversation_audits").upsert({
    conversation_id: convId,
    run_id: runId,
    analyzed_at: new Date().toISOString(),
    model_used: settings.ai_model,
    assignee_id: assigneeId,
    assignee_name: conv.assignee_name || null,
    assignee_email: conv.assignee_email || null,
    team_name: conv.team_name || null,
    inbox_name: conv.inbox_name || null,
    conversation_resolved_at: conv.conversation_closed_at || conv.last_message_at || null,
    message_count: total,
    transcript_hash: hash,
    overall_score: result.overall_score,
    severity: result.severity,
    tone_score: result.tone_score,
    tone_flags: result.tone_flags || [],
    churn_risk_score: result.churn_risk_score,
    churn_signals: result.churn_signals || [],
    playbook_score: result.playbook_score,
    playbook_checks: result.playbook_checks || [],
    competitor_mentions: result.competitor_mentions || [],
    summary: result.summary,
    review_status: "pending",
  }, { onConflict: "conversation_id" });

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOKEN) return new Response(JSON.stringify({ error: "CHATWOOT_API_TOKEN missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const since: string | null = body.since || null;
    const before: string | null = body.before || null;
    const limit = Math.min(Number(body.limit || 100), 500);
    const force: boolean = !!body.force;
    const convIds: number[] = Array.isArray(body.conversation_ids) ? body.conversation_ids.map(Number) : [];
    const triggeredBy = body.triggered_by || "manual";

    const { data: settings } = await service.from("chatwoot_audit_settings").select("*").limit(1).maybeSingle();
    const { data: integ } = await service.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!integ?.chatwoot_base_url || !integ?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseUrl = integ.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(integ.chatwoot_account_id);

    let q = service
      .from("chatwoot_conversations")
      .select("chatwoot_conversation_id, assignee_id, assignee_name, assignee_email, team_name, inbox_name, conversation_closed_at, last_message_at, status")
      .eq("status", "resolved")
      .order("conversation_closed_at", { ascending: false })
      .limit(limit);
    if (convIds.length > 0) q = q.in("chatwoot_conversation_id", convIds);
    else {
      if (since) q = q.gte("conversation_closed_at", since);
      if (before) q = q.lt("conversation_closed_at", before);
    }
    const { data: convs, error } = await q;
    if (error) throw error;
    const conversations = convs || [];

    // Cria run
    const { data: run } = await service.from("chatwoot_audit_runs").insert({
      period_start: since,
      period_end: before,
      total_conversations: conversations.length,
      status: "running",
      triggered_by: triggeredBy,
    }).select("id").maybeSingle();
    const runId = run?.id || null;

    let analyzed = 0;
    let failed = 0;
    let skipped = 0;
    const BATCH = 5;
    for (let i = 0; i < conversations.length; i += BATCH) {
      const slice = conversations.slice(i, i + BATCH);
      const results = await Promise.allSettled(slice.map((c) => analyzeConversation(c, settings, baseUrl, accountId, runId, force)));
      for (const r of results) {
        if (r.status === "fulfilled") {
          if ((r.value as any).skipped) skipped++; else analyzed++;
        } else {
          failed++;
          console.error("audit fail:", r.reason?.message || r.reason);
        }
      }
    }

    await service.from("chatwoot_audit_runs").update({
      finished_at: new Date().toISOString(),
      analyzed,
      failed,
      status: failed > 0 && analyzed === 0 ? "error" : "done",
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, total: conversations.length, analyzed, skipped, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("audit-run error", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
