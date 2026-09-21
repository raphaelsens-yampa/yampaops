/**
 * Log de alterações das campanhas históricas.
 * Toda edição feita depois da criação exige justificativa do usuário.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AuditChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface AuditEntry {
  id: string;
  campaign_id: string;
  change_type: string;
  reason: string;
  changes: AuditChange[];
  changed_by: string | null;
  created_at: string;
}

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  campaign: "Dados da campanha",
  values: "Metas e realizados",
};

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Compara pares de campos e devolve apenas o que mudou. */
export function diffFields(
  fields: { field: string; before: unknown; after: unknown }[],
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const f of fields) {
    const before = norm(f.before);
    const after = norm(f.after);
    if (before !== after) out.push({ field: f.field, before, after });
  }
  return out;
}

/** Registra a alteração no log. Retorna mensagem de erro, se houver. */
export async function logCampaignChange(params: {
  campaignId: string;
  changeType: "campaign" | "values";
  reason: string;
  changes: AuditChange[];
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return "Sessão expirada. Entre novamente para registrar a alteração.";
  const { error } = await supabase.from("campaign_history_audit").insert({
    campaign_id: params.campaignId,
    change_type: params.changeType,
    reason: params.reason.trim(),
    changes: params.changes as unknown as never,
    changed_by: userId,
  });
  return error ? error.message : null;
}

export function formatAuditDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
