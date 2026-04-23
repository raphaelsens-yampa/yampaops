import { useState } from "react";
import * as XLSX from "xlsx";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ORIGIN_LABELS } from "@/lib/constants";

type FieldSpec = {
  key: string;
  label: string;
  required?: boolean;
  example: string;
  notes?: string;
};

const CONTACT_FIELDS: FieldSpec[] = [
  { key: "name", label: "Nome", required: true, example: "João Silva" },
  { key: "email", label: "Email", example: "joao@empresa.com" },
  { key: "phone", label: "Telefone", example: "+55 11 99999-0000" },
  { key: "company", label: "Empresa", example: "Empresa LTDA" },
  { key: "segment", label: "Segmento", example: "Fintech" },
  { key: "icp_level", label: "Nível ICP (1-5)", example: "4", notes: "Número entre 1 e 5" },
];

const ORIGIN_OPTIONS = Object.keys(ORIGIN_LABELS).join(" | ");

const OPPORTUNITY_FIELDS: FieldSpec[] = [
  { key: "name", label: "Nome do Lead/Oportunidade", required: true, example: "Maria Souza - Plano Pro" },
  { key: "company", label: "Empresa", example: "Tech Solutions" },
  { key: "title", label: "Título do Negócio", example: "Implantação Q1" },
  { key: "origin", label: "Origem", required: true, example: "outbound", notes: `Valores válidos: ${ORIGIN_OPTIONS}` },
  { key: "sub_origin", label: "Sub-origem", example: "LinkedIn" },
  { key: "estimated_mrr", label: "MRR Estimado (R$)", example: "1500.00" },
  { key: "estimated_tpv", label: "TPV Estimado (R$)", example: "50000.00" },
  { key: "estimated_close_date", label: "Data Estimada Fechamento", example: "2025-06-30", notes: "Formato YYYY-MM-DD" },
  { key: "probability", label: "Probabilidade (0-100)", example: "60" },
  { key: "stage_slug", label: "Etapa (slug)", example: "novo_lead", notes: "Slug da etapa do pipeline" },
  { key: "consultant_email", label: "Email do Vendedor Responsável", example: "vendedor@empresa.com", notes: "Deve já existir como usuário" },
  { key: "contact_email", label: "Email do Contato", example: "joao@empresa.com", notes: "Vincula a um contato existente" },
  { key: "notes", label: "Observações", example: "Cliente pediu retorno em 7 dias" },
];

function downloadTemplate(name: string, fields: FieldSpec[]) {
  const headers = fields.map((f) => f.label + (f.required ? " *" : ""));
  const example = fields.map((f) => f.example);
  const notesRow = fields.map((f) => f.notes || "");

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    example,
    notesRow,
  ]);
  ws["!cols"] = fields.map(() => ({ wch: 24 }));

  // Instructions sheet
  const instructions = [
    ["Template de Importação - " + name],
    [""],
    ["Instruções:"],
    ["1. Preencha os dados a partir da linha 2 da aba 'Dados'."],
    ["2. Colunas marcadas com * são obrigatórias."],
    ["3. Não altere os nomes das colunas (cabeçalho)."],
    ["4. A linha 2 (exemplo) e a linha 3 (notas) DEVEM ser apagadas antes de subir."],
    ["5. Datas no formato YYYY-MM-DD. Decimais com ponto (ex: 1500.00)."],
    [""],
    ["Campo", "Obrigatório?", "Exemplo", "Notas"],
    ...fields.map((f) => [f.label, f.required ? "Sim" : "Não", f.example, f.notes || ""]),
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 32 }, { wch: 14 }, { wch: 28 }, { wch: 50 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instruções");
  XLSX.writeFile(wb, `template_${name.toLowerCase()}.xlsx`);
}

type ImportResult = { ok: number; errors: { row: number; reason: string }[] };

async function parseFile(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets["Dados"] || wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
}

function normalizeKey(label: string) {
  return label.replace(/\*/g, "").trim().toLowerCase();
}

function buildRowMap(row: Record<string, any>, fields: FieldSpec[]) {
  const out: Record<string, any> = {};
  const lookup: Record<string, string> = {};
  fields.forEach((f) => { lookup[normalizeKey(f.label)] = f.key; });
  Object.entries(row).forEach(([k, v]) => {
    const key = lookup[normalizeKey(k)];
    if (key) out[key] = typeof v === "string" ? v.trim() : v;
  });
  return out;
}

