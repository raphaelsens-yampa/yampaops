import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart as PieChartIcon, Download, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MapStripePriceButton } from "@/components/MapStripePriceButton";
import { EditConversionDialog } from "@/components/stripe/EditConversionDialog";

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const AREA_COLORS: Record<string, string> = {
  Sales: "hsl(193 99% 44%)",
  CX: "hsl(264 90% 47%)",
  Marketing: "hsl(35 92% 55%)",
  Produto: "hsl(150 60% 45%)",
  Parceria: "hsl(280 70% 55%)",
  YampaFin: "hsl(340 75% 55%)",
  desconhecida: "hsl(220 10% 60%)",
};

const planColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 55%)`;
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => s ? format(new Date(s), "dd/MM/yyyy", { locale: ptBR }) : "—";
const toIso = (d: Date) => d.toISOString().slice(0, 10);

// Mês (YYYY-MM) sempre no fuso America/Sao_Paulo
const SP_MONTH_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
});
const monthKeySP = (iso: string) => {
  const parts = SP_MONTH_FMT.formatToParts(new Date(iso));
  const y = parts.find(p => p.type === "year")?.value ?? "";
  const m = parts.find(p => p.type === "month")?.value ?? "";
  return `${y}-${m}`;
};


interface Conversion {
  id: string;
  customer_email: string | null;
  area: string;
  product_name: string | null;
  plan_name: string | null;
  mrr: number;
  matched_opportunity_id: string | null;
  registered_at: string | null;
  converted_at: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_customer_id: string | null;
  conversion_type: string;
  previous_mrr: number;
  previous_price_id: string | null;
  delta_mrr: number;
  assigned_seller_id: string | null;
  attribution_source: string | null;
  is_reactivation: boolean | null;
  previous_churn_at: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  discount_amount: number | null;
  mrr_net: number | null;
  coupon_id: string | null;
  coupon_name: string | null;
  coupon_percent_off: number | null;
  coupon_amount_off: number | null;
  promotion_code: string | null;
  discount_duration: string | null;
  stripe_invoice_id: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  new: "Nova",
  upsell: "Upsell",
  downgrade: "Downgrade",
  renewal: "Renovação",
};
const TYPE_COLOR: Record<string, string> = {
  new: "hsl(193 99% 44%)",
  upsell: "hsl(150 60% 45%)",
  downgrade: "hsl(0 75% 55%)",
  renewal: "hsl(220 10% 60%)",
};
const SOURCE_LABEL: Record<string, string> = {
  chatwoot: "Chatwoot",
  campaign: "Campanha",
  previous_conversion: "Cliente recorrente",
  manual: "Manual",
};

const PERIOD_PRESETS = [
  { key: "this_month", label: "Este mês" },
  { key: "last_30", label: "Últimos 30 dias" },
  { key: "last_90", label: "Últimos 90 dias" },
  { key: "ytd", label: "Ano atual" },
  { key: "custom", label: "Personalizado" },
];

function presetRange(key: string): { start: string; end: string } {
  const today = new Date();
  if (key === "this_month") return { start: toIso(startOfMonth(today)), end: toIso(endOfMonth(today)) };
  if (key === "last_30") return { start: toIso(subDays(today, 30)), end: toIso(today) };
  if (key === "last_90") return { start: toIso(subDays(today, 90)), end: toIso(today) };
  if (key === "ytd") return { start: toIso(new Date(today.getFullYear(), 0, 1)), end: toIso(today) };
  return { start: toIso(subDays(today, 30)), end: toIso(today) };
}

export default function StripeConversions() {
  const { role } = useAuth();
  const { toast } = useToast();
  if (role !== "admin" && role !== "tatico") return <Navigate to="/" replace />;

  const [periodPreset, setPeriodPreset] = useState("last_90");
  const [period, setPeriod] = useState(() => presetRange("last_90"));
  const [safraEnabled, setSafraEnabled] = useState(false);
  const [safra, setSafra] = useState(() => presetRange("ytd"));
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all"); // all | none
  const [reactivationOnly, setReactivationOnly] = useState(false);
  const [couponOnly, setCouponOnly] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [backfillingNet, setBackfillingNet] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [mrrMode, setMrrMode] = useState<"net" | "gross">("net");
  const [activeTab, setActiveTab] = useState("overview");
  const [editing, setEditing] = useState<import("@/components/stripe/EditConversionDialog").ConversionToEdit | null>(null);

  // Valor de referência da linha conforme o modo (líquido cai para bruto quando ausente)
  const valueOf = (r: Conversion) =>
    mrrMode === "net" ? Number(r.mrr_net ?? r.mrr ?? 0) : Number(r.mrr ?? 0);


  function changePreset(p: string) {
    setPeriodPreset(p);
    if (p !== "custom") setPeriod(presetRange(p));
  }

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["stripe-conversions", period, safraEnabled, safra, areaFilter, typeFilter, sellerFilter, reactivationOnly, couponOnly],
    queryFn: async () => {
      let q = supabase
        .from("stripe_conversions")
        .select("id, customer_email, area, product_name, plan_name, mrr, matched_opportunity_id, registered_at, converted_at, stripe_subscription_id, stripe_price_id, stripe_customer_id, conversion_type, previous_mrr, previous_price_id, delta_mrr, assigned_seller_id, attribution_source, is_reactivation, previous_churn_at, gross_amount, net_amount, discount_amount, mrr_net, coupon_id, coupon_name, coupon_percent_off, coupon_amount_off, promotion_code, discount_duration, stripe_invoice_id")
        .gte("converted_at", `${period.start}T00:00:00`)
        .lte("converted_at", `${period.end}T23:59:59`)
        // Só conversões com valor > R$ 0 (líquido quando disponível)
        .or("mrr_net.gt.0,and(mrr_net.is.null,mrr.gt.0)")
        .order("converted_at", { ascending: false });

      if (safraEnabled) {
        q = q.gte("registered_at", `${safra.start}T00:00:00`).lte("registered_at", `${safra.end}T23:59:59`);
      }
      if (areaFilter !== "all") q = q.eq("area", areaFilter);
      if (typeFilter !== "all") q = q.eq("conversion_type", typeFilter);
      if (sellerFilter === "none") q = q.is("assigned_seller_id", null);
      if (reactivationOnly) q = q.eq("is_reactivation", true);
      if (couponOnly) q = q.not("coupon_id", "is", null);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data || []) as Conversion[];
    },
  });

  const { data: areaOptions = [] } = useQuery({
    queryKey: ["price-map-areas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_price_map")
        .select("area")
        .not("area", "is", null);
      if (error) throw error;
      const set = new Set<string>((data || []).map((r: any) => r.area).filter(Boolean));
      set.add("desconhecida");
      return Array.from(set).sort();
    },
  });

  const { data: sellersMap = {} } = useQuery({
    queryKey: ["profiles-map-for-stripe-conv"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { m[p.user_id] = p.full_name || p.email || p.user_id.slice(0, 8); });
      return m;
    },
  });

  // De-para canônico (commission_price_map) para o painel de saúde
  const { data: priceMap = {} } = useQuery({
    queryKey: ["price-map-canonical"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_price_map")
        .select("price_id, area, offer_name, plan_name");
      if (error) throw error;
      const m: Record<string, { area: string | null; offer_name: string | null; plan_name: string | null }> = {};
      (data || []).forEach((r: any) => { if (r.price_id) m[r.price_id] = r; });
      return m;
    },
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const totalMrr = rows.reduce((s, r) => s + valueOf(r), 0);
    const areasCount = new Set(rows.map(r => r.area)).size;
    const newMrr = rows
      .filter(r => r.conversion_type === "new")
      .reduce((s, r) => s + valueOf(r), 0);
    const newCount = rows.filter(r => r.conversion_type === "new").length;
    const expansionMrr = rows
      .filter(r => r.conversion_type === "upsell")
      .reduce((s, r) => s + Number(r.delta_mrr || 0), 0);
    const contractionMrr = rows
      .filter(r => r.conversion_type === "downgrade")
      .reduce((s, r) => s + Number(r.delta_mrr || 0), 0);
    const renewalMrr = rows
      .filter(r => r.conversion_type === "renewal")
      .reduce((s, r) => s + valueOf(r), 0);
    const renewalCount = rows.filter(r => r.conversion_type === "renewal").length;
    const upsellCount = rows.filter(r => r.conversion_type === "upsell").length;
    const downgradeCount = rows.filter(r => r.conversion_type === "downgrade").length;
    const noSellerCount = rows.filter(r => !r.assigned_seller_id).length;
    const reactivationCount = rows.filter(r => r.is_reactivation).length;
    return {
      total, totalMrr, areasCount, ticketMedio: total ? totalMrr / total : 0,
      newMrr, newCount, expansionMrr, upsellCount, contractionMrr, downgradeCount,
      renewalMrr, renewalCount, noSellerCount, reactivationCount,
    };
  }, [rows, mrrMode]);

  const health = useMemo(() => {
    let missingMap = 0, divergent = 0, missingNet = 0;
    const divergentSamples: Array<{ price_id: string; from: string; to: string }> = [];
    const netGaps = new Map<string, { price_id: string; plan: string; product: string; area: string; count: number; mrrBruto: number }>();
    for (const r of rows) {
      if (r.mrr_net == null) {
        missingNet++;
        const pid = r.stripe_price_id || "sem price_id";
        const cur = netGaps.get(pid) || {
          price_id: pid,
          plan: r.plan_name?.trim() || "Sem plano",
          product: r.product_name?.trim() || "—",
          area: r.area || "—",
          count: 0,
          mrrBruto: 0,
        };
        cur.count += 1;
        cur.mrrBruto += Number(r.mrr || 0);
        netGaps.set(pid, cur);
      }
      if (!r.stripe_price_id) continue;
      const m = priceMap[r.stripe_price_id];
      if (!m) { missingMap++; continue; }
      if (m.area && m.area !== r.area) {
        divergent++;
        if (divergentSamples.length < 5 && !divergentSamples.some(d => d.price_id === r.stripe_price_id)) {
          divergentSamples.push({ price_id: r.stripe_price_id, from: r.area, to: m.area });
        }
      }
    }
    const missingNetPrices = Array.from(netGaps.values()).sort((a, b) => b.count - a.count);
    return { missingMap, divergent, missingNet, divergentSamples, missingNetPrices };
  }, [rows, priceMap]);



  async function handleReprocessReactivations() {
    if (!confirm(`Reprocessar reativações no período ${period.start} → ${period.end}?`)) return;
    setReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-backfill-reactivations", {
        body: { from: `${period.start}T00:00:00`, to: `${period.end}T23:59:59`, limit: 2000 },
      });
      if (error) throw error;
      toast({
        title: "Reprocessamento concluído",
        description: `Analisadas ${data?.scanned ?? 0} conversões · ${data?.marked ?? 0} marcadas como reativação`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setReprocessing(false);
    }
  }

  async function handleBackfillNetAmounts() {
    if (!confirm(`Buscar valores líquidos (com cupom) para conversões no período ${period.start} → ${period.end}?\n\nPreenche gross_amount, net_amount, discount_amount, mrr_net e cupom nas conversões que ainda não têm esses dados.`)) return;
    setBackfillingNet(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-backfill-net-amounts", {
        body: { from: `${period.start}T00:00:00`, to: `${period.end}T23:59:59`, limit: 2000, only_missing: true },
      });
      if (error) throw error;
      toast({
        title: "Backfill concluído",
        description: `Analisadas ${data?.scanned ?? 0} · atualizadas ${data?.updated ?? 0} · sem invoice ${data?.skipped_no_invoice ?? 0} · erros ${data?.failed ?? 0}`,
      });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBackfillingNet(false);
    }
  }

  async function handleReapplyPriceMap() {
    if (!confirm(`Reaplicar o de-para canônico nas conversões de ${period.start} até ${period.end}?\n\nPrimeiro será feita uma prévia das alterações e, em seguida, a atualização será confirmada.`)) return;
    setReapplying(true);
    try {
      const body = { from: `${period.start}T00:00:00`, to: `${period.end}T23:59:59`, dry_run: true, limit: 20000 };
      const preview = await supabase.functions.invoke("stripe-reapply-price-map", { body });
      if (preview.error) throw preview.error;
      const count = preview.data?.would_change ?? 0;
      if (!count || !confirm(`${count} conversão(ões) serão corrigidas. Confirmar atualização?`)) return;
      const { data, error } = await supabase.functions.invoke("stripe-reapply-price-map", {
        body: { ...body, dry_run: false },
      });
      if (error) throw error;
      toast({ title: "De-para reaplicado", description: `${data?.updated ?? 0} conversão(ões) atualizadas · ${data?.failed ?? 0} erro(s)` });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao reaplicar de-para", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setReapplying(false);
    }
  }

  const byArea = useMemo(() => {
    const map = new Map<string, { area: string; conversoes: number; mrr: number }>();
    for (const r of rows) {
      const cur = map.get(r.area) || { area: r.area, conversoes: 0, mrr: 0 };
      cur.conversoes += 1;
      cur.mrr += valueOf(r);
      map.set(r.area, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows, mrrMode]);

  const timeSeries = useMemo(() => {
    const map = new Map<string, Record<string, number> & { mes: string }>();
    for (const r of rows) {
      if (!r.converted_at) continue;
      const key = monthKeySP(r.converted_at);
      const cur = map.get(key) || ({ mes: key } as any);
      cur[r.area] = (cur[r.area] || 0) + valueOf(r);
      cur._total = (cur._total || 0) + valueOf(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [rows, mrrMode]);

  const visibleAreas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => s.add(r.area));
    return Array.from(s);
  }, [rows]);

  const bySeller = useMemo(() => {
    const map = new Map<string, { seller_id: string; name: string; conversoes: number; mrr: number }>();
    for (const r of rows) {
      if (!r.assigned_seller_id) continue;
      const cur = map.get(r.assigned_seller_id) || {
        seller_id: r.assigned_seller_id,
        name: sellersMap[r.assigned_seller_id] || r.assigned_seller_id.slice(0, 8),
        conversoes: 0,
        mrr: 0,
      };
      cur.conversoes += 1;
      cur.mrr += valueOf(r);
      map.set(r.assigned_seller_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows, mrrMode, sellersMap]);

  const byPlan = useMemo(() => {
    const map = new Map<string, { plan: string; conversoes: number; mrr: number }>();
    for (const r of rows) {
      const plan = r.plan_name?.trim() || "Sem plano";
      const cur = map.get(plan) || { plan, conversoes: 0, mrr: 0 };
      cur.conversoes += 1;
      cur.mrr += valueOf(r);
      map.set(plan, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows, mrrMode]);

  const sellerPlanSales = useMemo(() => {
    const map = new Map<string, { seller_id: string; seller_name: string; plan: string; quantidade: number; mrr: number }>();
    for (const r of rows) {
      if (r.conversion_type !== "new" || !r.assigned_seller_id) continue;
      const plan = r.plan_name?.trim() || "Sem plano";
      const key = `${r.assigned_seller_id}-${plan}`;
      const cur = map.get(key) || {
        seller_id: r.assigned_seller_id,
        seller_name: sellersMap[r.assigned_seller_id] || r.assigned_seller_id.slice(0, 8),
        plan,
        quantidade: 0,
        mrr: 0,
      };
      cur.quantidade += 1;
      cur.mrr += valueOf(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows, mrrMode, sellersMap]);

  const sellerOptions = useMemo(() => {
    return Object.entries(sellersMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sellersMap]);

  function exportCSV() {
    const data = rows.map(r => ({
      Primeiro_Pagamento: fmtDate(r.converted_at),
      Cliente_Desde: fmtDate(r.registered_at),
      Tipo: TYPE_LABEL[r.conversion_type] || r.conversion_type,
      Area: r.area,
      Produto: r.product_name || "",
      Plano: r.plan_name || "",
      Email: r.customer_email || "",
      MRR_Bruto: Number(r.mrr || 0),
      MRR_Liquido: r.mrr_net == null ? "" : Number(r.mrr_net),
      MRR_Considerado: valueOf(r),
      Delta_MRR: Number(r.delta_mrr || 0),
      Reativacao: r.is_reactivation ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversoes");
    const buf = XLSX.write(wb, { bookType: "csv", type: "array" });
    saveAs(new Blob([buf], { type: "text/csv;charset=utf-8" }), `conversoes_stripe_${period.start}_${period.end}.csv`);
  }

  function exportXLSX() {
    const data = rows.map(r => ({
      "1º Pagamento": fmtDate(r.converted_at),
      "Cliente desde": fmtDate(r.registered_at),
      "Tipo": TYPE_LABEL[r.conversion_type] || r.conversion_type,
      "Área": r.area,
      "Produto": r.product_name || "",
      "Plano": r.plan_name || "",
      "Email": r.customer_email || "",
      "MRR bruto (R$)": Number(r.mrr || 0),
      "MRR líquido (R$)": r.mrr_net == null ? "" : Number(r.mrr_net),
      "MRR considerado (R$)": valueOf(r),
      "Δ MRR (R$)": Number(r.delta_mrr || 0),
      "Reativação": r.is_reactivation ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversões");
    const resumo = byArea.map(a => ({ "Área": a.area, "Conversões": a.conversoes, [`MRR ${mrrMode === "net" ? "líquido" : "bruto"} (R$)`]: a.mrr }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo por Área");
    const tipos = [
      { Tipo: "Nova venda", MRR: stats.newMrr, Quantidade: stats.newCount },
      { Tipo: "Expansão", MRR: stats.expansionMrr, Quantidade: stats.upsellCount },
      { Tipo: "Contração", MRR: stats.contractionMrr, Quantidade: stats.downgradeCount },
      { Tipo: "Renovação", MRR: stats.renewalMrr, Quantidade: stats.renewalCount },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tipos), "Resumo por Tipo");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `conversoes_stripe_${period.start}_${period.end}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    const metricLabel = mrrMode === "net" ? "MRR líquido" : "MRR bruto";
    doc.setFontSize(14);
    doc.text(`Conversões Stripe por Área`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Período: ${period.start} → ${period.end}${safraEnabled ? ` | Safra: ${safra.start} → ${safra.end}` : ""}`, 14, 24);
    doc.text(`Total: ${stats.total} conversões | ${metricLabel}: ${fmtBRL(stats.totalMrr)} | Áreas: ${stats.areasCount}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [["Área", "Conversões", `${metricLabel} (R$)`]],
      body: byArea.map(a => [a.area, a.conversoes, fmtBRL(a.mrr)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [5, 32, 51] },
    });

    const startY = (doc as any).lastAutoTable?.finalY + 8 || 80;
    autoTable(doc, {
      startY,
      head: [["1º Pagamento", "Cliente desde", "Tipo", "Área", "Produto", "Plano", "Email", "MRR considerado"]],
      body: rows.map(r => [
        fmtDate(r.converted_at), fmtDate(r.registered_at), TYPE_LABEL[r.conversion_type] || r.conversion_type, r.area,
        r.product_name || "", r.plan_name || "", r.customer_email || "", fmtBRL(valueOf(r)),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [5, 32, 51] },
    });

    doc.save(`conversoes_stripe_${period.start}_${period.end}.pdf`);
  }


  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <PieChartIcon className="h-6 w-6 text-primary" />
              Conversões por Área
            </h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de todas as conversões pagas vindas do Stripe, classificadas por área do produto.</p>
          </div>
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <>
                <Button variant="outline" size="sm" onClick={handleBackfillNetAmounts} disabled={backfillingNet}>
                  {backfillingNet ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Buscar valor líquido
                </Button>
                <Button variant="outline" size="sm" onClick={handleReapplyPriceMap} disabled={reapplying}>
                  {reapplying ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reaplicar de-para
                </Button>
                <Button variant="outline" size="sm" onClick={handleReprocessReactivations} disabled={reprocessing}>
                  {reprocessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reprocessar reativações
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!rows.length}>
                  <Download className="h-4 w-4 mr-2" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCSV}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportXLSX}>Excel (XLSX)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPDF}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Período de conversão</Label>
                <Select value={periodPreset} onValueChange={changePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {periodPreset === "custom" && (
                  <div className="flex gap-2 mt-1">
                    <Input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })} />
                    <Input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-2">
                  <input type="checkbox" checked={safraEnabled} onChange={e => setSafraEnabled(e.target.checked)} />
                  Filtrar por safra (data de cadastro)
                </Label>
                {safraEnabled && (
                  <div className="flex gap-2">
                    <Input type="date" value={safra.start} onChange={e => setSafra({ ...safra, start: e.target.value })} />
                    <Input type="date" value={safra.end} onChange={e => setSafra({ ...safra, end: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {areaOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="new">Nova</SelectItem>
                    <SelectItem value="upsell">Upsell</SelectItem>
                    <SelectItem value="downgrade">Downgrade</SelectItem>
                    <SelectItem value="renewal">Renovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vendedor</Label>
                <Select value={sellerFilter} onValueChange={setSellerFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="none">Sem vendedor atribuído</SelectItem>
                    {sellerOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-2 mt-5">
                  <input type="checkbox" checked={reactivationOnly} onChange={e => setReactivationOnly(e.target.checked)} />
                  Somente reativações
                </Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-2 mt-5">
                  <input type="checkbox" checked={couponOnly} onChange={e => setCouponOnly(e.target.checked)} />
                  Somente com cupom
                </Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Métrica de MRR</Label>
                <Select value={mrrMode} onValueChange={(v) => setMrrMode(v as "net" | "gross")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net">Líquido (fallback bruto)</SelectItem>
                    <SelectItem value="gross">Bruto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {mrrMode === "net" && health.missingNet > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <span>{health.missingNet} conversão(ões) sem valor líquido; o cálculo usa o MRR bruto nessas linhas.</span>
            {role === "admin" && <Button variant="outline" size="sm" onClick={handleBackfillNetAmounts} disabled={backfillingNet}>Buscar valor líquido</Button>}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="detail">Detalhamento</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Conversões</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{mrrMode === "net" ? "MRR Líquido" : "MRR Bruto"}</p><p className="text-2xl font-bold">{fmtBRL(stats.totalMrr)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Nova venda</p><p className="text-2xl font-bold">{fmtBRL(stats.newMrr)}</p><p className="text-[10px] text-muted-foreground">{stats.newCount} conversão(ões)</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Expansão MRR</p><p className="text-2xl font-bold">{fmtBRL(stats.expansionMrr)}</p><p className="text-[10px] text-muted-foreground">{stats.upsellCount} upsell(s)</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Contração MRR</p><p className="text-2xl font-bold">{fmtBRL(stats.contractionMrr)}</p><p className="text-[10px] text-muted-foreground">{stats.downgradeCount} downgrade(s)</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Renovações</p><p className="text-2xl font-bold">{fmtBRL(stats.renewalMrr)}</p><p className="text-[10px] text-muted-foreground">{stats.renewalCount} renovação(ões)</p></CardContent></Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Área (Conversões)</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byArea} dataKey="conversoes" nameKey="area" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label>
                  {byArea.map((e) => <Cell key={e.area} fill={AREA_COLORS[e.area] || "hsl(220 10% 60%)"} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${v} conversões`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">MRR por Área</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byArea}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="area" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                 <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                 <Bar dataKey="mrr" radius={[6,6,0,0]}>
                   {byArea.map((e) => <Cell key={e.area} fill={AREA_COLORS[e.area] || "hsl(220 10% 60%)"} />)}
                 </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

       <Card>
         <CardHeader><CardTitle className="text-base">Evolução do {mrrMode === "net" ? "MRR líquido" : "MRR bruto"} no tempo (por área)</CardTitle></CardHeader>
         <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Legend />
              {visibleAreas.map(a => (
                <Line key={a} type="monotone" dataKey={a} stroke={AREA_COLORS[a] || "hsl(220 10% 60%)"} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Conversão por Vendedor</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {bySeller.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Nenhuma conversão com vendedor atribuído no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySeller} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Bar dataKey="mrr" radius={[0, 6, 6, 0]} fill="hsl(193 99% 44%)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Conversões por Plano (quantidade)</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPlan}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="plan" tick={{ fontSize: 11 }} interval={0} angle={-30} height={70} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: any) => [`${v} conversões`, "Quantidade"]} />
                  <Bar dataKey="conversoes" radius={[6,6,0,0]}>
                    {byPlan.map((e) => <Cell key={e.plan} fill={planColor(e.plan)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">MRR por Plano</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPlan}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="plan" tick={{ fontSize: 11 }} interval={0} angle={-30} height={70} />
                  <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Bar dataKey="mrr" radius={[6,6,0,0]}>
                    {byPlan.map((e) => <Cell key={e.plan} fill={planColor(e.plan)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por Vendedor por Plano</CardTitle>
            <CardDescription>Após novas vendas ({sellerPlanSales.length} combinações)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">MRR considerado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerPlanSales.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma venda nova no período selecionado.</TableCell></TableRow>
                  )}
                  {sellerPlanSales.map(s => (
                    <TableRow key={`${s.seller_id}-${s.plan}`}>
                      <TableCell>{s.seller_name}</TableCell>
                      <TableCell>{s.plan}</TableCell>
                      <TableCell className="text-right">{s.quantidade}</TableCell>
                      <TableCell className="text-right">{fmtBRL(s.mrr)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="detail" className="space-y-4">
<Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Saúde do de-para canônico</CardTitle><CardDescription>Verificações no período selecionado</CardDescription></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Prices sem mapeamento</p><p className="text-xl font-semibold">{health.missingMap}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Área divergente do de-para</p><p className="text-xl font-semibold">{health.divergent}</p>{health.divergentSamples.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">{health.divergentSamples.map(d => `${d.from} → ${d.to}`).join(" · ")}</p>}</div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Sem MRR líquido</p><p className="text-xl font-semibold">{health.missingNet}</p></div>
          </CardContent>
        </Card>
        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhamento</CardTitle>
            <CardDescription>{rows.length} conversões no período selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>1º Pagamento</TableHead>
                    <TableHead>Cliente desde</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Produto / Plano</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">MRR / Δ</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Nenhuma conversão no período.</TableCell></TableRow>
                  )}
                  {rows.slice(0, 500).map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{fmtDate(r.converted_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(r.registered_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge style={{ backgroundColor: TYPE_COLOR[r.conversion_type] || TYPE_COLOR.new, color: "white" }}>
                            {TYPE_LABEL[r.conversion_type] || r.conversion_type}
                          </Badge>
                          {r.is_reactivation && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-amber-500 text-amber-700"
                              title={r.previous_churn_at ? `Voltou após ${fmtDate(r.previous_churn_at)}` : "Cliente reativado"}
                            >
                              Reativação
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge style={{ backgroundColor: AREA_COLORS[r.area] || "hsl(220 10% 60%)", color: "white" }}>
                          {r.area}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{r.product_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.plan_name || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.customer_email || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.assigned_seller_id ? (
                          <div>
                            <div>{sellersMap[r.assigned_seller_id] || r.assigned_seller_id.slice(0, 8)}</div>
                            {r.attribution_source && (
                              <div className="text-[10px] text-muted-foreground">{SOURCE_LABEL[r.attribution_source] || r.attribution_source}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">— sem atribuição —</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <div>{fmtBRL(valueOf(r))}</div>
                        {r.conversion_type === "upsell" && (
                          <div className="text-[10px] text-emerald-600">+{fmtBRL(Number(r.delta_mrr || 0))}</div>
                        )}
                        {r.conversion_type === "downgrade" && (
                          <div className="text-[10px] text-red-600">{fmtBRL(Number(r.delta_mrr || 0))}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.mrr_net != null ? (
                          <div>
                            <div className="font-medium">{fmtBRL(Number(r.mrr_net))}</div>
                            {r.discount_amount != null && r.discount_amount > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                −{fmtBRL(Number(r.discount_amount))}
                              </div>
                            )}
                            {r.coupon_id && (
                              <Badge
                                variant="outline"
                                className="mt-1 text-[9px] border-emerald-500 text-emerald-700"
                                title={[
                                  r.coupon_name || r.coupon_id,
                                  r.coupon_percent_off ? `${r.coupon_percent_off}% off` : null,
                                  r.coupon_amount_off ? `R$${r.coupon_amount_off} off` : null,
                                  r.promotion_code ? `código: ${r.promotion_code}` : null,
                                  r.discount_duration ? `duração: ${r.discount_duration}` : null,
                                ].filter(Boolean).join(" · ")}
                              >
                                {r.coupon_name || r.promotion_code || "Cupom"}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.area === "desconhecida" && r.stripe_price_id && (
                            <MapStripePriceButton
                              price_id={r.stripe_price_id}
                              offer_name={r.product_name}
                              customer_name={r.customer_email}
                              customer_email={r.customer_email}
                              mrr={r.mrr}
                              onMapped={() => refetch()}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing({
                              conversion_id: r.id,
                              email: r.customer_email || "",
                              area: r.area,
                              mrr: r.mrr,
                              plan_name: r.plan_name,
                              product_name: r.product_name,
                              converted_at: r.converted_at,
                              registered_at: r.registered_at,
                              subscription_id: r.stripe_subscription_id,
                              customer_id: r.stripe_customer_id,
                              price_id: r.stripe_price_id,
                              conversion_type: r.conversion_type,
                              previous_mrr: r.previous_mrr,
                              previous_price_id: r.previous_price_id,
                              assigned_seller_id: r.assigned_seller_id,
                              attribution_source: r.attribution_source,
                              gross_amount: r.gross_amount,
                              net_amount: r.net_amount,
                              discount_amount: r.discount_amount,
                              mrr_net: r.mrr_net,
                              coupon_id: r.coupon_id,
                              coupon_name: r.coupon_name,
                              promotion_code: r.promotion_code,
                              discount_duration: r.discount_duration,
                              stripe_invoice_id: r.stripe_invoice_id,
                            })}
                            title="Auditar / editar conversão"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 500 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">Exibindo as 500 conversões mais recentes. Exporte para ver todas.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

        <EditConversionDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          conversion={editing}
          onSaved={() => refetch()}
        />
      </div>
    </Layout>
  );
}
