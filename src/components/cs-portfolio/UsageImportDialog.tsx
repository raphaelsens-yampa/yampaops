import { useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { missingColumns, parseUsageRecords, referenceDateFromFileName, USAGE_COLUMNS, USAGE_TIER_LABEL, type UsageRow } from "@/lib/productUsage";
import { useImportProductUsage } from "@/hooks/useProductUsage";

/** Importa a planilha de uso do produto (modelo usage_empresas_AAAA-MM-DD.csv). Cada importação substitui a anterior. */
export function UsageImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const importUsage = useImportProductUsage();
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [refDate, setRefDate] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  async function onFile(file: File) {
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    const wb = isCsv
      ? XLSX.read(new TextDecoder("utf-8").decode(await file.arrayBuffer()).replace(/^\uFEFF/, ""), { type: "string", raw: true })
      : XLSX.read(await file.arrayBuffer(), { raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] || []).map(String);
    const miss = missingColumns(headers);
    setMissing(miss);
    setRefDate(referenceDateFromFileName(file.name) || new Date().toISOString().slice(0, 10));
    if (miss.length) { setRows([]); return; }
    const parsed = parseUsageRecords(json);
    setRows(parsed);
  }

  async function save() {
    if (!rows.length || !refDate) return;
    try {
      const n = await importUsage.mutateAsync({ rows, referenceDate: refDate });
      toast.success(`${n} empresa(s) importada(s). Dados de uso atualizados.`);
      setRows([]); onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Falha ao importar");
    }
  }

  const tierCount = rows.reduce<Record<string, number>>((a, r) => { const k = r.tier || "sem_dado"; a[k] = (a[k] || 0) + 1; return a; }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Importar uso do produto</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Use a planilha padrão <strong>usage_empresas_AAAA-MM-DD.csv</strong>. Cada importação substitui a anterior por completo.
          </p>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          {missing.length > 0 && (
            <p className="text-destructive">Planilha fora do modelo. Faltam as colunas: {missing.join(", ")}.</p>
          )}
          {rows.length > 0 && (
            <>
              <div className="space-y-1">
                <Label>Data de referência</Label>
                <Input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} />
              </div>
              <div className="rounded-md border p-2 text-xs space-y-1">
                <p className="font-medium">{rows.length} empresa(s) reconhecida(s)</p>
                {Object.entries(tierCount).map(([k, v]) => <p key={k}>{USAGE_TIER_LABEL[k] || k}: {v}</p>)}
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">Colunas esperadas: {USAGE_COLUMNS.join(" · ")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={importUsage.isPending || !rows.length || !refDate}>Importar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