export default function Imports() {
  const { toast } = useToast();
  const [contactFile, setContactFile] = useState<File | null>(null);
  const [oppFile, setOppFile] = useState<File | null>(null);
  const [contactResult, setContactResult] = useState<ImportResult | null>(null);
  const [oppResult, setOppResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function importContacts() {
    if (!contactFile) return;
    setLoading(true);
    try {
      const rows = await parseFile(contactFile);
      const { data: { user } } = await supabase.auth.getUser();
      const errors: ImportResult["errors"] = [];
      let ok = 0;

      for (let i = 0; i < rows.length; i++) {
        const mapped = buildRowMap(rows[i], CONTACT_FIELDS);
        if (!mapped.name) { errors.push({ row: i + 2, reason: "Nome é obrigatório" }); continue; }
        const payload: any = {
          name: mapped.name,
          email: mapped.email || null,
          phone: mapped.phone || null,
          company: mapped.company || null,
          segment: mapped.segment || null,
          icp_level: mapped.icp_level ? Number(mapped.icp_level) : null,
          created_by: user?.id || null,
        };
        const { error } = await supabase.from("contacts").insert(payload);
        if (error) errors.push({ row: i + 2, reason: error.message });
        else ok++;
      }
      setContactResult({ ok, errors });
      toast({ title: "Importação concluída", description: `${ok} contatos importados, ${errors.length} erros` });
    } catch (e: any) {
      toast({ title: "Erro ao processar arquivo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function importOpportunities() {
    if (!oppFile) return;
    setLoading(true);
    try {
      const rows = await parseFile(oppFile);
      const [profilesRes, contactsRes, stagesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, email"),
        supabase.from("contacts").select("id, email"),
        supabase.from("pipeline_stages").select("id, slug, pipeline_id"),
      ]);
      const profByEmail = new Map((profilesRes.data || []).map((p: any) => [String(p.email || "").toLowerCase(), p.user_id]));
      const contactByEmail = new Map((contactsRes.data || []).map((c: any) => [String(c.email || "").toLowerCase(), c.id]));
      const validOrigins = new Set(Object.keys(ORIGIN_LABELS));
      const stageBySlug = new Map((stagesRes.data || []).map((s: any) => [s.slug, s]));

      const errors: ImportResult["errors"] = [];
      let ok = 0;

      for (let i = 0; i < rows.length; i++) {
        const m = buildRowMap(rows[i], OPPORTUNITY_FIELDS);
        if (!m.name) { errors.push({ row: i + 2, reason: "Nome é obrigatório" }); continue; }
        if (!m.origin || !validOrigins.has(m.origin)) {
          errors.push({ row: i + 2, reason: `Origem inválida (use: ${ORIGIN_OPTIONS})` }); continue;
        }
        const stageSlug = m.stage_slug || "novo_lead";
        const stage = stageBySlug.get(stageSlug);

        const payload: any = {
          name: m.name,
          company: m.company || null,
          title: m.title || null,
          origin: m.origin,
          sub_origin: m.sub_origin || null,
          estimated_mrr: m.estimated_mrr ? Number(m.estimated_mrr) : 0,
          estimated_tpv: m.estimated_tpv ? Number(m.estimated_tpv) : 0,
          estimated_close_date: m.estimated_close_date || null,
          probability: m.probability ? Number(m.probability) : 0,
          stage: stageSlug,
          pipeline_id: stage?.pipeline_id || undefined,
          consultant_id: m.consultant_email ? profByEmail.get(String(m.consultant_email).toLowerCase()) || null : null,
          contact_id: m.contact_email ? contactByEmail.get(String(m.contact_email).toLowerCase()) || null : null,
          notes: m.notes || null,
        };
        const { error } = await supabase.from("opportunities").insert(payload);
        if (error) errors.push({ row: i + 2, reason: error.message });
        else ok++;
      }
      setOppResult({ ok, errors });
      toast({ title: "Importação concluída", description: `${ok} oportunidades importadas, ${errors.length} erros` });
    } catch (e: any) {
      toast({ title: "Erro ao processar arquivo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const renderFieldsTable = (fields: FieldSpec[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coluna</TableHead>
          <TableHead>Obrigatório</TableHead>
          <TableHead>Exemplo</TableHead>
          <TableHead>Notas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fields.map((f) => (
          <TableRow key={f.key}>
            <TableCell className="font-medium">{f.label}</TableCell>
            <TableCell>{f.required ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{f.example}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{f.notes || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const renderResult = (res: ImportResult | null) => {
    if (!res) return null;
    return (
      <Alert variant={res.errors.length === 0 ? "default" : "destructive"}>
        {res.errors.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        <AlertTitle>{res.ok} registros importados, {res.errors.length} erros</AlertTitle>
        {res.errors.length > 0 && (
          <AlertDescription>
            <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
              {res.errors.slice(0, 50).map((e, i) => (
                <div key={i}>Linha {e.row}: {e.reason}</div>
              ))}
              {res.errors.length > 50 && <div>... e mais {res.errors.length - 50} erros</div>}
            </div>
          </AlertDescription>
        )}
      </Alert>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-heading font-bold">Importação</h1>
          <p className="text-muted-foreground text-sm">Baixe o template, preencha e suba para importar em massa.</p>
        </div>

        <Tabs defaultValue="contacts">
          <TabsList>
            <TabsTrigger value="contacts">Contatos</TabsTrigger>
            <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          </TabsList>

          {[
            { value: "contacts", title: "Contatos", desc: "Importe sua base de contatos.", fields: CONTACT_FIELDS, file: contactFile, setFile: setContactFile, run: importContacts, result: contactResult, name: "Contatos" },
            { value: "opportunities", title: "Oportunidades", desc: "Importe leads/negócios para o pipeline.", fields: OPPORTUNITY_FIELDS, file: oppFile, setFile: setOppFile, run: importOpportunities, result: oppResult, name: "Oportunidades" },
          ].map((cfg) => (
            <TabsContent key={cfg.value} value={cfg.value} className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Template de {cfg.title}</CardTitle>
                  <CardDescription>{cfg.desc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => downloadTemplate(cfg.name, cfg.fields)} variant="outline">
                      <Download className="h-4 w-4 mr-2" /> Baixar template (.xlsx)
                    </Button>
                    <div className="flex items-center gap-2">
                      <Input type="file" accept=".xlsx,.xls" onChange={(e) => cfg.setFile(e.target.files?.[0] || null)} className="max-w-xs" />
                      <Button onClick={cfg.run} disabled={!cfg.file || loading}>
                        <Upload className="h-4 w-4 mr-2" /> Importar
                      </Button>
                    </div>
                  </div>
                  {renderResult(cfg.result)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dicionário de colunas</CardTitle>
                  <CardDescription>Use exatamente os nomes das colunas abaixo no arquivo.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {renderFieldsTable(cfg.fields)}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
