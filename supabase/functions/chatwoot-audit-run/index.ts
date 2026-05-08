// Job de auditoria: analisa conversas resolvidas via Lovable AI.
// Body: { since?, before?, limit?, force?, conversation_ids?, triggered_by?, sampling?: boolean }
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

function isSystemMessage(m: any, patterns: RegExp[]): boolean {
  if (m.message_type === 2 || m.message_type === "activity") return true;
  if (m.content_type === "activity" || m.content_type === "input_csat") return true;
  const ca = m.content_attributes;
  if (ca && (ca.type === "activity" || ca.is_system === true)) return true;
  const c = String(m.content || "");
  for (const re of patterns) {
    if (re.test(c)) return true;
  }
  return false;
}

async function fetchTranscript(baseUrl: string, accountId: number, convId: number, systemPatterns: string[]) {
  const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${convId}/messages`;
  const res = await fetch(url, { headers: { api_access_token: TOKEN } });
  if (!res.ok) throw new Error(`chatwoot ${res.status}`);
  const j = await res.json();
  const arr: any[] = j?.payload || [];
  const compiled = (systemPatterns || []).map((p) => {
    try { return new RegExp(p, "i"); } catch { return null; }
  }).filter(Boolean) as RegExp[];

  const msgs = arr
    .filter((m) => !m.private)
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .filter((m) => !isSystemMessage(m, compiled))
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
      required: [
        "overall_score", "severity", "tone_score", "tone_flags",
        "churn_risk_score", "churn_signals", "playbook_score", "playbook_checks",
        "competitor_mentions", "summary",
        "sla_compliance", "sentiment_arc", "missed_opportunities",
        "compliance_flags", "technical_accuracy", "confidence",
      ],
      properties: {
        overall_score: { type: "number" },
        severity: { type: "string", enum: ["ok", "attention", "critical"] },
        confidence: { type: "number", description: "Sua confiança (0-100) na avaliação geral. Baixe quando a transcrição for ambígua, curta demais ou contiver pouco contexto." },
        tone_score: { type: "number" },
        tone_flags: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["category", "quote", "severity"],
            properties: {
              category: { type: "string" },
              quote: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
          },
        },
        churn_risk_score: { type: "number" },
        churn_signals: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["type", "quote"],
            properties: { type: { type: "string" }, quote: { type: "string" } },
          },
        },
        playbook_score: { type: "number" },
        playbook_checks: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["key", "passed"],
            properties: { key: { type: "string" }, passed: { type: "boolean" }, note: { type: "string" } },
          },
        },
        competitor_mentions: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["name", "quote"],
            properties: { name: { type: "string" }, quote: { type: "string" } },
          },
        },
        summary: { type: "string" },
        sla_compliance: {
          type: "object", additionalProperties: false,
          required: ["was_acceptable", "reasoning"],
          properties: {
            was_acceptable: { type: "boolean" },
            reasoning: { type: "string" },
          },
        },
        sentiment_arc: {
          type: "object", additionalProperties: false,
          required: ["start", "end", "trajectory"],
          properties: {
            start: { type: "string", enum: ["positive", "neutral", "negative"] },
            end: { type: "string", enum: ["positive", "neutral", "negative"] },
            trajectory: { type: "string", enum: ["improved", "stable", "deteriorated"] },
          },
        },
        missed_opportunities: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["moment", "what_client_wanted", "what_seller_did"],
            properties: {
              moment: { type: "string" },
              what_client_wanted: { type: "string" },
              what_seller_did: { type: "string" },
            },
          },
        },
        compliance_flags: {
          type: "array",
          items: {
            type: "object", additionalProperties: false,
            required: ["type", "severity", "excerpt"],
            properties: {
              type: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              excerpt: { type: "string" },
            },
          },
        },
        technical_accuracy: {
          type: "object", additionalProperties: false,
          required: ["accuracy_score", "issues"],
          properties: {
            accuracy_score: { type: "number" },
            issues: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                required: ["type", "excerpt"],
                properties: { type: { type: "string" }, excerpt: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

function renderRubric(rubric: string, settings: any): string {
  if (!rubric) return "";
  return rubric
    .replaceAll("{{critical_threshold}}", String(settings.critical_threshold))
    .replaceAll("{{attention_threshold}}", String(settings.attention_threshold));
}

async function analyzeWithAI(model: string, settings: any, transcriptText: string, slaSeconds: number | null) {
  const playbookList = (settings.playbook_items || []).map((it: any) => `- ${it.key}: ${it.label}`).join("\n");
  const toneCats = (settings.tone_categories || []).map((c: any) => `${c.key} (${c.label})`).join(", ");
  const churnTypes = (settings.churn_signal_types || []).map((c: any) => `${c.key} (${c.label})`).join(", ");
  const rubric = renderRubric(settings.scoring_rubric || "", settings);

  const sys = `Você é um auditor sênior de QA para um SAC de fintech brasileira.
Avalie a qualidade do atendimento do AGENTE em múltiplas dimensões.

# Categorias permitidas
- tone_flags.category: ${toneCats}
- churn_signals.type: ${churnTypes}

# Palavras inadequadas
${(settings.profanity_keywords || []).join(", ")}

# Concorrentes monitorados
${(settings.competitor_keywords || []).join(", ")}

# Itens do playbook (use exatamente estas chaves)
${playbookList}

# Playbook completo
${settings.playbook_markdown || "(não informado)"}

# Rubrica de scoring e severity
${rubric}

# Base de conhecimento do produto (use para julgar precisão técnica)
${settings.product_knowledge_base || "(não informada)"}

# Dimensões adicionais que você DEVE preencher:
- sla_compliance: avalie se o tempo de primeira resposta foi aceitável. ${slaSeconds != null ? `Tempo de primeira resposta nesta conversa: ${slaSeconds}s. SLA configurado: ${settings.sla_breach_seconds || 1800}s.` : "Tempo de primeira resposta não disponível."}
- sentiment_arc: sentimento do cliente no início, no fim, e a trajetória.
- missed_opportunities: momentos onde o cliente sinalizou interesse/dúvida e o atendente não aproveitou.
- compliance_flags: promessas sem amparo, dados sensíveis vazados, juros indevidos, falta de transparência.
- technical_accuracy: nota 0-100 + issues onde o atendente disse algo factualmente incorreto sobre o produto.

NUNCA invente trechos. Cite trechos LITERAIS. Arrays vazios quando não houver evidência.
${settings.custom_instructions || ""}

Chame a tool register_audit obrigatoriamente.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
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

// Garante uma versão atual da rubrica e devolve seu id
async function ensureRubricVersion(settings: any): Promise<string | null> {
  const fingerprint = await sha256(JSON.stringify({
    s: settings.scoring_rubric, p: settings.playbook_markdown,
    pi: settings.playbook_items, tc: settings.tone_categories,
    cs: settings.churn_signal_types, ai: settings.ai_model,
    ci: settings.custom_instructions, kb: settings.product_knowledge_base,
  }));
  const { data: existing } = await service
    .from("chatwoot_audit_rubric_versions")
    .select("id, version_label")
    .eq("version_label", `auto-${fingerprint.slice(0, 12)}`)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data: created } = await service.from("chatwoot_audit_rubric_versions").insert({
    version_label: `auto-${fingerprint.slice(0, 12)}`,
    scoring_rubric: settings.scoring_rubric,
    playbook_markdown: settings.playbook_markdown,
    playbook_items: settings.playbook_items || [],
    tone_categories: settings.tone_categories || [],
    churn_signal_types: settings.churn_signal_types || [],
    custom_instructions: settings.custom_instructions,
    ai_model: settings.ai_model,
    notes: "Snapshot automático ao rodar auditoria",
  }).select("id").maybeSingle();
  return created?.id || null;
}

