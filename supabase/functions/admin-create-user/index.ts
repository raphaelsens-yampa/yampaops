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

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "invalid_token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const full_name = String(body.full_name || "").trim();
    const role = String(body.role || "seller");
    const access_level_id = body.access_level_id ? String(body.access_level_id) : null;

    if (!email || !password || password.length < 6) {
      return json({ error: "invalid_input", message: "Email e senha (mín. 6 chars) obrigatórios" }, 400);
    }
    if (!["admin", "tatico", "seller"].includes(role)) {
      return json({ error: "invalid_role" }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (createErr || !created.user) {
      return json({ error: "create_failed", message: createErr?.message }, 400);
    }

    const newUserId = created.user.id;

    // Trigger handle_new_user inserts profile + default seller role. Adjust if needed.
    if (role !== "seller") {
      await admin.from("user_roles").update({ role }).eq("user_id", newUserId);
    }

    if (access_level_id) {
      await admin.from("user_access_levels").delete().eq("user_id", newUserId);
      await admin.from("user_access_levels").insert({
        user_id: newUserId,
        access_level_id,
      });
    }

    return json({ ok: true, user_id: newUserId });
  } catch (e) {
    return json({ error: "server_error", message: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
