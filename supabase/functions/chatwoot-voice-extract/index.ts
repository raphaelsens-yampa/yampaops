// Voz do Cliente: extrai temas/dores APENAS das mensagens recebidas dos clientes.
// Body: { since?: "YYYY-MM-DD", until?: "YYYY-MM-DD", limit?: number, force?: boolean, kind?: "cron"|"manual", triggered_by?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const MODEL = "openai/gpt-5.6-sol";
const LOCK_MINUTES = 10;
const BATCH = 4;
const MAX_CONVERSATIONS_PER_RUN = 400;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function spDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "register_themes",
    description: "Registra os temas e dores identificados nas falas do cliente.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["themes", "main_pain", "sentiment", "urgency", "summary", "keywords"],
      properties: {
        themes: {
          type: "array",
          description: "1 a 3 temas, do mais relevante para o menos relevante.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["theme", "pain", "quote"],
            properties: {
              theme: { type: "string", description: "Rótulo curto em português (2 a 4 palavras)." },
              pain: { type: "string", description: "A dor/necessidade concreta do cliente." },
              quote: { type: "string", description: "Trecho LITERAL da fala do cliente." },
            },
          },
        },
        main_pain: { type: "string" },
        sentiment: { type: "string", enum: ["positivo", "neutro", "negativo"] },
        urgency: { type: "string", enum: ["baixa", "media", "alta"] },
        summary: { type: "string", description: "Uma frase resumindo o que o cliente trouxe." },
        keywords: { type: "array", items: { type: "string" } },
      },
    },
  },
};