async function analyzeConversation(conv: any, settings: any, baseUrl: string, accountId: number, runId: string | null, force: boolean, rubricVersionId: string | null) {
  const convId = Number(conv.chatwoot_conversation_id);
  const { messages, total } = await fetchTranscript(baseUrl, accountId, convId, settings.system_message_patterns || []);
  if (messages.length === 0) return { skipped: true, reason: "no_messages" };

  const transcriptText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const hash = await sha256(transcriptText);

  if (!force) {
    const { data: existing } = await service
      .from("chatwoot_conversation_audits")
      .select("id, transcript_hash, rubric_version_id")
      .eq("conversation_id", convId)
      .maybeSingle();
    if (existing && existing.transcript_hash === hash && existing.rubric_version_id === rubricVersionId) {
      return { skipped: true, reason: "unchanged" };
    }
  }

  const slaSeconds = conv.tm1r_seconds != null ? Number(conv.tm1r_seconds) : null;
  const result = await analyzeWithAI(settings.ai_model, settings, transcriptText, slaSeconds);

  let assigneeId: number | null = null;
  if (conv.assignee_id) assigneeId = Number(conv.assignee_id);

  // Enrich sla_compliance with raw seconds
  const slaPayload = {
    ...(result.sla_compliance || {}),
    tm1r_seconds: slaSeconds,
    sla_threshold_seconds: settings.sla_breach_seconds || 1800,
  };

  await service.from("chatwoot_conversation_audits").upsert({
    conversation_id: convId,
    run_id: runId,
    rubric_version_id: rubricVersionId,
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
    ai_confidence: typeof result.confidence === "number" ? result.confidence : null,
    sla_compliance: slaPayload,
    sentiment_arc: result.sentiment_arc || {},
    missed_opportunities: result.missed_opportunities || [],
    compliance_flags: result.compliance_flags || [],
    technical_accuracy: result.technical_accuracy || {},
  }, { onConflict: "conversation_id" });

  return { ok: true };
}

