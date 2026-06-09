import * as XLSX from "xlsx";
import type { RawRow } from "./commissioning";

// Header aliases — map possible header texts to canonical fields
const HEADER_ALIASES: Record<keyof RawRow, string[]> = {
  company_id: ["company id", "company_id"],
  customer_name: ["nome", "cliente", "customer name"],
  customer_email: ["email", "e-mail"],
  plano_atual: ["plano atual", "plano_atual"],
  inicio_vigencia: ["inicio vigencia plano", "início vigência plano", "inicio_vigencia_plano"],
  recurrence_days: ["recorrencia pagamento", "recorrência pagamento", "recurrence"],
  offer_name: ["nome oferta", "nome_oferta", "offer name"],
  price_id: ["stripe price id", "stripe_price_id", "price id"],
  gateway: ["gateway"],
  origem_cliente: ["origem cliente", "origem_cliente"],
  mrr: ["mrr", "mrr atual"],
  data_ref: ["data ref analise", "data ref análise", "data_ref"],
};

const normalize = (s: string) =>
  s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function parseExcelDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }
  const s = v.toString().trim();
  if (!s) return null;
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function parseNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = v.toString().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ParseResult {
  rows: RawRow[];
  sheetName: string;
  detectedMonth: Date | null;
  warnings: string[];
}

export async function parseImportFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  // Prefer 'Resultado da consulta', else first
  let sheetName = wb.SheetNames.find((s) => normalize(s).includes("resultado da consulta")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (matrix.length === 0) return { rows: [], sheetName, detectedMonth: null, warnings: ["Planilha vazia"] };

  const headers = matrix[0].map((h) => normalize(h?.toString() || ""));
  const warnings: string[] = [];

  // Build header index map
  const idx: Partial<Record<keyof RawRow, number>> = {};
  (Object.keys(HEADER_ALIASES) as (keyof RawRow)[]).forEach((field) => {
    for (const alias of HEADER_ALIASES[field]) {
      const i = headers.indexOf(normalize(alias));
      if (i >= 0) { idx[field] = i; break; }
    }
  });

  if (idx.mrr == null) warnings.push("Coluna 'MRR' não encontrada");
  if (idx.offer_name == null && idx.price_id == null) warnings.push("Sem coluna de Price ID nem Nome Oferta");

  const rows: RawRow[] = [];
  let detectedMonth: Date | null = null;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c == null || c === "")) continue;
    const get = <K extends keyof RawRow>(k: K) => (idx[k] != null ? row[idx[k]!] : null);

    const dataRef = parseExcelDate(get("data_ref"));
    const inicio = parseExcelDate(get("inicio_vigencia"));
    if (!detectedMonth) detectedMonth = dataRef || inicio;

    rows.push({
      company_id: get("company_id")?.toString() || null,
      customer_name: get("customer_name")?.toString() || null,
      customer_email: get("customer_email")?.toString() || null,
      plano_atual: get("plano_atual")?.toString() || null,
      inicio_vigencia: inicio,
      recurrence_days: parseNumber(get("recurrence_days")),
      offer_name: get("offer_name")?.toString() || null,
      price_id: get("price_id")?.toString() || null,
      gateway: get("gateway")?.toString() || null,
      origem_cliente: get("origem_cliente")?.toString() || null,
      mrr: parseNumber(get("mrr")),
      data_ref: dataRef,
    });
  }

  return { rows, sheetName, detectedMonth, warnings };
}
