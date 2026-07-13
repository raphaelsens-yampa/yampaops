// Remove notas do ActiveCampaign que foram criadas por match incorreto
// no chatwoot-to-ac-sync (bug de substring do filters[phone]).
//
// Body: { ac_contact_id: string, keep_last_digits?: string, dry_run?: boolean, limit?: number }
// - ac_contact_id: contato AC alvo (ex: "159641")
// - keep_last_digits: últimos N dígitos do telefone REAL do contato (ex: "4891914758").
//                     Links cujo match_value bate esse sufixo NÃO são apagados.
// - dry_run: se true, só lista o que seria apagado.
// - limit: máximo de itens a processar nesta chamada (default 500).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const AC_API_URL = (Deno.env.get("AC_API_URL") || "").replace(/\/$/, "");
const AC_API_KEY = Deno.env.get("AC_API_KEY") || "";

function normDigits(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleRow } = await service.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!AC_API_URL || !AC_API_KEY) {
      return new Response(JSON.stringify({ error: "AC not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const acContactId = String(body?.ac_contact_id || "").trim();
    const keep = normDigits(String(body?.keep_last_digits || ""));
    const dryRun = !!body?.dry_run;
    const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 2000);

    if (!acContactId) {
      return new Response(JSON.stringify({ error: "ac_contact_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: links } = await service.from("chatwoot_ac_note_links")
      .select("id, chatwoot_conversation_id, ac_note_id, match_method, match_value")
      .eq("ac_contact_id", acContactId)
      .limit(limit);

    let toDelete: any[] = [];
    for (const l of links || []) {
      const mv = normDigits(l.match_value);
      const isBad = !keep || !mv.endsWith(keep);
      if (isBad) toDelete.push(l);
    }

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, dry_run: true, ac_contact_id: acContactId, keep_suffix: keep,
        total_links: (links || []).length, would_delete: toDelete.length,
        sample: toDelete.slice(0, 10),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let deletedNotes = 0, deletedLinks = 0, failed = 0;
    const errors: string[] = [];
    for (const l of toDelete) {
      try {
        if (l.ac_note_id) {
          const r = await fetch(`${AC_API_URL}/api/3/notes/${l.ac_note_id}`, {
            method: "DELETE",
            headers: { "Api-Token": AC_API_KEY },
          });
          if (r.ok || r.status === 404) deletedNotes++;
          else { failed++; errors.push(`note ${l.ac_note_id}: ${r.status}`); continue; }
        }
        await service.from("chatwoot_ac_note_links").delete().eq("id", l.id);
        deletedLinks++;
      } catch (e: any) {
        failed++;
        errors.push(`link ${l.id}: ${e?.message || e}`);
      }
      await new Promise((res) => setTimeout(res, 150));
    }

    return new Response(JSON.stringify({
      ok: true, ac_contact_id: acContactId, keep_suffix: keep,
      considered: (links || []).length,
      deleted_notes: deletedNotes, deleted_links: deletedLinks, failed, errors: errors.slice(0, 20),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