// Aplica amostragem estratificada
function applySampling(conversations: any[], settings: any): any[] {
  if (!settings?.sampling_enabled) return conversations;
  const slaThreshold = Number(settings.sla_breach_seconds || 1800);
  const pct = Math.max(0, Math.min(100, Number(settings.sampling_percent_per_seller || 10)));

  const must: any[] = [];
  const optional: Map<string, any[]> = new Map();

  for (const c of conversations) {
    const isLost = settings.must_audit_lost && (c.status === "resolved" && (c.labels || []).some?.((l: string) => /perdid|lost|churn/i.test(l)));
    const isSlaBreach = settings.must_audit_sla_breach && c.tm1r_seconds != null && c.tm1r_seconds > slaThreshold;
    if (isLost || isSlaBreach) {
      must.push(c);
      continue;
    }
    const key = String(c.assignee_id || c.assignee_email || "no_assignee");
    if (!optional.has(key)) optional.set(key, []);
    optional.get(key)!.push(c);
  }

  const sampled: any[] = [...must];
  for (const [, list] of optional) {
    const n = Math.max(1, Math.ceil((list.length * pct) / 100));
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, n));
  }
  return sampled;
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
    const useSampling: boolean = body.sampling !== false; // default true se settings.sampling_enabled

    const { data: settings } = await service.from("chatwoot_audit_settings").select("*").limit(1).maybeSingle();
    const { data: integ } = await service.from("integration_settings").select("chatwoot_base_url, chatwoot_account_id").maybeSingle();
    if (!integ?.chatwoot_base_url || !integ?.chatwoot_account_id) {
      return new Response(JSON.stringify({ error: "chatwoot not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const baseUrl = integ.chatwoot_base_url.replace(/\/$/, "");
    const accountId = Number(integ.chatwoot_account_id);

    let q = service
      .from("chatwoot_conversations")
      .select("chatwoot_conversation_id, assignee_id, assignee_name, assignee_email, team_name, inbox_name, conversation_closed_at, last_message_at, status, labels, tm1r_seconds")
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
    let conversations = convs || [];
    if (useSampling && convIds.length === 0) {
      conversations = applySampling(conversations, settings);
    }

    const rubricVersionId = await ensureRubricVersion(settings);

    const { data: run } = await service.from("chatwoot_audit_runs").insert({
      period_start: since,
      period_end: before,
      total_conversations: conversations.length,
      status: "running",
      triggered_by: triggeredBy,
    }).select("id").maybeSingle();
    const runId = run?.id || null;

    const processAll = async () => {
      let analyzed = 0;
      let failed = 0;
      let skipped = 0;
      const BATCH = 5;
      try {
        for (let i = 0; i < conversations.length; i += BATCH) {
          const slice = conversations.slice(i, i + BATCH);
          const results = await Promise.allSettled(slice.map((c) => analyzeConversation(c, settings, baseUrl, accountId, runId, force, rubricVersionId)));
          for (const r of results) {
            if (r.status === "fulfilled") {
              if ((r.value as any).skipped) skipped++; else analyzed++;
            } else {
              failed++;
              console.error("audit fail:", r.reason?.message || r.reason);
            }
          }
          await service.from("chatwoot_audit_runs").update({ analyzed, failed }).eq("id", runId);
        }
        await service.from("chatwoot_audit_runs").update({
          finished_at: new Date().toISOString(),
          analyzed, failed,
          status: failed > 0 && analyzed === 0 ? "error" : "done",
        }).eq("id", runId);
      } catch (e: any) {
        console.error("audit-run background error", e);
        await service.from("chatwoot_audit_runs").update({
          finished_at: new Date().toISOString(),
          analyzed, failed, status: "error",
        }).eq("id", runId);
      }
    };

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processAll());
    } else {
      processAll();
    }

    return new Response(JSON.stringify({ ok: true, run_id: runId, total: conversations.length, status: "queued" }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("audit-run error", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
