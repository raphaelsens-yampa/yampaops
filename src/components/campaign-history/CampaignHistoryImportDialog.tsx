import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizeLabel, parseNumberBR, slugify, type HistoryCampaign, type HistoryMetric } from "@/lib/campaignHistory";

type Role = "target" | "actual" | "funnel_target" | "funnel_actual";

interface ColumnDef {
  index: number;
  role: Role;
  campaignName: string; // "" = campanha selecionada
}

interface ParsedRow {
  label: string;
  cells: Record<string, string | number>; // `${campaignName}|${role}`
}

interface Parsed {
  columns: ColumnDef[];
  rows: ParsedRow[];
  campaignNames: string[];
  ignored: string[];
}

function detectRole(header: string): Role | null {
  const h = normalizeLabel(header);
  if (!h) return null;
  const funnel = h.includes("funil");
  if (h.includes("realizado")) return funnel ? "funnel_actual" : "actual";
  if (h.includes("meta")) {
    if (h.includes("ating")) return null;
    return funnel ? "funnel_target" : "target";
  }
  return null;
}

function campaignFromHeader(header: string): string {
  return String(header)
    .replace(/%/g, "")
    .replace(/meta|realizado|funil|atual|ating\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSheet(rows: any[][]): Parsed {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = (rows[i] || []).map((c) => normalizeLabel(String(c ?? ""))).join(" ");
    if (joined.includes("meta") && joined.includes("realizado")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { columns: [], rows: [], campaignNames: [], ignored: [] };

  const header = rows[headerIdx] || [];
  const columns: ColumnDef[] = [];
  for (let c = 1; c < header.length; c++) {
    const role = detectRole(String(header[c] ?? ""));
    if (!role) continue;
    columns.push({ index: c, role, campaignName: campaignFromHeader(String(header[c] ?? "")) });
  }

  const campaignNames = Array.from(new Set(columns.map((c) => c.campaignName)));
  const parsedRows: ParsedRow[] = [];
  const ignored: string[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const label = String((rows[r] || [])[0] ?? "").trim();
    if (!label) continue;
    const cells: Record<string, string | number> = {};
    let any = false;
    for (const col of columns) {
      const raw = (rows[r] || [])[col.index];
      if (raw === undefined || raw === null || raw === "") continue;
      cells[`${col.campaignName}|${col.role}`] = raw;
      any = true;
    }
    if (!any) ignored.push(label);
    else parsedRows.push({ label, cells });
  }
  return { columns, rows: parsedRows, campaignNames, ignored };
}

export function CampaignHistoryImportDialog({
  open,
  onOpenChange,
  metrics,
  campaigns,
  defaultCampaign,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metrics: HistoryMetric[];
  campaigns: HistoryCampaign[];
  defaultCampaign: HistoryCampaign | null;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const byNorm = new Map(metrics.map((m) => [normalizeLabel(m.label), m]));

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: "" });
    setFileName(file.name);
    setParsed(parseSheet(rows));
  };

  const matched = parsed?.rows.filter((r) => byNorm.has(normalizeLabel(r.label))) ?? [];
  const newMetrics = parsed?.rows.filter((r) => !byNorm.has(normalizeLabel(r.label))) ?? [];

  const runImport = async () => {
    if (!parsed) return;
    const names = parsed.campaignNames;
    if (names.length === 1 && names[0] === "" && !defaultCampaign) {
      toast({ title: "Selecione uma campanha antes de importar", variant: "destructive" });
      return;
    }
    setImporting(true);

    // 1. Cria indicadores novos
    const metricMap = new Map(byNorm);
    let position = Math.max(0, ...metrics.map((m) => m.position)) + 10;
    for (const row of newMetrics) {
      const { data, error } = await supabase
        .from("campaign_history_metrics")
        .insert({ slug: slugify(row.label), label: row.label, unit: "number", direction: "higher", section: "Importados", position })
        .select()
        .single();
      position += 10;
      if (error || !data) continue;
      metricMap.set(normalizeLabel(row.label), data as unknown as HistoryMetric);
    }

    // 2. Resolve campanhas
    const campaignIds = new Map<string, string>();
    for (const name of names) {
      if (!name) {
        if (defaultCampaign) campaignIds.set(name, defaultCampaign.id);
        continue;
      }
      const existing = campaigns.find((c) => normalizeLabel(c.name) === normalizeLabel(name));
      if (existing) {
        campaignIds.set(name, existing.id);
        continue;
      }
      const { data, error } = await supabase.from("campaign_history").insert({ name }).select().single();
      if (!error && data) campaignIds.set(name, (data as any).id);
    }

    // 3. Grava valores
    const payload: any[] = [];
    for (const row of parsed.rows) {
      const metric = metricMap.get(normalizeLabel(row.label));
      if (!metric) continue;
      for (const [name, campaignId] of campaignIds) {
        const t = parseNumberBR(row.cells[`${name}|target`]);
        const a = parseNumberBR(row.cells[`${name}|actual`]);
        const ft = parseNumberBR(row.cells[`${name}|funnel_target`]);
        const fa = parseNumberBR(row.cells[`${name}|funnel_actual`]);
        if (t === null && a === null && ft === null && fa === null) continue;
        payload.push({
          campaign_id: campaignId,
          metric_id: metric.id,
          target_value: t,
          actual_value: a,
          funnel_target_pct: ft,
          funnel_actual_pct: fa,
        });
      }
    }

    const { error } = payload.length
      ? await supabase.from("campaign_history_values").upsert(payload, { onConflict: "campaign_id,metric_id" })
      : { error: null as any };
    setImporting(false);
    if (error) {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Importação concluída", description: `${payload.length} valores gravados.` });
    setParsed(null);
    setFileName("");
    onImported();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planilha de campanha</DialogTitle>
          <DialogDescription>
            Indicadores nas linhas; colunas com "Meta", "Realizado" e, quando houver, "% Meta Funil" e "% Realizado Funil".
            Para importar várias campanhas de uma vez, prefixe o cabeçalho com o nome da campanha (ex.: "Ago/2022 Meta").
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />Selecionar arquivo
            </Button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {parsed && !parsed.columns.length && (
            <p className="text-sm text-destructive">
              Não foi possível localizar o cabeçalho com "Meta" e "Realizado" nas primeiras linhas da planilha.
            </p>
          )}

          {parsed && parsed.columns.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{matched.length} indicadores reconhecidos</Badge>
                {newMetrics.length > 0 && <Badge variant="outline">{newMetrics.length} novos serão criados</Badge>}
                <Badge variant="outline">
                  Campanhas: {parsed.campaignNames.map((n) => n || defaultCampaign?.name || "—").join(", ")}
                </Badge>
                {parsed.ignored.length > 0 && <Badge variant="outline">{parsed.ignored.length} linhas sem valores</Badge>}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valores lidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-xs">
                          {byNorm.has(normalizeLabel(r.label)) ? "Reconhecido" : "Novo indicador"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Object.entries(r.cells)
                            .map(([k, v]) => `${k.split("|")[1]}: ${v}`)
                            .join(" · ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={runImport} disabled={!parsed?.rows.length || importing}>
            {importing ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
