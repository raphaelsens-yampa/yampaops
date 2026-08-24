import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseEmailList, parseSheetRows, type ParseReport } from "@/lib/campaignCohort";
import type { HistoryCampaign } from "@/lib/campaignHistory";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campaign: HistoryCampaign;
  onImported: () => void;
}

export function CohortListDialog({ open, onOpenChange, campaign, onImported }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<ParseReport | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setText("");
    setFileName(null);
    setReport(null);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      setFileName(file.name);
      setReport(parseSheetRows(rows));
    } catch (e) {
      toast({ title: "Não foi possível ler o arquivo", description: String((e as Error)?.message ?? e), variant: "destructive" });
    }
  };

  const handleText = (v: string) => {
    setText(v);
    setFileName(null);
    setReport(v.trim() ? parseEmailList(v) : null);
  };

  const submit = async () => {
    if (!report?.contacts.length) return;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      const { data: imp, error: impErr } = await supabase
        .from("campaign_cohort_imports")
        .insert({
          campaign_id: campaign.id,
          file_name: fileName ?? "lista colada",
          total_rows: report.totalRows,
          valid_rows: report.contacts.length,
          skipped_rows: report.invalid + report.duplicates,
          created_by: userId,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const payload = report.contacts.map((c) => ({
        campaign_id: campaign.id,
        email: c.email,
        email_norm: c.email_norm,
        name: c.name,
        offer: c.offer,
        activated_at: c.activated_at,
        source_import_id: imp.id,
        created_by: userId,
      }));

      // Chunk para evitar payloads grandes; ignora duplicados já existentes na campanha.
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase
          .from("campaign_cohort_contacts")
          .upsert(payload.slice(i, i + 500), { onConflict: "campaign_id,email_norm", ignoreDuplicates: false });
        if (error) throw error;
      }

      toast({
        title: "Lista importada",
        description: `${report.contacts.length} e-mail(s) na campanha. ${report.invalid} inválido(s), ${report.duplicates} duplicado(s) ignorado(s).`,
      });
      reset();
      onImported();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Erro ao importar lista", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lista de clientes — {campaign.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="planilha">
          <TabsList className="w-full">
            <TabsTrigger value="planilha" className="flex-1">Importar planilha</TabsTrigger>
            <TabsTrigger value="colar" className="flex-1">Colar e-mails</TabsTrigger>
          </TabsList>

          <TabsContent value="planilha" className="space-y-2 pt-3">
            <Label className="text-xs">Arquivo XLSX ou CSV</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Colunas reconhecidas: <strong>e-mail</strong> (obrigatória), nome, oferta e data de ativação.
            </p>
          </TabsContent>

          <TabsContent value="colar" className="space-y-2 pt-3">
            <Label className="text-xs">E-mails (um por linha, vírgula ou ponto e vírgula)</Label>
            <Textarea rows={8} value={text} onChange={(e) => handleText(e.target.value)} placeholder="cliente1@empresa.com&#10;cliente2@empresa.com" />
          </TabsContent>
        </Tabs>

        {report && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{report.totalRows} linha(s) lida(s)</Badge>
              <Badge className="bg-success text-success-foreground">{report.contacts.length} válido(s)</Badge>
              {report.invalid > 0 && <Badge className="bg-destructive text-destructive-foreground">{report.invalid} inválido(s)</Badge>}
              {report.duplicates > 0 && <Badge className="bg-warning text-warning-foreground">{report.duplicates} duplicado(s)</Badge>}
            </div>
            {report.contacts.length > 0 && (
              <div className="max-h-40 overflow-auto text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 text-left">E-mail</th>
                      <th className="py-1 text-left">Nome</th>
                      <th className="py-1 text-left">Ativação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.contacts.slice(0, 20).map((c) => (
                      <tr key={c.email_norm} className="border-t">
                        <td className="py-1">{c.email_norm}</td>
                        <td className="py-1">{c.name ?? "—"}</td>
                        <td className="py-1">{c.activated_at ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.contacts.length > 20 && (
                  <p className="pt-1 text-muted-foreground">+{report.contacts.length - 20} não exibido(s)</p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !report?.contacts.length}>
            {saving ? "Importando…" : "Importar lista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
