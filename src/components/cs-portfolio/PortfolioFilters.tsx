import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CADENCE_LABEL, ENGAGEMENT_LABEL, type CsPortfolioRow, type CsSegment } from "@/lib/csPortfolio";
import { ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { USAGE_TIERS, USAGE_TIER_LABEL } from "@/lib/productUsage";
import type { CsTag } from "@/hooks/useCsTags";

export interface PortfolioFilterState {
  q: string;
  segmentId: string;
  csUserId: string;
  plano: string;
  origem: string;
  industry: string;
  band: string;
  cadence: string;
  /** all = sem filtro; any = pelo menos 1 tag; none = sem tag; pick = qualquer das tagIds */
  tagMode: "all" | "any" | "none" | "pick";
  tagIds: string[];
  usageTier: string;
}

export const EMPTY_FILTERS: PortfolioFilterState = {
  q: "", segmentId: "all", csUserId: "all", plano: "all", origem: "all", industry: "all", band: "all", cadence: "all", tagMode: "all", tagIds: [], usageTier: "all",
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
  tags = [],
}: {
  rows: CsPortfolioRow[];
  segments: CsSegment[];
  analysts: { user_id: string; full_name: string | null; email: string | null }[];
  value: PortfolioFilterState;
  onChange: (v: PortfolioFilterState) => void;
  tags?: CsTag[];
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
      <Select value={value.usageTier} onValueChange={(v) => set({ usageTier: v })}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Uso do produto" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo uso do produto</SelectItem>
          {USAGE_TIERS.map((k) => <SelectItem key={k} value={k}>Uso: {USAGE_TIER_LABEL[k]}</SelectItem>)}
          <SelectItem value="none">Uso: sem dado</SelectItem>
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
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 justify-between font-normal px-3">
            <span className="truncate">
              {value.tagMode === "any" ? "Com pelo menos 1 tag" : value.tagMode === "none" ? "Sem tag"
                : value.tagMode === "pick" && value.tagIds.length
                  ? (value.tagIds.length === 1 ? tags.find((t) => t.id === value.tagIds[0])?.name || "1 tag" : `${value.tagIds.length} tags`)
                  : "Todas as tags"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          {([["all", "Todas as tags"], ["any", "Com pelo menos 1 tag"], ["none", "Sem tag"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ tagMode: k, tagIds: [] })}
              className={`w-full text-left rounded px-2 py-1.5 text-sm hover:bg-muted ${value.tagMode === k ? "bg-muted font-medium" : ""}`}>
              {l}
            </button>
          ))}
          {tags.length > 0 && <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">Clientes com qualquer uma das tags:</p>}
          <div className="max-h-60 overflow-y-auto">
            {tags.map((t) => {
              const checked = value.tagMode === "pick" && value.tagIds.includes(t.id);
              return (
                <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => {
                    const cur = value.tagMode === "pick" ? value.tagIds : [];
                    const next = checked ? cur.filter((x) => x !== t.id) : [...cur, t.id];
                    set({ tagIds: next, tagMode: next.length ? "pick" : "all" });
                  }} />
                  <span className="truncate">{t.name}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
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
  tagsOf: (r: CsPortfolioRow) => string[] = () => [],
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
    if (f.usageTier === "none" ? !!r.usage_tier : f.usageTier !== "all" && (r.usage_tier || "") !== f.usageTier) return false;
    if (f.cadence !== "all" && cadenceOf(r) !== f.cadence) return false;
    const rt = tagsOf(r);
    if (f.tagMode === "none" && rt.length > 0) return false;
    if (f.tagMode === "any" && rt.length === 0) return false;
    if (f.tagMode === "pick" && f.tagIds.length && !f.tagIds.some((id) => rt.includes(id))) return false;
    return true;
  });
}