async function analyze(clientText: string, auditContext: string) {
  const sys = `Você analisa a VOZ DO CLIENTE de uma fintech brasileira.
Você recebe SOMENTE as mensagens enviadas pelo CLIENTE (nunca as do atendente).
Sua tarefa: identificar os temas conversados e as dores trazidas pelo cliente.

Regras:
- Rótulos de tema curtos, em português, reutilizáveis entre conversas (ex.: "cobrança duplicada", "erro ao emitir nota", "dúvida sobre plano").
- Nunca invente falas: os trechos citados devem ser literais.
- Se a conversa for apenas saudação/sem conteúdo, use o tema "sem assunto identificado".
${auditContext ? `\nContexto da auditoria de qualidade (apoio, não é fala do cliente):\n${auditContext}` : ""}

Chame a tool register_themes obrigatoriamente.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Mensagens do cliente:\n\n${clientText}` },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "register_themes" } },
    }),
  });
  if (resp.status === 429) throw new Error("RATE_LIMIT");
  if (resp.status === 402) throw new Error("CREDITS_EXHAUSTED");
  if (resp.status === 403) throw new Error("AI_BLOCKED");
  if (!resp.ok) throw new Error(`AI ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const call = j?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI sem tool_call");
  return JSON.parse(call.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const body = await req.json().catch(() => ({}));
    const kind: string = body.kind === "cron" ? "cron" : "manual";
    const force: boolean = !!body.force;
    const nowIso = new Date().toISOString();

    // 1) Guard de estado pausado (crédito/bloqueio da IA)
    const { data: paused } = await service
      .from("chatwoot_voice_runs")
      .select("id, paused_reason, started_at")
      .eq("status", "paused")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const probeOnly = !!paused && kind === "cron";
    if (paused && kind === "manual" && !body.resume) {
      return json({ ok: false, paused: true, reason: paused.paused_reason, run_id: paused.id }, 409);
    }

    // 2) Trava de execução única
    const { data: running } = await service
      .from("chatwoot_voice_runs")
      .select("id, lock_expires_at")
      .eq("status", "running")
      .gt("lock_expires_at", nowIso)
      .limit(1)
      .maybeSingle();
    if (running) return json({ ok: false, busy: true, run_id: running.id }, 409);

    // 3) Período (fuso São Paulo). Padrão do cron: dia anterior.
    const todaySp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const yesterday = new Date(new Date(`${todaySp}T12:00:00Z`).getTime() - 86400_000);
    const ySp = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(yesterday);
    const since: string = body.since || ySp;
    const until: string = body.until || (body.since ? todaySp : ySp);

    const hardLimit = probeOnly ? 1 : Math.min(Number(body.limit || MAX_CONVERSATIONS_PER_RUN), MAX_CONVERSATIONS_PER_RUN);

    // 4) Conversas com mensagens de cliente no período
    const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
    const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();

    const msgs: any[] = [];
    for (let page = 0; page < 60; page++) {
      const { data, error } = await service
        .from("chatwoot_messages")
        .select("chatwoot_conversation_id, content_preview, message_created_at, inbox_name")
        .eq("sender_type", "client")
        .eq("is_private", false)
        .gte("message_created_at", sinceIso)
        .lte("message_created_at", untilIso)
        .order("message_created_at", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      msgs.push(...(data || []));
      if ((data || []).length < 1000) break;
    }

    const byConv = new Map<number, any[]>();
    for (const m of msgs) {
      const c = Number(m.chatwoot_conversation_id);
      if (!c) continue;
      const txt = String(m.content_preview || "").trim();
      if (!txt) continue;
      if (!byConv.has(c)) byConv.set(c, []);
      byConv.get(c)!.push(m);
    }
    let convIds = Array.from(byConv.keys());

    // 5) Idempotência: pula conversas já processadas com mesmo conteúdo
    const existing = new Map<number, string | null>();
    if (!force && convIds.length > 0) {
      for (let i = 0; i < convIds.length; i += 500) {
        const { data } = await service
          .from("chatwoot_conversation_themes")
          .select("conversation_id, content_hash")
          .in("conversation_id", convIds.slice(i, i + 500));
        for (const r of data || []) existing.set(Number(r.conversation_id), r.content_hash);
      }
    }

    const tasks: { convId: number; text: string; hash: string; rows: any[] }[] = [];
    for (const convId of convIds) {
      const rows = byConv.get(convId)!;
      const text = rows.map((r) => String(r.content_preview).replace(/\s+/g, " ").trim()).join("\n");
      const hash = await sha256(text);
      if (!force && existing.get(convId) === hash) continue;
      tasks.push({ convId, text, hash, rows });
      if (tasks.length >= hardLimit) break;
    }

    // 6) Cria a execução
    const { data: run } = await service.from("chatwoot_voice_runs").insert({
      kind,
      period_start: since,
      period_end: until,
      status: tasks.length === 0 ? "done" : "running",
      total_conversations: tasks.length,
      triggered_by: body.triggered_by || kind,
      lock_expires_at: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString(),
      finished_at: tasks.length === 0 ? new Date().toISOString() : null,
      message: probeOnly ? "Execução de sondagem (job pausado)" : null,
    }).select("id").maybeSingle();
    const runId = run?.id || null;

    if (tasks.length === 0) {
      return json({ ok: true, run_id: runId, total: 0, status: "done", nothing_to_do: true });
    }

    // Contexto de auditoria (apoio) e metadados da conversa
    const convMeta = new Map<number, any>();
    for (let i = 0; i < tasks.length; i += 300) {
      const ids = tasks.slice(i, i + 300).map((t) => t.convId);
      const { data: audits } = await service
        .from("chatwoot_conversation_audits")
        .select("conversation_id, summary, severity, churn_signals, assignee_name, assignee_email, inbox_name")
        .in("conversation_id", ids);
      for (const a of audits || []) convMeta.set(Number(a.conversation_id), a);
    }

    const processAll = async () => {
      let processed = 0, failed = 0, rateLimitHits = 0;
      let pausedReason: string | null = null;

      for (let i = 0; i < tasks.length; i += BATCH) {
        // cancelamento / renovação da trava
        const { data: state } = await service
          .from("chatwoot_voice_runs").select("cancel_requested").eq("id", runId).maybeSingle();
        if (state?.cancel_requested) {
          await service.from("chatwoot_voice_runs").update({
            status: "canceled", processed, failed, finished_at: new Date().toISOString(),
          }).eq("id", runId);
          return;
        }
        await service.from("chatwoot_voice_runs").update({
          lock_expires_at: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString(),
        }).eq("id", runId);

        const slice = tasks.slice(i, i + BATCH);
        const results = await Promise.allSettled(slice.map(async (t) => {
          const meta = convMeta.get(t.convId);
          const auditContext = meta
            ? [
                meta.summary ? `resumo: ${meta.summary}` : "",
                meta.severity ? `severidade: ${meta.severity}` : "",
                Array.isArray(meta.churn_signals) && meta.churn_signals.length
                  ? `sinais de churn: ${meta.churn_signals.map((c: any) => c.type).join(", ")}` : "",
              ].filter(Boolean).join("\n")
            : "";

          const r = await analyze(t.text, auditContext);
          const themes = Array.isArray(r.themes) ? r.themes.slice(0, 3) : [];
          const primary = themes[0]?.theme ? String(themes[0].theme).toLowerCase().trim() : null;
          const lastAt = t.rows[t.rows.length - 1]?.message_created_at || null;

          await service.from("chatwoot_conversation_themes").upsert({
            conversation_id: t.convId,
            run_id: runId,
            analyzed_at: new Date().toISOString(),
            model_used: MODEL,
            content_hash: t.hash,
            client_message_count: t.rows.length,
            day_sp: spDate(lastAt),
            inbox_name: t.rows[0]?.inbox_name || meta?.inbox_name || null,
            assignee_name: meta?.assignee_name || null,
            assignee_email: meta?.assignee_email || null,
            themes,
            primary_theme: primary,
            primary_theme_canonical: primary,
            main_pain: r.main_pain || null,
            sentiment: r.sentiment || null,
            urgency: r.urgency || null,
            summary: r.summary || null,
            keywords: Array.isArray(r.keywords) ? r.keywords.slice(0, 12).map(String) : [],
          }, { onConflict: "conversation_id" });
        }));

        for (const res of results) {
          if (res.status === "fulfilled") processed++;
          else {
            const msg = String((res.reason as any)?.message || res.reason);
            if (msg === "CREDITS_EXHAUSTED") pausedReason = "Créditos de IA esgotados";
            else if (msg === "AI_BLOCKED") pausedReason = "IA bloqueada pela política do workspace";
            else if (msg === "RATE_LIMIT") rateLimitHits++;
            failed++;
            console.error("voice-extract fail:", msg);
          }
        }

        await service.from("chatwoot_voice_runs").update({ processed, failed }).eq("id", runId);

        if (pausedReason) {
          await service.from("chatwoot_voice_runs").update({
            status: "paused", paused_reason: pausedReason, processed, failed,
            finished_at: new Date().toISOString(),
          }).eq("id", runId);
          return;
        }
        if (rateLimitHits >= 6) {
          await service.from("chatwoot_voice_runs").update({
            status: "error", message: "Limite de requisições da IA atingido; retoma na próxima execução.",
            processed, failed, finished_at: new Date().toISOString(),
          }).eq("id", runId);
          return;
        }
        if (rateLimitHits > 0) await new Promise((r) => setTimeout(r, 4000));
      }

      // probe bem-sucedido: limpa pausa anterior
      if (probeOnly && processed > 0 && paused) {
        await service.from("chatwoot_voice_runs")
          .update({ status: "error", message: "Pausa liberada por sondagem bem-sucedida." })
          .eq("id", paused.id);
      }

      await service.from("chatwoot_voice_runs").update({
        status: failed > 0 && processed === 0 ? "error" : "done",
        processed, failed, finished_at: new Date().toISOString(),
      }).eq("id", runId);
    };

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processAll());
    } else {
      processAll();
    }

    return json({ ok: true, run_id: runId, total: tasks.length, status: "queued", probe: probeOnly }, 202);
  } catch (e: any) {
    console.error("voice-extract error", e);
    return json({ error: e.message }, 500);
  }
});
