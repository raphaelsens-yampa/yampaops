import { useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useCsPortfolioMutations } from "@/hooks/useCsPortfolio";

interface Parsed { email: string; industry: string | null; notes: string | null }

/** Importa ramo de atuação (e observações) por e-mail a partir de XLSX/CSV. */
export function EnrichmentImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { saveEnrichment } = useCsPortfolioMutations();
  const [rows, setRows] = useState<Parsed[]>([]);

  async function onFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const parsed: Parsed[] = [];
    for (const r of json) {
      const keys = Object.keys(r);
      const find = (...names: string[]) =>
        keys.find((k) => names.some((n) => k.trim().toLowerCase() === n));
      const emailKey = find("email", "e-mail");
      const indKey = find("ramo", "ramo de atuacao", "ramo de atuação", "industry", "segmento de mercado");
      const noteKey = find("observacoes", "observações", "notas", "notes");
      const email = String(emailKey ? r[emailKey] : "").trim().toLowerCase();
      if (!email.includes("@")) continue;
      parsed.push({
        email,
        industry: indKey ? String(r[indKey]).trim() || null : null,
        notes: noteKey ? String(r[noteKey]).trim() || null : null,
      });
    }
    setRows(parsed);
    toast.success(`${parsed.length} linha(s) reconhecida(s)`);
  }

  async function save() {
    if (!rows.length) return toast.error("Nenhuma linha válida");
    try {
      const n = await saveEnrichment.mutateAsync(rows.map((r) => ({ ...r, source: "import" })));
      toast.success(`${n} cliente(s) enriquecido(s). Atualize a carteira para refletir.`);
      setRows([]);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao importar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar ramo de atuação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Planilha XLSX/CSV com as colunas <strong>email</strong> e <strong>ramo</strong> (opcional: observações).
          </p>
          <div className="space-y-1">
            <Label>Arquivo</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>
          {rows.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 text-xs space-y-1">
              {rows.slice(0, 50).map((r) => (
                <p key={r.email} className="truncate">{r.email} — {r.industry || "—"}</p>
              ))}
              {rows.length > 50 && <p className="text-muted-foreground">+{rows.length - 50} linha(s)...</p>}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saveEnrichment.isPending || !rows.length}>Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
