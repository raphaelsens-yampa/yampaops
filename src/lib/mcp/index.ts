import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOpportunities from "./tools/list-opportunities";
import getOpportunity from "./tools/get-opportunity";
import listCommissions from "./tools/list-commissions";
import listChatwootConversations from "./tools/list-chatwoot-conversations";
import whoami from "./tools/whoami";

// Direct supabase.co issuer (never the .lovable.cloud proxy). Built from the
// project ref, which Vite inlines at build time so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "yampa-mcp",
  title: "Yampa CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Yampa sales CRM. Use `whoami` to confirm identity, `list_opportunities` and `get_opportunity` for the sales pipeline, `list_commissions` for seller commissions, and `list_chatwoot_conversations` for recent support/sales conversations. All reads run as the signed-in user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoami, listOpportunities, getOpportunity, listCommissions, listChatwootConversations],
});
