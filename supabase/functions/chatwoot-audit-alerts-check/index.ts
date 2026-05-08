// Cron diário: gera alertas proativos de QA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function effSeverity(a: any): string {
  return a.human_severity || a.severity;
}
function effScore(a: any): number {
  return Number(a.human_overall_score ?? a.overall_score) || 0;
}

async function alreadyAlerted(type: string, key: string, hoursWindow: number): Promise<boolean> {
  const since = new Date(Date.now() - hoursWindow * 3600 * 1000).toISOString();
  const { data } = await service
    .from("chatwoot_audit_alerts")
    .select("id")
    .eq("alert_type", type)
    .gte("created_at", since)
    .contains("metadata", { key });
  return (data || []).length > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const now = new Date();
    const sevenDays = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const fourteenDays = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();

    const { data: recent } = await service
      .from("chatwoot_conversation_audits")
      .select("assignee_email, assignee_name, severity, human_severity, overall_score, human_overall_score, churn_signals, inbox_name, conversation_resolved_at")
      .gte("conversation_resolved_at", fourteenDays)
      .limit(5000);

    const audits = recent || [];
    const created: any[] = [];

    // Regra 1: 3+ críticas em 7 dias por vendedor
    const critByEmail = new Map<string, { name: string; count: number }>();
    for (const a of audits) {
      if (!a.assignee_email) continue;
      if (effSeverity(a) !== "critical") continue;
      if (!a.conversation_resolved_at || a.conversation_resolved_at < sevenDays) continue;
      const cur = critByEmail.get(a.assignee_email) || { name: a.assignee_name || a.assignee_email, count: 0 };
      cur.count++;
      critByEmail.set(a.assignee_email, cur);
    }
    for (const [email, info] of critByEmail) {
      if (info.count < 3) continue;
      const key = `crit7:${email}:${now.toISOString().slice(0, 10)}`;
      if (await alreadyAlerted("3_criticals_week", key, 24)) continue;
      const { data } = await service.from("chatwoot_audit_alerts").insert({
        alert_type: "3_criticals_week",
        target_email: email,
        severity: "critical",
        message: `${info.name} acumulou ${info.count} auditorias críticas nos últimos 7 dias.`,
        metadata: { key, count: info.count },
      }).select().maybeSingle();
      if (data) created.push(data);
    }

    // Regra 2: queda >20% no score médio semanal
    const byEmailWeek = new Map<string, { thisWeek: number[]; lastWeek: number[]; name: string }>();
    for (const a of audits) {
      if (!a.assignee_email || !a.conversation_resolved_at) continue;
      const cur = byEmailWeek.get(a.assignee_email) || { thisWeek: [], lastWeek: [], name: a.assignee_name || a.assignee_email };
      if (a.conversation_resolved_at >= sevenDays) cur.thisWeek.push(effScore(a));
      else cur.lastWeek.push(effScore(a));
      byEmailWeek.set(a.assignee_email, cur);
    }
    for (const [email, info] of byEmailWeek) {
      if (info.thisWeek.length < 3 || info.lastWeek.length < 3) continue;
      const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const a1 = avg(info.thisWeek);
      const a0 = avg(info.lastWeek);
      if (a0 === 0) continue;
      const drop = (a0 - a1) / a0;
      if (drop < 0.2) continue;
      const key = `drop:${email}:${now.toISOString().slice(0, 10)}`;
      if (await alreadyAlerted("score_drop", key, 24 * 7)) continue;
      const { data } = await service.from("chatwoot_audit_alerts").insert({
        alert_type: "score_drop",
        target_email: email,
        severity: "attention",
        message: `${info.name}: score caiu ${(drop * 100).toFixed(0)}% (${a0.toFixed(0)} → ${a1.toFixed(0)}) na última semana.`,
        metadata: { key, prev_avg: a0, curr_avg: a1, drop_pct: drop },
      }).select().maybeSingle();
      if (data) created.push(data);
    }

    // Regra 3: spike de churn signals por inbox (esta semana > 2x mediana 4 semanas)
    const churnByInboxWeek = new Map<string, number[]>();
    for (const a of audits) {
      const inbox = a.inbox_name || "—";
      const arr = churnByInboxWeek.get(inbox) || [0, 0]; // [thisWeek, lastWeek]
      const churn = (a.churn_signals?.length || 0) > 0 ? 1 : 0;
      if (a.conversation_resolved_at && a.conversation_resolved_at >= sevenDays) arr[0] += churn;
      else arr[1] += churn;
      churnByInboxWeek.set(inbox, arr);
    }
    for (const [inbox, [tw, lw]] of churnByInboxWeek) {
      if (tw < 5) continue;
      if (lw === 0 || tw / lw < 2) continue;
      const key = `churnspike:${inbox}:${now.toISOString().slice(0, 10)}`;
      if (await alreadyAlerted("churn_spike", key, 24 * 7)) continue;
      const { data } = await service.from("chatwoot_audit_alerts").insert({
        alert_type: "churn_spike",
        target_inbox: inbox,
        severity: "attention",
        message: `Inbox "${inbox}": sinais de churn dobraram esta semana (${lw} → ${tw}).`,
        metadata: { key, prev: lw, curr: tw },
      }).select().maybeSingle();
      if (data) created.push(data);
    }

    return new Response(JSON.stringify({ ok: true, created: created.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("alerts-check error", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
