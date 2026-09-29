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

    // Apenas consulta dos dados atuais (para preencher o formulário de edição)
    if (body.action === "get") {
      const { data: target, error: getErr } = await admin.auth.admin.getUserById(targetId);
      if (getErr || !target.user) return json({ error: "not_found", message: "Usuário não encontrado" }, 404);
      return json({ ok: true, email: target.user.email || "" });
    }

    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : null;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_email", message: "E-mail inválido" }, 400);
    }

    if (email) {
      const { error: mailErr } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true });
      if (mailErr) return json({ error: "email_failed", message: mailErr.message }, 400);
    }

    if (fullName !== null) {
      const { error: profErr } = await admin.from("profiles").update({ full_name: fullName }).eq("user_id", targetId);
      if (profErr) return json({ error: "profile_failed", message: profErr.message }, 400);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
