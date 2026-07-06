import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_opportunities",
  title: "List opportunities",
  description:
    "List sales opportunities visible to the signed-in user. Optional filters by stage and text search on name/company.",
  inputSchema: {
    stage: z.string().optional().describe("Filter by stage slug (e.g. novo_lead, negociacao, fechado_won)."),
    search: z.string().optional().describe("Case-insensitive substring match against name and company."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("opportunities")
      .select("id, name, company, stage, estimated_mrr, estimated_tpv, probability, consultant_id, created_at, closed_at, converted_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (stage) q = q.eq("stage", stage);
    if (search) q = q.or(`name.ilike.%${search}%,company.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
