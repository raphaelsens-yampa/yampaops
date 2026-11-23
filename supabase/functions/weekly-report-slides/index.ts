// Gera o Report Comercial Semanal no Google Apresentações (conta Google conectada).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const GATEWAY = "https://connector-gateway.lovable.dev/google_slides/v1";
const EMU = 914400;
const PRIMARY = { red: 1 / 255, green: 184 / 255, blue: 224 / 255 };
const DARK = { red: 45 / 255, green: 9 / 255, blue: 76 / 255 };
const WHITE = { red: 1, green: 1, blue: 1 };

type Section = { title: string; head: string[]; rows: string[][] };

async function slides(path: string, body?: unknown) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "X-Connection-Api-Key": Deno.env.get("GOOGLE_SLIDES_API_KEY")!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}]: ${text}`);
  return JSON.parse(text);
}

const box = (id: string, page: string, x: number, y: number, w: number, h: number) => ({
  createShape: { objectId: id, shapeType: "TEXT_BOX", elementProperties: { pageObjectId: page, size: { width: { magnitude: w * EMU, unit: "EMU" }, height: { magnitude: h * EMU, unit: "EMU" } }, transform: { scaleX: 1, scaleY: 1, translateX: x * EMU, translateY: y * EMU, unit: "EMU" } } },
});
const style = (id: string, size: number, color: any, bold = false, cell?: { rowIndex: number; columnIndex: number }) => ({
  updateTextStyle: { objectId: id, ...(cell ? { cellLocation: cell } : {}), style: { fontFamily: "Manrope", bold, fontSize: { magnitude: size, unit: "PT" }, foregroundColor: { opaqueColor: { rgbColor: color } } }, textRange: { type: "ALL" }, fields: "fontFamily,bold,fontSize,foregroundColor" },
});
const bg = (page: string, color: any) => ({ updatePageProperties: { objectId: page, pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: color } } } }, fields: "pageBackgroundFill.solidFill.color" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!Deno.env.get("LOVABLE_API_KEY") || !Deno.env.get("GOOGLE_SLIDES_API_KEY")) return json({ error: "Conexão Google não configurada" }, 500);
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Não autenticado" }, 401);
    const { data: internal } = await sb.rpc("is_internal_user", { _user_id: u.user.id });
    if (!internal) return json({ error: "Sem permissão" }, 403);

    const { title, subtitle, sections } = await req.json() as { title: string; subtitle: string; sections: Section[] };
    if (!title || !Array.isArray(sections) || sections.length > 20) return json({ error: "Dados inválidos" }, 400);

    const pres = await slides("/presentations", { title });
    const id = pres.presentationId as string;
    const first = pres.slides?.[0]?.objectId as string;
    const reqs: any[] = [];


    reqs.push({ createSlide: { objectId: "s_cover", slideLayoutReference: { predefinedLayout: "BLANK" } } }, bg("s_cover", DARK),
      box("s_cover_t", "s_cover", 0.7, 1.8, 8.6, 1.2), { insertText: { objectId: "s_cover_t", text: title } }, style("s_cover_t", 32, WHITE, true),
      box("s_cover_s", "s_cover", 0.7, 3.1, 8.6, 0.8), { insertText: { objectId: "s_cover_s", text: subtitle } }, style("s_cover_s", 14, PRIMARY));

    sections.forEach((sec, i) => {
      const p = `slide_${i}`;
      const rows = sec.rows.slice(0, 12).map((r) => r.map((c) => String(c ?? "").slice(0, 400)));
      const cols = sec.head.length;
      reqs.push({ createSlide: { objectId: p, slideLayoutReference: { predefinedLayout: "BLANK" } } },
        { createShape: { objectId: `${p}_bar`, shapeType: "RECTANGLE", elementProperties: { pageObjectId: p, size: { width: { magnitude: 0.15 * EMU, unit: "EMU" }, height: { magnitude: 0.6 * EMU, unit: "EMU" } }, transform: { scaleX: 1, scaleY: 1, translateX: 0.5 * EMU, translateY: 0.35 * EMU, unit: "EMU" } } } },
        { updateShapeProperties: { objectId: `${p}_bar`, shapeProperties: { shapeBackgroundFill: { solidFill: { color: { rgbColor: PRIMARY } } }, outline: { propertyState: "NOT_RENDERED" } }, fields: "shapeBackgroundFill.solidFill.color,outline.propertyState" } },
        box(`${p}_t`, p, 0.8, 0.3, 8.5, 0.7), { insertText: { objectId: `${p}_t`, text: sec.title } }, style(`${p}_t`, 24, DARK, true),
        { createTable: { objectId: `${p}_tb`, elementProperties: { pageObjectId: p, size: { width: { magnitude: 9 * EMU, unit: "EMU" }, height: { magnitude: 3.8 * EMU, unit: "EMU" } }, transform: { scaleX: 1, scaleY: 1, translateX: 0.5 * EMU, translateY: 1.15 * EMU, unit: "EMU" } }, rows: rows.length + 1, columns: cols } },
        { updateTableCellProperties: { objectId: `${p}_tb`, tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: cols }, tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: DARK } } } }, fields: "tableCellBackgroundFill.solidFill.color" } });
      [sec.head, ...rows].forEach((row, r) => row.forEach((text, c) => {
        if (!text) return;
        const cell = { rowIndex: r, columnIndex: c };
        reqs.push({ insertText: { objectId: `${p}_tb`, cellLocation: cell, text } }, style(`${p}_tb`, rows.length > 8 ? 9 : 11, r === 0 ? WHITE : DARK, r === 0, cell));
      }));
    });

    if (first) reqs.push({ deleteObject: { objectId: first } });
    await slides(`/presentations/${id}:batchUpdate`, { requests: reqs });
    return json({ url: `https://docs.google.com/presentation/d/${id}/edit`, id });
  } catch (e) {
    console.error("weekly-report-slides", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
