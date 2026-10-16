import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { addedMrr } from "@/lib/stripeConversions";
import { realizedOf, targetOf, attainment, attainmentTone, arpa, type AggRow, type GoalRow } from "@/lib/onePage";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);
ChartJS.defaults.color = "#7A95A8";
ChartJS.defaults.font.size = 10;
ChartJS.defaults.borderColor = "#19293a";
ChartJS.defaults.animation = false;

const C = { bg:"#0B1824", card:"#132336", blue:"#0A84FF", green:"#22D3A0", red:"#FF4E6A", amber:"#FFB020", mute:"#7A95A8", sec:"#B0C4D0", white:"#E8F0F5", purple:"#B36BFF" };
const MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const LINE_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}},y:{beginAtZero:false}} };
const LEG_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:true,labels:{boxWidth:10}}}, scales:{y:{beginAtZero:false}} };
const BAR_OPT: any = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} };
const ds = (label: string, data: (number|null)[], color: string, extra: any = {}) => ({ label, data, borderColor: color, tension:.3, pointRadius:0, borderWidth:2, ...extra });

const brl = (v: number | null, dec = 0) => v == null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const brlK = (v: number | null) => v == null ? "—" : `${v < 0 ? "-" : ""}R$ ${(Math.abs(v) / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
const num = (v: number | null) => v == null ? "—" : Math.round(v).toLocaleString("pt-BR");
const pct = (v: number | null) => v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const toneColor = (t: string) => t === "up" ? C.green : t === "down" ? C.red : C.sec;

function Card({ children, className = "" }: any) {
  return <div className={"rounded-[10px] min-w-0 " + className} style={{ background: C.card, padding: "10px 12px" }}>{children}</div>;
}
function Mini({ children }: any) {
  return <h4 className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.mute }}>{children}</h4>;
}
function ChartBox({ title, children, h = "h-[200px]" }: any) {
  return <Card><Mini>{title}</Mini><div className={"relative " + h}>{children}</div></Card>;
}

interface Kpi { label: string; value: string; sub: string; note: string; tone: "up" | "down" | "flat" }
function KpiCard({ k }: { k: Kpi }) {
  return <Card><div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: C.mute }}>{k.label}</div>
    <div className="text-[26px] font-extrabold leading-none">{k.value}</div>
    <div className="text-[11px] mt-1.5" style={{ color: C.mute }}>{k.sub}</div>
    {k.note && <div className="text-[12px] font-bold mt-1" style={{ color: toneColor(k.tone) }}>{k.note}</div>}</Card>;
}

function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }
function nextMonth(ym: string) { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; }

function useOnePage(ym: string) {
  const year = ym.slice(0, 4);
  return useQuery({
    queryKey: ["onepage", ym],
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const until = nextMonth(ym);
      const lastTrial = await supabase.from("metas_trials_daily").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
      const snap = lastTrial.data?.data;
      const [agg, goals, daily, pre, conv, trials] = await Promise.all([
        supabase.from("metabase_monthly_agg").select("metric_key, year_month, category_id, realized_amount, deals_count")
          .eq("scope", "company").is("origem_cliente", null).gte("year_month", `${year}-01-01`).lte("year_month", `${year}-12-01`),
        supabase.from("goals").select("category_id, period_start, target_mrr, target_deals, target_pct")
          .eq("scope", "company").is("team_id", null).is("user_id", null).is("campaign_id", null).is("origem_cliente", null)
          .gte("period_start", `${year}-01-01`).lte("period_start", `${year}-12-31`),
        fetchAllPaged<any>(() => supabase.from("metas_snapshot_diario").select("data, metric_key, realized_amount, deals_count")
          .eq("scope", "company").is("origem_cliente", null).eq("year_month", ym)
          .in("metric_key", ["total_mrr", "ativos_pagantes", "new_mrr", "churn_mrr"]).order("data").order("id")),
        supabase.from("metas_pre_churn").select("email_norm, data_ref").order("data_ref", { ascending: false }).limit(1000),
        fetchAllPaged<any>(() => supabase.from("stripe_conversions").select("area, conversion_type, mrr, mrr_net, delta_mrr")
          .gte("converted_at", `${ym}T00:00:00-03:00`).lt("converted_at", `${until}T00:00:00-03:00`)
          .in("conversion_type", ["new", "upsell"]).order("id")),
        snap ? fetchAllPaged<any>(() => supabase.from("metas_trials_daily").select("company_id, data_freetrial").eq("data", snap)
          .gte("data_freetrial", ym).lt("data_freetrial", until).order("id")) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [agg, goals, daily, pre, conv, trials]) if (r.error) throw new Error(typeof r.error === "string" ? r.error : r.error.message);
      return { agg: (agg.data ?? []) as AggRow[], goals: (goals.data ?? []) as GoalRow[], daily: daily.data ?? [], pre: pre.data ?? [], conv: conv.data ?? [], trials: (trials.data ?? []) as { company_id: number | null; data_freetrial: string | null }[] };
    },
  });
}

const PDF_ID = "onepage-content";

export default function OnePageDiretoria() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ym, setYm] = useState(() => monthKey(new Date()));
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading, error } = useOnePage(ym);

  useEffect(() => {
    const main = rootRef.current?.closest("main") as HTMLElement | null;
    if (!main) return;
    const prev = { bg: main.style.background, padding: main.style.padding, color: main.style.color };
    main.style.background = C.bg; main.style.padding = "0"; main.style.color = C.white;
    return () => { main.style.background = prev.bg; main.style.padding = prev.padding; main.style.color = prev.color; };
  }, []);

  const monthOptions = useMemo(() => {
    const now = new Date(); const out: string[] = [];
    for (let i = 0; i < 12; i++) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    return out;
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const row = (metric: string, month = ym) => data.agg.find(a => a.metric_key === metric && a.year_month === month);
    const goalOf = (r: AggRow | undefined, month = ym) => r?.category_id ? data.goals.find(g => g.category_id === r.category_id && g.period_start.slice(0, 7) === month.slice(0, 7)) : undefined;
    const metric = (key: string, month = ym) => { const r = row(key, month); const real = realizedOf(r); const target = targetOf(goalOf(r, month)); const p = attainment(real, target); return { real, target, pct: p, tone: attainmentTone(key, p) }; };

    const mrr = metric("total_mrr"), net = metric("net_mrr"), at = metric("ativos_pagantes"), churnPct = metric("churn_pct");
    const latestPre = data.pre[0]?.data_ref;
    const preCount = latestPre ? new Set(data.pre.filter(p => p.data_ref === latestPre).map(p => p.email_norm)).size : null;
    const kpis: Kpi[] = [
      { label: "MRR Atual", value: brlK(mrr.real), sub: `Meta ${brlK(mrr.target)}`, note: mrr.pct != null ? `${pct(mrr.pct)} atingido` : "", tone: mrr.tone },
      { label: "Net MRR", value: brlK(net.real), sub: `Meta ${brlK(net.target)}`, note: net.pct != null ? `${pct(net.pct)} atingido` : "", tone: net.tone },
      { label: "Ativos Pagantes", value: num(at.real), sub: `Meta ${num(at.target)}`, note: at.pct != null ? `${pct(at.pct)} atingido` : "", tone: at.tone },
      { label: "Churn % (logos)", value: pct(churnPct.real), sub: churnPct.target != null ? `Meta ${pct(churnPct.target)}` : "Sem meta cadastrada", note: "", tone: "flat" },
      { label: "ARPA", value: brl(arpa(mrr.real, at.real), 2), sub: "MRR ÷ ativos", note: "", tone: "flat" },
      { label: "Pré-churn", value: num(preCount), sub: latestPre ? `clientes em risco · ${latestPre.split("-").reverse().join("/")}` : "sem dados", note: "", tone: "flat" },
    ];

    const flows: [string, string][] = [["New MRR (vendas)", "new_mrr"], ["Recuperados", "recuperados_mrr"], ["Upsell", "upsell_mrr"], ["Churn de MRR", "churn_mrr"], ["Downsell", "downsell_mrr"], ["Churn de Logos", "churn_qtd"], ["MRR yampa 2.0", "stripe_mrr_yampa20"], ["Ativos yampa 2.0", "stripe_ativos_yampa20"]];
    const goalsRows = flows.map(([label, key]) => {
      const m = metric(key); const isCount = key === "churn_qtd" || key === "stripe_ativos_yampa20";
      return { label, real: isCount ? num(m.real) : brl(m.real), target: m.target == null ? "—" : isCount ? num(m.target) : brl(m.target), pct: m.pct, tone: m.tone };
    });

    const months = MES.map((_, i) => `${ym.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`).filter(m => m <= ym);
    const yearly = {
      labels: months.map(m => MES[Number(m.slice(5, 7)) - 1]),
      mrr: months.map(m => metric("total_mrr", m).real), mrrMeta: months.map(m => metric("total_mrr", m).target),
      at: months.map(m => metric("ativos_pagantes", m).real), atMeta: months.map(m => metric("ativos_pagantes", m).target),
      ating: months.map(m => metric("total_mrr", m).pct),
    };

    const days = [...new Set(data.daily.map((d: any) => d.data as string))].sort();
    const dv = (key: string, count = false) => days.map(d => { const r: any = data.daily.find((x: any) => x.data === d && x.metric_key === key); return r ? Number(count ? r.deals_count : r.realized_amount) : null; });
    const daily = { labels: days.map(d => d.slice(8, 10) + "/" + d.slice(5, 7)), mrr: dv("total_mrr"), at: dv("ativos_pagantes", true), novo: dv("new_mrr"), churn: dv("churn_mrr") };

    const trialSet = new Map<string, Set<string>>();
    for (const t of data.trials) { const d = String(t.data_freetrial ?? "").slice(0, 10); if (!d) continue; const s = trialSet.get(d) ?? new Set(); s.add(String(t.company_id)); trialSet.set(d, s); }
    const trialDays = [...trialSet.keys()].sort();
    const trialsTotal = new Set(data.trials.map(t => String(t.company_id))).size;
    const trials = { labels: trialDays.map(d => d.slice(8, 10) + "/" + d.slice(5, 7)), per: trialDays.map(d => trialSet.get(d)!.size), total: trialsTotal };
    const areas = new Map<string, { qtd: number; mrr: number }>();
    for (const c of data.conv as any[]) {
      const v = addedMrr(c, "gross"); if (v <= 0) continue;
      const a = areas.get(c.area || "Sem área") ?? { qtd: 0, mrr: 0 }; a.qtd++; a.mrr += v; areas.set(c.area || "Sem área", a);
    }
    const byArea = [...areas.entries()].sort((a, b) => b[1].mrr - a[1].mrr);
    return { kpis, goalsRows, yearly, daily, byArea, trials };
  }, [data, ym]);

  const label = new Date(`${ym}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const downloadPdf = async () => {
    const src = document.getElementById(PDF_ID); if (!src || downloading) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(src, { backgroundColor: C.bg, scale: 2, logging: false });
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 18;
      const ratio = Math.min((pw - m * 2) / canvas.width, (ph - m * 2) / canvas.height);
      pdf.setFillColor(11, 24, 36); pdf.rect(0, 0, pw, ph, "F");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw - canvas.width * ratio) / 2, m, canvas.width * ratio, canvas.height * ratio, undefined, "FAST");
      pdf.save(`OnePage-Diretoria-${ym.slice(0, 7)}.pdf`);
    } finally { setDownloading(false); }
  };

  return (
    <Layout>
      <div ref={rootRef} className="min-h-screen" style={{ color: C.white, background: C.bg, fontFamily: "-apple-system,Segoe UI,Roboto,Calibri,sans-serif" }}>
        <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ background: C.bg + "f0", borderColor: "#16283b" }}>
          <h1 className="text-[18px] font-extrabold uppercase tracking-tight">One Page · Diretoria</h1>
          <div className="flex items-center gap-2">
            <select value={ym} onChange={e => setYm(e.target.value)} aria-label="Mês" className="rounded-full px-3 py-1.5 text-[13px]" style={{ background: "#16283b", color: C.white, border: "1px solid #23415c" }}>
              {monthOptions.map(m => <option key={m} value={m}>{new Date(`${m}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</option>)}
            </select>
            <button onClick={downloadPdf} disabled={downloading || !view} className="text-[13px] font-semibold px-4 py-1.5 rounded-full disabled:opacity-60" style={{ color: "#fff", background: C.blue }}>
              {downloading ? "Gerando PDF…" : "⬇ Baixar PDF"}
            </button>
          </div>
        </div>

        <div id={PDF_ID} className="px-4 py-3 space-y-2">
          <div className="text-[11px]" style={{ color: C.mute }}>Período: {label} · Metas e realizado das Metas Estratégicas (Metabase) · Conversões do Stripe/Parceria</div>
          {isLoading && <Card>Carregando…</Card>}
          {error && <Card><span style={{ color: C.red }}>Não foi possível carregar os dados. Tente recarregar a página.</span></Card>}
          {view && <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">{view.kpis.map(k => <KpiCard key={k.label} k={k} />)}</div>

            <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
              <Card className="lg:col-span-1"><Mini>Metas do mês — realizado × meta</Mini>
                <table className="w-full text-[12.5px]"><thead><tr style={{ color: C.mute }}><th className="text-left font-normal py-1">Indicador</th><th className="text-right font-normal">Realizado</th><th className="text-right font-normal">Meta</th><th className="text-right font-normal">%</th></tr></thead>
                  <tbody>{view.goalsRows.map(r => <tr key={r.label} style={{ borderTop: "1px solid #19293a" }}><td className="py-1.5">{r.label}</td><td className="text-right">{r.real}</td><td className="text-right" style={{ color: C.mute }}>{r.target}</td><td className="text-right font-bold" style={{ color: toneColor(r.tone) }}>{pct(r.pct)}</td></tr>)}</tbody></table>
                <div className="text-[10.5px] mt-2" style={{ color: C.mute }}>Em Churn e Downsell, acima de 100% indica perda acima do orçado.</div>
              </Card>
              <ChartBox title={`MRR mensal × Meta — ${ym.slice(0, 4)}`}><Line data={{ labels: view.yearly.labels, datasets: [ds("MRR", view.yearly.mrr, C.blue, { pointRadius: 2 }), ds("Meta", view.yearly.mrrMeta, C.red, { borderDash: [5, 4] })] }} options={LEG_OPT} /></ChartBox>
              <ChartBox title={`Ativos Pagantes × Meta — ${ym.slice(0, 4)}`}><Line data={{ labels: view.yearly.labels, datasets: [ds("Ativos", view.yearly.at, C.purple, { pointRadius: 2 }), ds("Meta", view.yearly.atMeta, C.red, { borderDash: [5, 4] })] }} options={LEG_OPT} /></ChartBox>
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <ChartBox title="MRR diário"><Line data={{ labels: view.daily.labels, datasets: [ds("MRR", view.daily.mrr, C.blue, { fill: true, backgroundColor: "rgba(10,132,255,.12)" })] }} options={LINE_OPT} /></ChartBox>
              <ChartBox title="Ativos diários"><Line data={{ labels: view.daily.labels, datasets: [ds("Ativos", view.daily.at, C.purple)] }} options={LINE_OPT} /></ChartBox>
              <ChartBox title="New MRR × Churn MRR (acumulado no mês)"><Line data={{ labels: view.daily.labels, datasets: [ds("New MRR", view.daily.novo, C.green), ds("Churn MRR", view.daily.churn, C.red)] }} options={LEG_OPT} /></ChartBox>
              <ChartBox title="Atingimento MRR por mês (%)"><Bar data={{ labels: view.yearly.labels, datasets: [{ label: "%", data: view.yearly.ating, backgroundColor: view.yearly.ating.map(v => v != null && v >= 100 ? C.green : C.amber) }] }} options={BAR_OPT} /></ChartBox>
            </div>

            <ChartBox title={`Free trials iniciados por dia — ${view.trials.total} no mês`}><Bar data={{ labels: view.trials.labels, datasets: [{ label: "Trials", data: view.trials.per, backgroundColor: C.amber }] }} options={BAR_OPT} /></ChartBox>

            <Card><Mini>Conversões do mês por área (novas vendas, recuperações e upsell)</Mini>
              {view.byArea.length === 0 ? <div className="text-[12px]" style={{ color: C.mute }}>Nenhuma conversão no mês.</div> :
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">{view.byArea.map(([area, v]) => <div key={area}><div className="text-[11px] uppercase" style={{ color: C.mute }}>{area}</div><div className="text-[18px] font-extrabold">{v.qtd}</div><div className="text-[12px]" style={{ color: C.green }}>{brl(v.mrr)}</div></div>)}</div>}
            </Card>
          </>}
        </div>
      </div>
    </Layout>
  );
}
