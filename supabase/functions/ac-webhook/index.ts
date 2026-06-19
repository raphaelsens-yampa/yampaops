const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ac-signature",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "ActiveCampaign integration archived" }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
