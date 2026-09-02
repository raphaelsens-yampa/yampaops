import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { GoalCategory } from "@/lib/goalCategories";

interface Props {
  categories: GoalCategory[];
  profiles: any[];
  teams: any[];
  campaigns: { id: string; name: string }[];
  onImported: () => void;
}

type Scope = "company" | "team" | "user" | "campaign";

interface ParsedRow {
  line: number;
  scope: Scope;
  category_id: string | null;
  user_id: string | null;
  team_id: string | null;
  campaign_id: string | null;
  campaign: string | null;
  period_start: string;
  period_end: string;
  target_mrr: number;
  target_deals: number;
  target_tpv: number;
  target_pct: number;
  origem_cliente: string | null;
  categoryLabel: string;
  targetLabel: string;
  error: string | null;
}

const HEADERS = [
  "categoria",
  "origem",
  "escopo",
  "alvo",
  "periodo_inicio",
  "periodo_fim",
  "meta_mrr",
  "meta_quantidade",
  "meta_tpv",
  "meta_percentual",
];

const norm = (s: unknown) =>
  (s ?? "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const SCOPE_MAP: Record<string, Scope> = {
  empresa: "company",
  company: "company",
  time: "team",
  equipe: "team",
  team: "team",
  vendedor: "user",
  pessoa: "user",
  user: "user",
  campanha: "campaign",
  campaign: "campaign",
};

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = v.toString().trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = v.toString().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function GoalsImportDialog({ categories, profiles, teams, campaigns, onImported }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const invalid = useMemo(() => rows.filter((r) => r.error), [rows]);

  function downloadTemplate() {
    const today = new Date();
    const start = `01/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    const endD = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const end = `${String(endD.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    const exampleCat = categories[0]?.name ?? "Total de MRR";

    const data = [
      HEADERS,
      [exampleCat, "Geral", "Empresa", "", start, end, 350000, 0, 0],
      [exampleCat, "4blue", "Empresa", "", start, end, 5000, 0, 0],
      [exampleCat, "Yampa", "Vendedor", "vendedor@empresa.com", start, end, 40000, 12, 0],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = HEADERS.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, "Metas");

    const help = [
      ["Campo", "Obrigatório", "Como preencher"],
      ["categoria", "Não", "Nome ou slug da categoria cadastrada (deixe vazio para meta sem categoria)"],
      ["origem", "Não", "Geral (sem recorte) | 4blue | Yampa — a meta só aparece no filtro de origem correspondente"],
      ["escopo", "Sim", "Empresa | Time | Vendedor | Campanha"],
      ["alvo", "Depende", "Vendedor: e-mail ou nome do perfil | Time: nome do time | Campanha: nome da campanha | Empresa: vazio"],
      ["periodo_inicio", "Sim", "dd/mm/aaaa (ou data do Excel)"],
      ["periodo_fim", "Sim", "dd/mm/aaaa (ou data do Excel)"],
      ["meta_mrr", "Não", "Valor em R$ (ex.: 350000). Use para metas de MRR/valor"],
      ["meta_quantidade", "Não", "Número inteiro. Use para metas de quantidade (deals, usuários, logos)"],
      ["meta_tpv", "Não", "Valor em R$ do TPV/ARPA, se aplicável"],
      ["meta_percentual", "Não", "Meta percentual (%), ex.: churn % de logos"],
      ["", "", "Preencha ao menos um dos campos de meta com valor maior que zero"],
      ["Categorias disponíveis", "", categories.map((c) => c.name).join(" | ")],
      ["Times disponíveis", "", teams.map((t) => t.name).join(" | ")],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), "Instruções");
    XLSX.writeFile(wb, "modelo-importacao-metas.xlsx");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const wsName = wb.SheetNames.find((n) => norm(n).includes("meta")) || wb.SheetNames[0];
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, raw: true, defval: null });
    if (!matrix.length) {
      toast({ title: "Planilha vazia", variant: "destructive" });
      return;
    }
    const headers = (matrix[0] || []).map((h) => norm(h));
    const col = (name: string) => headers.indexOf(name);
    const idx = {
      categoria: col("categoria"),
      origem: col("origem"),
      escopo: col("escopo"),
      alvo: col("alvo"),
      inicio: col("periodo_inicio"),
      fim: col("periodo_fim"),
      mrr: col("meta_mrr"),
      qtd: col("meta_quantidade"),
      tpv: col("meta_tpv"),
      pct: col("meta_percentual"),
    };
    if (idx.escopo < 0 || idx.inicio < 0 || idx.fim < 0) {
      toast({ title: "Cabeçalho inválido", description: "Use o modelo padrão para importar.", variant: "destructive" });
      return;
    }

    const parsed: ParsedRow[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.every((c) => c == null || c === "")) continue;
      const get = (i: number) => (i >= 0 ? row[i] : null);

      let error: string | null = null;
      const scopeRaw = norm(get(idx.escopo));
      const scope = SCOPE_MAP[scopeRaw];
      if (!scope) error = `Escopo inválido: "${get(idx.escopo) ?? ""}"`;

      const catRaw = norm(get(idx.categoria));
      let category_id: string | null = null;
      let categoryLabel = "—";
      if (catRaw) {
        const cat = categories.find((c) => norm(c.name) === catRaw || norm(c.slug) === catRaw);
        if (!cat) error = error ?? `Categoria não encontrada: "${get(idx.categoria)}"`;
        else { category_id = cat.id; categoryLabel = cat.name; }
      }

      const origemRaw = norm(get(idx.origem));
      let origem_cliente: string | null = null;
      if (origemRaw && origemRaw !== "geral" && origemRaw !== "todos") {
        if (origemRaw === "4blue" || origemRaw === "yampa") origem_cliente = origemRaw;
        else error = error ?? `Origem inválida: "${get(idx.origem)}" (use Geral, 4blue ou Yampa)`;
      }

      const alvoRaw = (get(idx.alvo) ?? "").toString().trim();
      let user_id: string | null = null, team_id: string | null = null, campaign_id: string | null = null;
      let campaign: string | null = null, targetLabel = "Toda empresa";
      if (scope === "user") {
        const p = profiles.find((x) => norm(x.email) === norm(alvoRaw) || norm(x.full_name) === norm(alvoRaw));
        if (!p) error = error ?? `Vendedor não encontrado: "${alvoRaw}"`;
        else { user_id = p.user_id; targetLabel = p.full_name || p.email; }
      } else if (scope === "team") {
        const t = teams.find((x) => norm(x.name) === norm(alvoRaw));
        if (!t) error = error ?? `Time não encontrado: "${alvoRaw}"`;
        else { team_id = t.id; targetLabel = t.name; }
      } else if (scope === "campaign") {
        const c = campaigns.find((x) => norm(x.name) === norm(alvoRaw));
        if (!c) error = error ?? `Campanha não encontrada: "${alvoRaw}"`;
        else { campaign_id = c.id; campaign = c.name; targetLabel = c.name; }
      }

      const period_start = parseDate(get(idx.inicio));
      const period_end = parseDate(get(idx.fim));
      if (!period_start || !period_end) error = error ?? "Período inválido (use dd/mm/aaaa)";
      else if (period_start > period_end) error = error ?? "Início maior que o fim";

      const target_mrr = parseNum(get(idx.mrr));
      const target_deals = Math.round(parseNum(get(idx.qtd)));
      const target_tpv = parseNum(get(idx.tpv));
      const target_pct = parseNum(get(idx.pct));
      if (!error && target_mrr <= 0 && target_deals <= 0 && target_tpv <= 0 && target_pct <= 0) error = "Nenhuma meta preenchida";

      parsed.push({
        line: r + 1,
        scope: scope ?? "company",
        category_id, user_id, team_id, campaign_id, campaign,
        period_start: period_start ?? "", period_end: period_end ?? "",
        target_mrr, target_deals, target_tpv, target_pct,
        origem_cliente,
        categoryLabel, targetLabel, error,
      });
    }
    setRows(parsed);
  }

  async function importRows() {
    if (!valid.length) return;
    setSaving(true);
    const payload = valid.map((r) => ({
      scope: r.scope,
      category_id: r.category_id,
      user_id: r.user_id,
      team_id: r.team_id,
      campaign_id: r.campaign_id,
      campaign: r.campaign,
      period_start: r.period_start,
      period_end: r.period_end,
      target_mrr: r.target_mrr,
      target_deals: r.target_deals,
      target_tpv: r.target_tpv,
      target_pct: r.target_pct,
      origem_cliente: r.origem_cliente,
    }));
    const { error } = await supabase.from("goals").insert(payload as any);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao importar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${payload.length} meta(s) importada(s)` });
    setRows([]); setFileName(""); setOpen(false);
    onImported();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setRows([]); setFileName(""); } }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4 mr-1" /> Importar metas</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar metas por planilha</DialogTitle>
          <DialogDescription>
            Baixe o modelo padrão, preencha e envie o arquivo (.xlsx ou .csv). Validamos categoria, escopo e período antes de gravar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download className="h-4 w-4 mr-1" /> Baixar modelo
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <span className="inline-flex items-center gap-1 h-10 px-4 rounded-md border border-input bg-background text-sm cursor-pointer hover:bg-accent">
              <FileSpreadsheet className="h-4 w-4" /> Selecionar arquivo
            </span>
          </label>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs">
              <Badge variant="outline">{valid.length} válidas</Badge>
              {invalid.length > 0 && <Badge variant="destructive">{invalid.length} com erro</Badge>}
            </div>
            <div className="border rounded-md max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linha</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Escopo / Alvo</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line}>
                      <TableCell className="text-xs">{r.line}</TableCell>
                      <TableCell className="text-xs">{r.categoryLabel}</TableCell>
                      <TableCell className="text-xs">{r.targetLabel}</TableCell>
                      <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                      <TableCell className="text-xs text-right">{r.target_mrr.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs text-right">{r.target_deals}</TableCell>
                      <TableCell className="text-xs">
                        {r.error ? <span className="text-destructive">{r.error}</span> : <span className="text-emerald-600">OK</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={importRows} disabled={saving || !valid.length}>
            Importar {valid.length > 0 ? `${valid.length} meta(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
