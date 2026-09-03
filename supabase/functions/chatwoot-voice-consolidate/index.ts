// Consolida rótulos de tema parecidos num catálogo canônico e reescreve primary_theme_canonical.
// Body: { days?: number }
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "register_catalog",
    description: "Agrupa rótulos de tema parecidos em temas canônicos.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["groups"],
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["canonical_name", "description", "members"],
            properties: {
              canonical_name: { type: "string", description: "Nome curto em português do tema canônico." },
              description: { type: "string" },
              members: { type: "array", items: { type: "string" }, description: "Rótulos originais que pertencem a este tema." },
            },
          },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body.days || 120), 7), 400);
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

    const rows: any[] = [];
    for (let page = 0; page < 60; page++) {
      const { data, error } = await service
        .from("chatwoot_conversation_themes")
        .select("primary_theme")
        .gte("day_sp", from)
        .not("primary_theme", "is", null)
        .order("primary_theme", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if ((data || []).length < 1000) break;
    }

    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.primary_theme).toLowerCase().trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const labels = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 300);
    if (labels.length === 0) return json({ ok: true, groups: 0, updated: 0 });

    const { data: catalog } = await service
      .from("chatwoot_theme_catalog").select("canonical_name, synonyms").eq("is_active", true);
    const existingNames = (catalog || []).map((c) => c.canonical_name);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content: `Você organiza rótulos de tema de atendimento de uma fintech brasileira.
Agrupe rótulos que significam a mesma coisa ("cobrança duplicada" e "cobraram 2x") num único tema canônico.
Reaproveite estes temas canônicos já existentes quando couber: ${existingNames.length ? existingNames.join("; ") : "(nenhum ainda)"}.
Todo rótulo recebido deve aparecer em exatamente um grupo. Nomes canônicos curtos, em português, minúsculos.
Chame a tool register_catalog obrigatoriamente.`,
          },
          {
            role: "user",
            content: `Rótulos (com volume de conversas):\n${labels.map(([l, n]) => `- ${l} (${n})`).join("\n")}`,
          },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "register_catalog" } },
      }),
    });
    if (resp.status === 402) return json({ error: "Créditos de IA esgotados" }, 402);
    if (resp.status === 403) return json({ error: "IA bloqueada pela política do workspace" }, 403);
    if (resp.status === 429) return json({ error: "Limite de requisições da IA; tente novamente em instantes" }, 429);
    if (!resp.ok) return json({ error: `AI ${resp.status}: ${(await resp.text()).slice(0, 300)}` }, 500);

    const j = await resp.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: "AI sem tool_call" }, 500);
    const groups: any[] = JSON.parse(args).groups || [];

    let updated = 0;
    for (const g of groups) {
      const canonical = String(g.canonical_name || "").toLowerCase().trim();
      if (!canonical) continue;
      const members = (Array.isArray(g.members) ? g.members : []).map((m: any) => String(m).toLowerCase().trim()).filter(Boolean);

      await service.from("chatwoot_theme_catalog").upsert({
        canonical_name: canonical,
        description: g.description || null,
        synonyms: members,
        is_active: true,
      }, { onConflict: "canonical_name" });

      for (let i = 0; i < members.length; i += 100) {
        const chunk = members.slice(i, i + 100);
        const { count } = await service
          .from("chatwoot_conversation_themes")
          .update({ primary_theme_canonical: canonical }, { count: "exact" })
          .in("primary_theme", chunk)
          .gte("day_sp", from);
        updated += count || 0;
      }
    }

    return json({ ok: true, groups: groups.length, labels: labels.length, updated });
  } catch (e: any) {
    console.error("voice-consolidate error", e);
    return json({ error: e.message }, 500);
  }
});
