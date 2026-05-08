// Compara última análise IA das conversas do golden set com os valores esperados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { data: golden } = await service
      .from("chatwoot_audit_golden_set")
      .select("*");
    if (!golden || golden.length === 0) {
      return new Response(JSON.stringify({ ok: true, total: 0, matrix: {}, agreement: 0, items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = golden.map((g) => g.conversation_id);
    const { data: audits } = await service
      .from("chatwoot_conversation_audits")
      .select("conversation_id, severity, overall_score, human_severity, human_overall_score")
      .in("conversation_id", ids);

    const auditsByConv = new Map((audits || []).map((a) => [Number(a.conversation_id), a]));
    const items: any[] = [];
    const matrix: Record<string, Record<string, number>> = { ok: { ok: 0, attention: 0, critical: 0 }, attention: { ok: 0, attention: 0, critical: 0 }, critical: { ok: 0, attention: 0, critical: 0 } };
    let agree = 0, total = 0;

    for (const g of golden) {
      const a = auditsByConv.get(Number(g.conversation_id));
      const aiSev = a ? (a.severity || "ok") : null;
      const expected = g.expected_severity;
      const ok = aiSev === expected;
      items.push({
        conversation_id: g.conversation_id,
        expected_severity: expected,
        ai_severity: aiSev,
        expected_score: g.expected_overall_score,
        ai_score: a?.overall_score ?? null,
        agree: ok,
      });
      if (aiSev) {
        total++;
        matrix[expected] = matrix[expected] || { ok: 0, attention: 0, critical: 0 };
        matrix[expected][aiSev] = (matrix[expected][aiSev] || 0) + 1;
        if (ok) agree++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      total,
      agreement: total ? agree / total : 0,
      matrix,
      items,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
