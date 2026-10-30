/**
 * Tabela "Churn previsto": ordenação, filtros por coluna e situação derivada.
 * Funções puras para poderem ser testadas sem renderizar a tela.
 */
import type { ChurnCase } from "./projectedResultModel";
import { matchesColumnFilter } from "@/lib/pricingColumnFilter";

export type ChurnSortKey = "email" | "date" | "tipo" | "origin" | "mrr" | "situacao";
export type SortDir = "asc" | "desc";
export interface ChurnSort { key: ChurnSortKey; dir: SortDir }
export type ChurnFilters = Partial<Record<ChurnSortKey, string>>;

/** Praxe: a tabela abre com a data mais recente no topo. */
export const DEFAULT_CHURN_SORT: ChurnSort = { key: "date", dir: "desc" };
export const CHURN_COL_ORDER: ChurnSortKey[] = ["email", "date", "tipo", "origin", "mrr", "situacao"];

export const churnDateBR = (iso: string | null | undefined) =>
  iso ? iso.split("-").reverse().join("/") : "—";

/** "Churn" quando ainda vai sair; caso contrário o motivo que evitou a saída. */
export const churnSituation = (c: ChurnCase) => (c.avoided ? c.avoidedBy ?? "Evitado" : "Churn");

export const churnTipos = (cases: ChurnCase[]) =>
  [...new Set(cases.map((c) => c.tipo).filter(Boolean))].sort();

export const churnSituations = (cases: ChurnCase[]) =>
  [...new Set(cases.map(churnSituation))].sort();

export const churnOrigins = (cases: ChurnCase[]) =>
  [...new Set(cases.map((c) => (c.origin === "4blue" ? "4blue" : "Yampa")))].sort();

function sortValue(c: ChurnCase, key: ChurnSortKey): string | number {
  switch (key) {
    case "mrr": return c.mrr;
    case "date": return c.date ?? "";
    case "email": return c.email.toLowerCase();
    case "tipo": return c.tipo.toLowerCase();
    case "origin": return c.origin === "4blue" ? "4blue" : "Yampa";
    default: return churnSituation(c).toLowerCase();
  }
}

/** Ordena por uma coluna; empates caem em data decrescente e depois MRR decrescente. */
export function sortChurnCases(cases: ChurnCase[], sort: ChurnSort): ChurnCase[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...cases].sort((a, b) => {
    const av = sortValue(a, sort.key);
    const bv = sortValue(b, sort.key);
    if (av === bv) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.mrr - a.mrr;
    }
    return av > bv ? dir : -dir;
  });
}

/** Filtros por coluna: texto contém, data em DD/MM ou AAAA-MM-DD, MRR com >, <, =. */
export function filterChurnCases(cases: ChurnCase[], filters: ChurnFilters): ChurnCase[] {
  return cases.filter((c) => {
    for (const [key, raw] of Object.entries(filters) as [ChurnSortKey, string][]) {
      const q = (raw ?? "").trim();
      if (!q) continue;
      const ql = q.toLowerCase();
      switch (key) {
        case "email":
          if (!c.email.toLowerCase().includes(ql)) return false;
          break;
        case "date":
          if (!churnDateBR(c.date).includes(q) && !String(c.date ?? "").includes(q)) return false;
          break;
        case "tipo":
          if (!c.tipo.toLowerCase().includes(ql)) return false;
          break;
        case "origin":
          if (!(c.origin === "4blue" ? "4blue" : "Yampa").toLowerCase().includes(ql)) return false;
          break;
        case "mrr":
          if (!matchesColumnFilter(q, String(c.mrr), c.mrr)) return false;
          break;
        default:
          if (!churnSituation(c).toLowerCase().includes(ql)) return false;
      }
    }
    return true;
  });
}
