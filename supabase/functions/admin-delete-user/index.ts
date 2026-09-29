import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "invalid_token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden", message: "Apenas administradores" }, 403);

    const body = await req.json();
    const targetId = String(body.user_id || "");
    if (!targetId) return json({ error: "invalid_input", message: "user_id obrigatório" }, 400);
    if (targetId === userData.user.id) return json({ error: "self", message: "Você não pode excluir o próprio usuário" }, 400);

    // Remove vínculos de acesso diretos
    await admin.from("user_access_levels").delete().eq("user_id", targetId);
    await admin.from("user_roles").delete().eq("user_id", targetId);
    await admin.from("team_members").delete().eq("user_id", targetId);

    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      // Registros históricos vinculados impedem exclusão definitiva: bloqueia o acesso
      const { error: banErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "876000h" });
      if (banErr) return json({ error: "delete_failed", message: delErr.message }, 400);
      return json({ ok: true, mode: "disabled", message: delErr.message });
    }
    return json({ ok: true, mode: "deleted" });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
