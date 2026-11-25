import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// Checks the Vindi API key (Basic auth: key as user, empty password) against production and sandbox.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const key = Deno.env.get('VINDI_API_KEY')?.trim()
  if (!key) return new Response(JSON.stringify({ error: 'VINDI_API_KEY ausente' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const auth = 'Basic ' + btoa(`${key}:`)
  const out: Record<string, unknown> = {}
  for (const [env, base] of [['production', 'https://app.vindi.com.br'], ['sandbox', 'https://sandbox-app.vindi.com.br']]) {
    const r = await fetch(`${base}/api/v1/merchants/current`, { headers: { Authorization: auth } })
    const body = await r.json().catch(() => null)
    out[env] = { status: r.status, merchant: body?.merchant?.name ?? null, errors: body?.errors ?? null }
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
