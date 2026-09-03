import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CADENCE_LABEL, ENGAGEMENT_LABEL, type CsPortfolioRow, type CsSegment } from "@/lib/csPortfolio";
import { X } from "lucide-react";

export interface PortfolioFilterState {
  q: string;
  segmentId: string;
  csUserId: string;
  plano: string;
  origem: string;
  industry: string;
  band: string;
  cadence: string;
}

export const EMPTY_FILTERS: PortfolioFilterState = {
  q: "", segmentId: "all", csUserId: "all", plano: "all", origem: "all", industry: "all", band: "all", cadence: "all",
};

function uniq(rows: CsPortfolioRow[], key: keyof CsPortfolioRow) {
  return Array.from(new Set(rows.map((r) => (r[key] as string) || "").filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function PortfolioFilters({
  rows,
  segments,
  analysts,
  value,
  onChange,
}: {
  rows: CsPortfolioRow[];
  segments: CsSegment[];
  analysts: { user_id: string; full_name: string | null; email: string | null }[];
  value: PortfolioFilterState;
  onChange: (v: PortfolioFilterState) => void;
}) {
  const set = (patch: Partial<PortfolioFilterState>) => onChange({ ...value, ...patch });
  const planos = uniq(rows, "plano");
  const origens = uniq(rows, "origem_cliente");
  const industries = uniq(rows, "industry");
  const dirty = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
      <Input
        placeholder="Buscar e-mail ou empresa..."
        value={value.q}
        onChange={(e) => set({ q: e.target.value })}
        className="col-span-2 h-9"
      />
      <Select value={value.segmentId} onValueChange={(v) => set({ segmentId: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Segmento" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os segmentos</SelectItem>
          <SelectItem value="none">Sem segmento</SelectItem>
          {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.csUserId} onValueChange={(v) => set({ csUserId: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="CS" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os CS</SelectItem>
          <SelectItem value="none">Sem CS</SelectItem>
          {analysts.map((a) => (
            <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.email || a.user_id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.plano} onValueChange={(v) => set({ plano: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Plano" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os planos</SelectItem>
          {planos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.origem} onValueChange={(v) => set({ origem: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Origem" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as origens</SelectItem>
          {origens.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.band} onValueChange={(v) => set({ band: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Engajamento" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo engajamento</SelectItem>
          {Object.entries(ENGAGEMENT_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.cadence} onValueChange={(v) => set({ cadence: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Cadência" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toda cadência</SelectItem>
          {Object.entries(CADENCE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.industry} onValueChange={(v) => set({ industry: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Ramo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os ramos</SelectItem>
          <SelectItem value="none">Sem ramo</SelectItem>
          {industries.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      {dirty && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange({ ...EMPTY_FILTERS })}>
          <X className="h-4 w-4 mr-1" /> Limpar
        </Button>
      )}
    </div>
  );
}

export function applyPortfolioFilters(
  rows: CsPortfolioRow[],
  f: PortfolioFilterState,
  cadenceOf: (r: CsPortfolioRow) => string,
) {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !`${r.email} ${r.company_name || ""}`.toLowerCase().includes(q)) return false;
    if (f.segmentId === "none" ? r.segment_id : f.segmentId !== "all" && r.segment_id !== f.segmentId) return false;
    if (f.csUserId === "none" ? r.cs_user_id : f.csUserId !== "all" && r.cs_user_id !== f.csUserId) return false;
    if (f.plano !== "all" && (r.plano || "") !== f.plano) return false;
    if (f.origem !== "all" && (r.origem_cliente || "") !== f.origem) return false;
    if (f.industry === "none" ? !!r.industry : f.industry !== "all" && (r.industry || "") !== f.industry) return false;
    if (f.band !== "all" && (r.engagement_band || "") !== f.band) return false;
    if (f.cadence !== "all" && cadenceOf(r) !== f.cadence) return false;
    return true;
  });
}
