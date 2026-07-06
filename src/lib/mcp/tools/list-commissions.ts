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
  name: "list_commissions",
  title: "List commissions",
  description:
    "List commissions visible to the signed-in user. Optional filters by status and payment month (YYYY-MM).",
  inputSchema: {
    status: z.string().optional().describe("Filter by status (e.g. provisioned, paid, canceled)."),
    payment_month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe("Filter by payment month in YYYY-MM format."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, payment_month, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("commissions")
      .select("id, opportunity_id, seller_id, product_id, sale_date, payment_month, commission_amount, type, status")
      .order("payment_month", { ascending: false })
      .limit(limit ?? 100);
    if (status) q = q.eq("status", status);
    if (payment_month) {
      const start = `${payment_month}-01`;
      const [y, m] = payment_month.split("-").map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      q = q.gte("payment_month", start).lt("payment_month", nextMonth);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
