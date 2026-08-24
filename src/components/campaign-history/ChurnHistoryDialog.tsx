import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import { normalizeEmail } from "@/lib/campaignCohort";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

interface ChurnRow {
  email_norm: string;
  data_cancelamento: string;
  mrr: number | null;
  plano: string | null;
  motivo: string | null;
  fonte: string;
}

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  const entries = Object.entries(row);
  for (const k of keys) {
    const hit = entries.find(([key]) => key.trim().toLowerCase() === k);
    if (hit && hit[1] !== "" && hit[1] != null) return hit[1];
  }
  return null;
};

function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function ChurnHistoryDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const [parsed, setParsed] = useState<ChurnRow[]>([]);
  const [invalid, setInvalid] = useState(0);
  const [saving, setSaving] = useState(false);

  const statsQ = useQuery({
    queryKey: ["churn-historico-stats", open],
    enabled: open,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("metas_churn_historico")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      const { data: range } = await supabase
        .from("metas_churn_historico")
        .select("data_cancelamento")
        .order("data_cancelamento", { ascending: true })
        .limit(1);
      const { data: last } = await supabase
        .from("metas_churn_historico")
        .select("data_cancelamento")
        .order("data_cancelamento", { ascending: false })
        .limit(1);
      return {
        total: count ?? 0,
        from: range?.[0]?.data_cancelamento ?? null,
        to: last?.[0]?.data_cancelamento ?? null,
      };
    },
  });

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const seen = new Set<string>();
    const rows: ChurnRow[] = [];
    let bad = 0;
    for (const r of raw) {
      const email = normalizeEmail(pick(r, ["email", "e-mail", "email cliente"]));
      const date = toISODate(pick(r, ["data_cancelamento", "data cancelamento", "churn at", "data churn", "cancelado em"]));
      if (!email || !date) { bad++; continue; }
      const key = `${email}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        email_norm: email,
        data_cancelamento: date,
        mrr: toNum(pick(r, ["mrr", "total mrr", "valor"])),
        plano: (pick(r, ["plano", "plan"]) as string | null) || null,
        motivo: (pick(r, ["motivo", "tipo churn", "razao"]) as string | null) || null,
        fonte: "planilha",
      });
    }
    setParsed(rows);
    setInvalid(bad);
  };

  const save = async () => {
    if (!parsed.length) return;
    setSaving(true);
    try {
      for (let i = 0; i < parsed.length; i += 500) {
        const { error } = await supabase
          .from("metas_churn_historico")
          .upsert(parsed.slice(i, i + 500), { onConflict: "email_norm,data_cancelamento" });
        if (error) throw error;
      }
      toast({ title: "Histórico de churn importado", description: `${parsed.length} registro(s) gravados.` });
      setParsed([]);
      setInvalid(0);
      statsQ.refetch();
      onImported?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Erro ao importar", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => parsed.slice(0, 8), [parsed]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Base histórica de churn</DialogTitle>
          <DialogDescription>
            Cancelamentos consolidados usados pelo cohort para datar o churn de clientes antigos.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border p-3 text-sm">
          {statsQ.isLoading ? "Carregando…" : (
            <>
              <p><strong>{(statsQ.data?.total ?? 0).toLocaleString("pt-BR")}</strong> cancelamentos registrados</p>
              <p className="text-xs text-muted-foreground">
                Período coberto: {statsQ.data?.from ?? "—"} a {statsQ.data?.to ?? "—"}
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Importar planilha (XLSX/CSV)</Label>
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <p className="text-xs text-muted-foreground">
            Colunas aceitas: <code>email</code>, <code>data_cancelamento</code> (obrigatórias), <code>mrr</code>, <code>plano</code>, <code>motivo</code>.
          </p>
        </div>

        {!!parsed.length && (
          <div className="space-y-2">
            <p className="text-sm">
              {parsed.length} registro(s) válidos{invalid ? ` · ${invalid} linha(s) ignoradas` : ""}
            </p>
            <div className="max-h-48 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 text-left">E-mail</th>
                    <th className="px-2 py-1 text-left">Cancelamento</th>
                    <th className="px-2 py-1 text-right">MRR</th>
                    <th className="px-2 py-1 text-left">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={`${r.email_norm}-${r.data_cancelamento}`} className="border-b last:border-0">
                      <td className="px-2 py-1">{r.email_norm}</td>
                      <td className="px-2 py-1">{r.data_cancelamento}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.mrr ?? "—"}</td>
                      <td className="px-2 py-1">{r.motivo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={save} disabled={!parsed.length || saving}>
            <Upload className="mr-1 h-4 w-4" />
            {saving ? "Gravando…" : "Importar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
