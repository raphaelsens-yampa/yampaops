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
  name: "list_chatwoot_conversations",
  title: "List Chatwoot conversations",
  description:
    "List recent Chatwoot conversations synced into Yampa. Optional filters by status and contact email or phone.",
  inputSchema: {
    status: z.string().optional().describe("Conversation status (e.g. open, resolved, pending)."),
    contact: z.string().optional().describe("Substring match against contact email or phone."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, contact, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sb(ctx)
      .from("chatwoot_conversations")
      .select(
        "chatwoot_conversation_id, status, tabulacao_atendimento, contact_email, contact_phone, assignee_email, labels, last_message_at, opened_at"
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (contact) q = q.or(`contact_email.ilike.%${contact}%,contact_phone.ilike.%${contact}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
