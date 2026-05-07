import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const TOKEN = Deno.env.get("CHATWOOT_API_TOKEN") || "";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { id } = await req.json();
  const base = "https://chatwoot.yampa.com.br";
  const acc = 1;
  const headers = { api_access_token: TOKEN };
  const r1 = await fetch(`${base}/api/v1/accounts/${acc}/conversations/${id}/labels`, { headers });
  const t1 = await r1.text();
  const r2 = await fetch(`${base}/api/v1/accounts/${acc}/conversations/${id}`, { headers });
  const j2 = await r2.json();
  return new Response(JSON.stringify({
    labels_endpoint: { status: r1.status, body: t1 },
    conv_labels: j2?.labels,
    conv_meta_labels: j2?.meta?.labels,
    conv_additional: j2?.additional_attributes?.labels,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
