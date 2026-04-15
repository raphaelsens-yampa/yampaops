import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORIGIN_LABELS, STAGE_LABELS } from "@/lib/constants";
import { Upload, Download, FileUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

export default function ImportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);

  const targetFields = ["name", "company", "origin", "estimated_mrr", "estimated_tpv", "take_rate", "notes", "stage"];

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").filter(l => l.trim());
      if (lines.length < 2) return;
      const hdrs = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
      setHeaders(hdrs);
      const rows = lines.slice(1).map(line => {
        const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
        const row: Record<string, string> = {};
        hdrs.forEach((h, i) => { row[h] = vals[i] || ""; });
        return row;
      });
      setCsvData(rows);
      // Auto-map
      const autoMap: Record<string, string> = {};
      hdrs.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes("nome") || lower === "name") autoMap[h] = "name";
        else if (lower.includes("empresa") || lower === "company") autoMap[h] = "company";
        else if (lower.includes("origem") || lower === "origin") autoMap[h] = "origin";
        else if (lower.includes("mrr")) autoMap[h] = "estimated_mrr";
        else if (lower.includes("tpv")) autoMap[h] = "estimated_tpv";
        else if (lower.includes("take")) autoMap[h] = "take_rate";
        else if (lower.includes("nota") || lower === "notes") autoMap[h] = "notes";
        else if (lower.includes("stage") || lower.includes("etapa")) autoMap[h] = "stage";
      });
      setMapping(autoMap);
    };
    reader.readAsText(file);
  }

  async function doImport() {
    if (!user) return;
    setImporting(true);
    const nameCol = Object.entries(mapping).find(([_, v]) => v === "name")?.[0];
    if (!nameCol) { toast({ title: "Erro", description: "Mapeie pelo menos o campo Nome", variant: "destructive" }); setImporting(false); return; }

    const rows = csvData.map(row => {
      const lead: any = { consultant_id: user.id };
      Object.entries(mapping).forEach(([csvCol, field]) => {
        if (field === "estimated_mrr" || field === "estimated_tpv" || field === "take_rate") {
          lead[field] = parseFloat(row[csvCol]) || 0;
        } else {
          lead[field] = row[csvCol] || null;
        }
      });
      return lead;
    }).filter(r => r.name);

    const { error } = await supabase.from("leads").insert(rows);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Importado!", description: `${rows.length} leads importados.` }); setCsvData([]); }
    setImporting(false);
  }

  async function exportCSV() {
    const { data } = await supabase.from("leads").select("*");
    if (!data || data.length === 0) { toast({ title: "Sem dados" }); return; }
    const hdrs = Object.keys(data[0]);
    const csv = [hdrs.join(","), ...data.map(r => hdrs.map(h => `"${(r as any)[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "leads_export.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Importar / Exportar</h1>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Importar CSV</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo CSV</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>

            {headers.length > 0 && (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Mapeamento de colunas:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {headers.map(h => (
                      <div key={h} className="flex items-center gap-2">
                        <span className="text-sm w-32 truncate">{h}</span>
                        <Select value={mapping[h] || "skip"} onValueChange={v => setMapping(m => ({ ...m, [h]: v }))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Pular</SelectItem>
                            {targetFields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">Preview: {csvData.length} registros</p>
                {csvData.length > 0 && (
                  <div className="overflow-x-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>{headers.slice(0, 5).map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvData.slice(0, 5).map((row, i) => (
                          <TableRow key={i}>{headers.slice(0, 5).map(h => <TableCell key={h}>{row[h]}</TableCell>)}</TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <Button onClick={doImport} disabled={importing} className="w-full">
                  <Upload className="h-4 w-4 mr-1" /> {importing ? "Importando..." : `Importar ${csvData.length} leads`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
