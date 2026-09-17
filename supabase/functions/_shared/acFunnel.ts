import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export const AC_API_URL = (Deno.env.get("AC_API_URL") ?? "").replace(/\/+$/, "");
export const AC_API_KEY = Deno.env.get("AC_API_KEY") ?? "";

export function admin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function acFetch(path: string): Promise<any> {
  const res = await fetch(`${AC_API_URL}/api/3/${path}`, {
    headers: { "Api-Token": AC_API_KEY, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`AC request failed [${res.status}] ${path}: ${text.slice(0, 500)}`);
    throw new Error(`[${res.status}]: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AC returned non-JSON for ${path}: ${text.slice(0, 200)}`);
  }
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function iso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export type StoredDeal = {
  ac_deal_id: string;
  ac_group_id: string;
  ac_stage_id: string | null;
  status: number;
  value: number;
  contact_email: string | null;
  owner_name: string | null;
  closed_at?: string | null;
};

/** Grava eventos (idempotente) comparando o estado novo com o armazenado. */
export async function writeEvents(
  db: SupabaseClient,
  prev: StoredDeal | null,
  next: {
    ac_deal_id: string;
    ac_group_id: string;
    ac_stage_id: string | null;
    status: number;
    value: number;
    contact_email: string | null;
    owner_name: string | null;
    deal_created_at: string | null;
    occurred_at: string;
  },
  source: string,
) {
  const rows: Record<string, unknown>[] = [];
  const base = {
    ac_deal_id: next.ac_deal_id,
    ac_group_id: next.ac_group_id,
    deal_value: next.value,
    contact_email: next.contact_email,
    owner_name: next.owner_name,
    source,
  };

  if (!prev) {
    rows.push({
      ...base,
      event_type: "created",
      from_stage_id: "",
      to_stage_id: next.ac_stage_id ?? "",
      from_status: null,
      to_status: next.status,
      occurred_at: next.deal_created_at ?? next.occurred_at,
    });
  } else {
    if ((prev.ac_stage_id ?? "") !== (next.ac_stage_id ?? "")) {
      rows.push({
        ...base,
        event_type: "stage_change",
        from_stage_id: prev.ac_stage_id ?? "",
        to_stage_id: next.ac_stage_id ?? "",
        from_status: prev.status,
        to_status: next.status,
        occurred_at: next.occurred_at,
      });
    }
    if (num(prev.status) !== num(next.status)) {
      rows.push({
        ...base,
        event_type: next.status === 1 ? "won" : next.status === 2 ? "lost" : "reopened",
        from_stage_id: prev.ac_stage_id ?? "",
        to_stage_id: next.ac_stage_id ?? "",
        from_status: prev.status,
        to_status: next.status,
        occurred_at: next.occurred_at,
      });
    }
  }

  if (!rows.length) return 0;

  // Fechamento (ganho/perda) é único por negócio, tipo e dia: nunca duplicar.
  const closures = rows.filter((r) => r.event_type === "won" || r.event_type === "lost");
  let toWrite = rows;
  if (closures.length) {
    const { data: existing } = await db
      .from("ac_funnel_stage_events")
      .select("event_type, occurred_at")
      .eq("ac_deal_id", next.ac_deal_id)
      .in("event_type", ["won", "lost"]);
    const seen = new Set((existing ?? []).map((e: any) => `${e.event_type}|${spDay(e.occurred_at)}`));
    toWrite = rows.filter(
      (r) =>
        !(r.event_type === "won" || r.event_type === "lost") ||
        !seen.has(`${r.event_type}|${spDay(String(r.occurred_at))}`),
    );
  }
  if (!toWrite.length) return 0;

  let written = 0;
  // Grava linha a linha: o índice único parcial de fechamento (ac_deal_id, event_type, dia)
  // não é compatível com onConflict, então tratamos a violação como "já existe".
  for (const row of toWrite) {
    const { error } = await db.from("ac_funnel_stage_events").upsert([row], {
      onConflict: "ac_deal_id,event_type,from_stage_id,to_stage_id,occurred_at",
      ignoreDuplicates: true,
    });
    if (error) {
      if ((error as any).code === "23505" || /duplicate key/i.test(error.message)) continue;
      console.error("writeEvents error:", error.message);
      continue;
    }
    written++;
  }
  return written;
}

/** Dia (YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function spDay(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date(isoStr));
}

/** Insere eventos tolerando o índice único parcial de fechamento (dia). */
export async function insertEventsSafe(
  db: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<number> {
  const opts = {
    onConflict: "ac_deal_id,event_type,from_stage_id,to_stage_id,occurred_at",
    ignoreDuplicates: true,
  } as const;
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("ac_funnel_stage_events").upsert(chunk, opts);
    if (!error) {
      written += chunk.length;
      continue;
    }
    // Fallback linha a linha: ignora violações do índice único de fechamento.
    for (const row of chunk) {
      const { error: e2 } = await db.from("ac_funnel_stage_events").upsert([row], opts);
      if (!e2) written++;
      else if ((e2 as any).code !== "23505" && !/duplicate key/i.test(e2.message)) {
        console.error("insertEventsSafe error:", e2.message);
      }
    }
  }
  return written;
}
