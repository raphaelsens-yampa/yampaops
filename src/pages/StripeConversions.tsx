import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart as PieChartIcon, Download, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MapStripePriceButton } from "@/components/MapStripePriceButton";
import { EditConversionDialog } from "@/components/stripe/EditConversionDialog";
import { EditPriceDialog, type PriceEditTarget } from "@/components/stripe/EditPriceDialog";
import { PlanChart } from "@/components/stripe/PlanChart";
import { AreaChart } from "@/components/stripe/AreaChart";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { addedMrr, subscriptionMrr, matchesConversion, conversionPreset, validDateRange, spRange, planChartGroup, sellerLabelOf, type ConversionFilters, type CampaignContext, type CampaignFilter, type OriginCut } from "@/lib/stripeConversions";
import { fetchCampaignCouponIds } from "@/components/goals/tactical/campaignCoupons";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";


import {
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const AREA_COLORS: Record<string, string> = {
  Sales: "hsl(var(--chart-logo))", CX: "hsl(var(--chart-cx))", Marketing: "hsl(var(--warning))",
  Produto: "hsl(var(--success))", Parceria: "hsl(var(--chart-partner))", YampaFin: "hsl(var(--chart-finance))", desconhecida: "hsl(var(--muted-foreground))",
};
const planColor = (name: string) => {
  const palette = Object.values(AREA_COLORS);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
};

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) => s ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(s)) : "—";

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
const TYPE_COLOR: Record<string, string> = { new: "bg-primary text-primary-foreground", upsell: "bg-success text-success-foreground", downgrade: "bg-destructive text-destructive-foreground", renewal: "bg-muted text-muted-foreground" };
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

const presetRange = conversionPreset;

export default function StripeConversions() {
  const { role } = useAuth();
  const { toast } = useToast();


  const [periodPreset, setPeriodPreset] = useState("last_90");
  const [period, setPeriod] = useState(() => presetRange("last_90"));
  const [safraEnabled, setSafraEnabled] = useState(false);
  const [safra, setSafra] = useState(() => presetRange("ytd"));
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all"); // all | none
  const [reactivationOnly, setReactivationOnly] = useState(false);
  const [couponOnly, setCouponOnly] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginCut>("all");
  const [reprocessing, setReprocessing] = useState(false);
  const [backfillingNet, setBackfillingNet] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [mrrMode, setMrrMode] = useState<"net" | "gross">("net");
  const [activeTab, setActiveTab] = useState("overview");
  const [editing, setEditing] = useState<import("@/components/stripe/EditConversionDialog").ConversionToEdit | null>(null);
  const [areaEdit, setAreaEdit] = useState<PriceEditTarget | null>(null);
  const qc = useQueryClient();
  const [netEdit, setNetEdit] = useState<{ price_id: string; plan: string; count: number; mrrBruto: number; mapId: string | null; mappedMrr: number | null } | null>(null);
  const [netEditValue, setNetEditValue] = useState("");
  const [updatePriceReference, setUpdatePriceReference] = useState(false);
  const [detailPage, setDetailPage] = useState(0);
  const [savingNet, setSavingNet] = useState(false);
  const [sellerRankSort, setSellerRankSort] = useState<"mrr" | "qty">("mrr");


  // Valor de referência da linha conforme o modo (líquido cai para bruto quando ausente)
  const valueOf = (r: Conversion) =>
    subscriptionMrr(r, mrrMode);
  const contributionOf = (r: Conversion) => addedMrr(r, mrrMode);
  const rangeValid = validDateRange(period) && (!safraEnabled || validDateRange(safra));
  const range = rangeValid ? spRange(period) : null;
  const filters: ConversionFilters = { area: areaFilter, type: typeFilter, seller: sellerFilter, reactivationOnly, couponOnly, mode: mrrMode, campaign: campaignFilter, origin: originFilter };
  const refreshPanel = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["stripe-conversions"] }), qc.invalidateQueries({ queryKey: ["price-map-areas"] }), qc.invalidateQueries({ queryKey: ["price-map-canonical"] })]);
  };
  function resetFilters() {
    setPeriodPreset("last_90"); setPeriod(presetRange("last_90")); setSafraEnabled(false); setSafra(presetRange("ytd"));
    setAreaFilter("all"); setTypeFilter("all"); setSellerFilter("all"); setReactivationOnly(false); setCouponOnly(false); setMrrMode("net"); setCampaignFilter("all"); setOriginFilter("all");
  }


  function changePreset(p: string) {
    setPeriodPreset(p);
    if (p !== "custom") setPeriod(presetRange(p));
  }

  const { data: periodRows = [], isLoading, isFetching, error: queryError, refetch } = useQuery({
    queryKey: ["stripe-conversions", period, safraEnabled, safra],
    enabled: rangeValid && (role === "admin" || role === "tatico"),
    placeholderData: keepPreviousData,
    refetchInterval: 120000,
    queryFn: async () => {
      if (!range) return [];
      const build = () => {
        let q = supabase
          .from("stripe_conversions")
          .select("id, customer_email, area, product_name, plan_name, mrr, matched_opportunity_id, registered_at, converted_at, stripe_subscription_id, stripe_price_id, stripe_customer_id, conversion_type, previous_mrr, previous_price_id, delta_mrr, assigned_seller_id, attribution_source, is_reactivation, previous_churn_at, gross_amount, net_amount, discount_amount, mrr_net, coupon_id, coupon_name, coupon_percent_off, coupon_amount_off, promotion_code, discount_duration, stripe_invoice_id, origem_cliente")
          .gte("converted_at", range.from)
          .lt("converted_at", range.until)
          .order("converted_at", { ascending: false })
          .order("id");

        if (safraEnabled) {
          const cohortRange = spRange(safra);
          q = q.gte("registered_at", cohortRange.from).lt("registered_at", cohortRange.until);
        }
        return q;
      };
      const { data, error } = await fetchAllPaged<Conversion>(build as never);
      if (error) throw new Error(error);
      return data;
    },

  });

  // Contexto de campanha: cupons marcados como campanha + marcações manuais (precedência)
  const { data: campaignCtx } = useQuery({
    queryKey: ["campaign-ctx-for-stripe-conv"],
    queryFn: async (): Promise<CampaignContext> => {
      const [couponIds, links] = await Promise.all([
        fetchCampaignCouponIds(),
        fetchAllPaged<{ email_norm: string; is_campaign: boolean }>(() => supabase.from("tactical_campaign_manual_links").select("email_norm, is_campaign").order("email_norm")),
      ]);
      const manualByEmail = new Map<string, boolean>();
      (links.data || []).forEach((l) => {
        const email = String(l.email_norm ?? "").trim().toLowerCase();
        if (!email) return;
        manualByEmail.set(email, manualByEmail.get(email) === true ? true : Boolean(l.is_campaign));
      });
      return { couponIds, manualByEmail };
    },
  });

  const rows = useMemo(() => periodRows.filter(r => matchesConversion(r, { ...filters, campaignCtx })), [periodRows, filters, campaignFilter, originFilter, campaignCtx]);
  useEffect(() => { setDetailPage(0); }, [periodRows, areaFilter, typeFilter, sellerFilter, reactivationOnly, couponOnly, mrrMode, campaignFilter, originFilter, campaignCtx]);

  const { data: mappedAreaOptions = [] } = useQuery({
    queryKey: ["price-map-areas"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<{ area: string | null }>(() => supabase.from("commission_price_map").select("area").not("area", "is", null).order("id"));
      if (error) throw error;
      const set = new Set<string>((data || []).map((r: any) => r.area).filter(Boolean));
      return Array.from(set).sort();
    },
  });

  const areaOptions = useMemo(() => Array.from(new Set([...mappedAreaOptions, ...periodRows.map(r => r.area).filter(Boolean)])).sort(), [mappedAreaOptions, periodRows]);

  const { data: sellersMap = {} } = useQuery({
    queryKey: ["profiles-map-for-stripe-conv"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<{ user_id: string; full_name: string | null; email: string | null }>(() => supabase.from("profiles").select("user_id, full_name, email").order("user_id"));
      if (error) throw new Error(error);
      const m: Record<string, string> = {};
      (data || []).forEach((p: any) => { m[p.user_id] = p.full_name || p.email || p.user_id.slice(0, 8); });
      return m;
    },
  });

  // De-para canônico (commission_price_map) para o painel de saúde
  const { data: priceMap = {} } = useQuery({
    queryKey: ["price-map-canonical"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<{ id: string; price_id: string; area: string | null; offer_name: string | null; plan_name: string | null; mrr_override: number | null }>(() => supabase.from("commission_price_map").select("id, price_id, area, offer_name, plan_name, mrr_override").order("id"));
      if (error) throw error;
      const m: Record<string, {
        id: string;
        area: string | null;
        offer_name: string | null;
        plan_name: string | null;
        mrr_override: number | null;
      }> = {};
      (data || []).forEach((r: any) => { if (r.price_id) m[r.price_id] = r; });
      return m;
    },
  });

  // Renovação e Downgrade não são conversões: entram só nos KPIs próprios, nunca nos totais/áreas.
  const convRows = useMemo(
    () => rows.filter(r => r.conversion_type === "new" || r.conversion_type === "upsell"),
    [rows],
  );

  const stats = useMemo(() => {
    const total = convRows.length;
    const totalMrr = convRows.reduce((s, r) => s + contributionOf(r), 0);
    const areasCount = new Set(convRows.map(r => r.area)).size;
    // New MRR = novas vendas + recuperados (recuperação é venda nova com
    // sinalizador de reativação). Downgrade e renovação ficam fora do painel.
    const newRows = rows.filter(r => r.conversion_type === "new");
    const newMrr = newRows.reduce((s, r) => s + valueOf(r), 0);
    const newCount = newRows.length;
    const recoveryRows = newRows.filter(r => r.is_reactivation);
    const recoveryMrr = recoveryRows.reduce((s, r) => s + valueOf(r), 0);
    const recoveryCount = recoveryRows.length;
    const newOnlyMrr = newMrr - recoveryMrr;
    const newOnlyCount = newCount - recoveryCount;
    const expansionMrr = rows
      .filter(r => r.conversion_type === "upsell")
      .reduce((s, r) => s + Number(r.delta_mrr || 0), 0);
    const upsellCount = rows.filter(r => r.conversion_type === "upsell").length;
    const noSellerCount = convRows.filter(r => !r.assigned_seller_id).length;
    const reactivationCount = convRows.filter(r => r.is_reactivation).length;
    return {
      total, totalMrr, areasCount, ticketMedio: total ? totalMrr / total : 0,
      newMrr, newCount, newOnlyMrr, newOnlyCount, recoveryMrr, recoveryCount,
      expansionMrr, upsellCount, noSellerCount, reactivationCount,
    };
  }, [rows, convRows, mrrMode]);



  const health = useMemo(() => {
    let missingMap = 0, divergent = 0, missingNet = 0;
    const divergentSamples: Array<{ price_id: string; from: string; to: string }> = [];
    const netGaps = new Map<string, {
      price_id: string;
      plan: string;
      product: string;
      area: string;
      count: number;
      mrrBruto: number;
      mapId: string | null;
      mappedMrr: number | null;
    }>();
    for (const r of rows) {
      if (r.mrr_net == null) {
        missingNet++;
        const pid = r.stripe_price_id || "sem price_id";
        const canonical = pid === "sem price_id" ? null : priceMap[pid];
        const cur = netGaps.get(pid) || {
          price_id: pid,
          plan: r.plan_name?.trim() || canonical?.plan_name?.trim() || "Sem plano",
          product: r.product_name?.trim() || canonical?.offer_name?.trim() || "—",
          area: r.area || canonical?.area || "—",
          count: 0,
          mrrBruto: 0,
          mapId: canonical?.id ?? null,
          mappedMrr: canonical?.mrr_override ?? null,
        };
        cur.count += 1;
        cur.mrrBruto += Number(r.mrr || 0);
        netGaps.set(pid, cur);
      }
      if (!r.stripe_price_id) { missingMap++; continue; }
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
        body: { from: spRange(period).from, to: spRange(period).to, limit: 2000 },
      });
      if (error) throw error;
      toast({
        title: "Reprocessamento concluído",
        description: `Analisadas ${data?.scanned ?? 0} conversões · ${data?.marked ?? 0} marcadas como reativação`,
      });
      await refreshPanel();
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
        body: { from: spRange(period).from, to: spRange(period).to, limit: 2000, only_missing: true },
      });
      if (error) throw error;
      toast({
        title: "Backfill concluído",
        description: `Analisadas ${data?.scanned ?? 0} · atualizadas ${data?.updated ?? 0} · sem invoice ${data?.skipped_no_invoice ?? 0} · erros ${data?.failed ?? 0}`,
      });
      await refreshPanel();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBackfillingNet(false);
    }
  }

  function openNetEdit(p: {
    price_id: string;
    plan: string;
    count: number;
    mrrBruto: number;
    mapId: string | null;
    mappedMrr: number | null;
  }) {
    setNetEdit(p);
    setUpdatePriceReference(false);
    setNetEditValue(
      p.mappedMrr != null
        ? p.mappedMrr.toFixed(2)
        : p.count
          ? (p.mrrBruto / p.count).toFixed(2)
          : "",
    );
  }

  async function handleSaveNetMrr() {
    if (!netEdit) return;
    const value = Number(netEditValue.replace(",", "."));
    if (!netEditValue.trim() || !isFinite(value) || value < 0) {
      toast({ title: "Valor inválido", description: "Informe o MRR líquido por conversão.", variant: "destructive" });
      return;
    }
    setSavingNet(true);
    try {
      const targetIds = rows.filter(r => r.mrr_net == null && (netEdit.price_id === "sem price_id" ? !r.stripe_price_id : r.stripe_price_id === netEdit.price_id)).map(r => r.id);
      if (!targetIds.length) throw new Error("Nenhuma conversão pendente neste recorte.");
      if (!confirm(`Aplicar ${fmtBRL(value)} a ${targetIds.length} conversão(ões) sem líquido no recorte atual?${updatePriceReference ? " O MRR de referência global do price também será alterado." : " O cadastro global do price não será alterado."}`)) return;
      if (netEdit.mapId && updatePriceReference) {
        const { error: mapError } = await supabase
          .from("commission_price_map")
          .update({ mrr_override: value })
          .eq("id", netEdit.mapId);
        if (mapError) throw mapError;
      }

      let updatedCount = 0;
      for (let i = 0; i < targetIds.length; i += 100) {
        const { error, count } = await supabase.from("stripe_conversions").update({ mrr_net: value }, { count: "exact" }).is("mrr_net", null).in("id", targetIds.slice(i, i + 100));
        if (error) throw error;
        updatedCount += count ?? 0;
      }
      toast({
        title: "Cadastro do price atualizado",
        description: `${updatedCount} conversão(ões) pendente(s) receberam ${fmtBRL(value)} de MRR líquido.`,
      });
      setNetEdit(null);
      await refreshPanel();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingNet(false);
    }
  }


  async function handleReapplyPriceMap() {
    if (!confirm(`Reaplicar o de-para canônico nas conversões de ${period.start} até ${period.end}?\n\nPrimeiro será feita uma prévia das alterações e, em seguida, a atualização será confirmada.`)) return;
    setReapplying(true);
    try {
      const body = { from: spRange(period).from, to: spRange(period).to, dry_run: true, limit: 20000 };
      const preview = await supabase.functions.invoke("stripe-reapply-price-map", { body });
      if (preview.error) throw preview.error;
      const count = preview.data?.would_change ?? 0;
      if (!count || !confirm(`${count} conversão(ões) serão corrigidas. Confirmar atualização?`)) return;
      const { data, error } = await supabase.functions.invoke("stripe-reapply-price-map", {
        body: { ...body, dry_run: false },
      });
      if (error) throw error;
      toast({ title: "De-para reaplicado", description: `${data?.updated ?? 0} conversão(ões) atualizadas · ${data?.failed ?? 0} erro(s)` });
      await refreshPanel();
    } catch (e: any) {
      toast({ title: "Erro ao reaplicar de-para", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setReapplying(false);
    }
  }

  const byArea = useMemo(() => {
    const map = new Map<string, { area: string; conversoes: number; mrr: number }>();
    for (const r of convRows) {
      const cur = map.get(r.area) || { area: r.area, conversoes: 0, mrr: 0 };
      cur.conversoes += 1;
      cur.mrr += contributionOf(r);
      map.set(r.area, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [convRows, mrrMode]);

  const timeSeries = useMemo(() => {
    const map = new Map<string, Record<string, number> & { mes: string }>();
    for (const r of convRows) {
      if (!r.converted_at) continue;
      const key = monthKeySP(r.converted_at);
      const cur = map.get(key) || ({ mes: key } as any);
      cur[r.area] = (cur[r.area] || 0) + contributionOf(r);
      cur._total = (cur._total || 0) + contributionOf(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [convRows, mrrMode]);

  const visibleAreas = useMemo(() => {
    const s = new Set<string>();
    convRows.forEach(r => s.add(r.area));
    return Array.from(s);
  }, [convRows]);

  const bySeller = useMemo(() => {
    const map = new Map<string, { seller_id: string; name: string; conversoes: number; mrr: number }>();
    for (const r of convRows) {
      // Sem vendedor atribuído: a área assume o lugar do vendedor no painel.
      const sellerId = r.assigned_seller_id || `area:${r.area}`;
      const cur = map.get(sellerId) || {
        seller_id: sellerId,
        name: sellerLabelOf(r, sellersMap),
        conversoes: 0,
        mrr: 0,
      };

      cur.conversoes += 1;
      cur.mrr += contributionOf(r);
      map.set(sellerId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [convRows, mrrMode, sellersMap]);

  const byPlan = useMemo(() => {
    const map = new Map<string, { plan: string; conversoes: number; mrr: number }>();
    for (const r of convRows) {
      const plan = planChartGroup(r.plan_name);
      const cur = map.get(plan) || { plan, conversoes: 0, mrr: 0 };
      cur.conversoes += 1;
      cur.mrr += contributionOf(r);
      map.set(plan, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [convRows, mrrMode]);

  // O gráfico de quantidade ordena pelas próprias conversões: um plano com MRR
  // alto pode ter poucas conversões, e vice-versa.
  const byPlanQty = useMemo(
    () => [...byPlan].sort((a, b) => b.conversoes - a.conversoes || a.plan.localeCompare(b.plan, "pt-BR")),
    [byPlan],
  );


  const sellerPlanSales = useMemo(() => {
    const map = new Map<string, { seller_id: string; seller_name: string; plan: string; quantidade: number; mrr: number }>();
    for (const r of rows) {
      if (r.conversion_type !== "new") continue;
      // Sem vendedor atribuído: a área assume o lugar do vendedor no painel.
      const sellerId = r.assigned_seller_id || `area:${r.area}`;
      const plan = r.plan_name?.trim() || "Sem plano";
      const key = `${sellerId}-${plan}`;
      const cur = map.get(key) || {
        seller_id: sellerId,
        seller_name: sellerLabelOf(r, sellersMap),
        plan,

        quantidade: 0,
        mrr: 0,
      };
      cur.quantidade += 1;
      cur.mrr += contributionOf(r);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.seller_name.localeCompare(b.seller_name) || a.plan.localeCompare(b.plan));
  }, [rows, mrrMode, sellersMap]);

  const sellerOptions = useMemo(() => {
    return Object.entries(sellersMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sellersMap]);

  function exportCSV() {
    const data = rows.map(r => ({
      Data_Operacao: fmtDate(r.converted_at),
      Cliente_Desde: fmtDate(r.registered_at),
      Tipo: TYPE_LABEL[r.conversion_type] || r.conversion_type,
      Area: r.area,
      Produto: r.product_name || "",
      Plano: r.plan_name || "",
      Email: r.customer_email || "",
      MRR_Bruto: Number(r.mrr || 0),
      MRR_Liquido: r.mrr_net == null ? "" : Number(r.mrr_net),
      MRR_Assinatura_Considerado: valueOf(r),
      Acrescimo_MRR: contributionOf(r),
      Vendedor: r.assigned_seller_id ? sellersMap[r.assigned_seller_id] || r.assigned_seller_id : "Sem vendedor",
      Delta_MRR_Bruto: Number(r.delta_mrr || 0),
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
      "Data da operação": fmtDate(r.converted_at),
      "Cliente desde": fmtDate(r.registered_at),
      "Tipo": TYPE_LABEL[r.conversion_type] || r.conversion_type,
      "Área": r.area,
      "Produto": r.product_name || "",
      "Plano": r.plan_name || "",
      "Email": r.customer_email || "",
      "MRR bruto (R$)": Number(r.mrr || 0),
      "MRR líquido (R$)": r.mrr_net == null ? "" : Number(r.mrr_net),
      "MRR assinatura considerado (R$)": valueOf(r),
      "Acréscimo MRR (R$)": contributionOf(r),
      "Vendedor": r.assigned_seller_id ? sellersMap[r.assigned_seller_id] || r.assigned_seller_id : "Sem vendedor",
      "Δ MRR bruto (R$)": Number(r.delta_mrr || 0),
      "Reativação": r.is_reactivation ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conversões");
    const resumo = byArea.map(a => ({ "Área": a.area, "Conversões": a.conversoes, ["Acréscimo MRR (R$)"]: a.mrr }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo por Área");
    const tipos = [
      { Tipo: "Nova venda", MRR: stats.newOnlyMrr, Quantidade: stats.newOnlyCount },
      { Tipo: "Recuperação", MRR: stats.recoveryMrr, Quantidade: stats.recoveryCount },
      { Tipo: "Expansão", MRR: stats.expansionMrr, Quantidade: stats.upsellCount },
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tipos), "Resumo por Tipo");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), `conversoes_stripe_${period.start}_${period.end}.xlsx`);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    const metricLabel = "Acréscimo de MRR";
    doc.setFontSize(14);
    doc.text(`Conversões Stripe por Área`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Período: ${period.start} → ${period.end} | Área: ${areaFilter} | Tipo: ${typeFilter} | Vendedor: ${sellerFilter === "all" ? "Todos" : sellerFilter === "none" ? "Sem vendedor" : sellersMap[sellerFilter] || sellerFilter}${campaignFilter === "all" ? "" : ` | Campanha: ${campaignFilter === "campaign" ? "Somente campanha" : "Sem campanha"}`}${safraEnabled ? ` | Safra: ${safra.start} → ${safra.end}` : ""}`, 14, 24);
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
      head: [["Data da operação", "Cliente desde", "Tipo", "Área", "Produto", "Plano", "Email", "MRR assinatura", "Acréscimo MRR"]],
      body: rows.map(r => [
        fmtDate(r.converted_at), fmtDate(r.registered_at), TYPE_LABEL[r.conversion_type] || r.conversion_type, r.area,
        r.product_name || "", r.plan_name || "", r.customer_email || "", fmtBRL(valueOf(r)), fmtBRL(contributionOf(r)),
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [5, 32, 51] },
    });

    doc.save(`conversoes_stripe_${period.start}_${period.end}.pdf`);
  }


  if (role !== "admin" && role !== "tatico") return <Navigate to="/" replace />;

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
          <div className="flex flex-wrap items-center gap-2">
            {role === "admin" && (
              <>
                <Button variant="outline" size="sm" onClick={handleBackfillNetAmounts} disabled={backfillingNet || !rangeValid || isFetching}>
                  {backfillingNet ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Buscar valor líquido
                </Button>
                <Button variant="outline" size="sm" onClick={handleReapplyPriceMap} disabled={reapplying || !rangeValid || isFetching}>
                  {reapplying ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reaplicar de-para
                </Button>
                <Button variant="outline" size="sm" onClick={handleReprocessReactivations} disabled={reprocessing || !rangeValid || isFetching}>
                  {reprocessing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  Reprocessar reativações
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!rows.length || !rangeValid || isFetching || !!queryError}>
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
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 text-left">
<div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Período de conversão</Label>
                <Select value={periodPreset} onValueChange={changePreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {periodPreset === "custom" && (
                  <div className="flex flex-col gap-2 mt-1">
                    <Input type="date" value={period.start} onChange={e => setPeriod({ ...period, start: e.target.value })} />
                    <Input type="date" value={period.end} onChange={e => setPeriod({ ...period, end: e.target.value })} />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {areaOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
<div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="new">Nova</SelectItem>
                    <SelectItem value="reactivation">Recuperação</SelectItem>
                    <SelectItem value="upsell">Upsell</SelectItem>

                  </SelectContent>
                </Select>
              </div>
<div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Vendedor</Label>
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
                <Label className="text-xs font-medium text-muted-foreground">Campanha</Label>
                <Select value={campaignFilter} onValueChange={(v) => setCampaignFilter(v as CampaignFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tudo</SelectItem>
                    <SelectItem value="campaign">Só campanha</SelectItem>
                    <SelectItem value="non_campaign">Sem campanha</SelectItem>
                  </SelectContent>
                 </Select>
              </div>
<div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Origem</Label>
                <Select value={originFilter} onValueChange={(v) => setOriginFilter(v as OriginCut)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="4blue">Só 4blue</SelectItem>
                    <SelectItem value="non_4blue">Sem 4blue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
<div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Métrica de MRR</Label>
                <Select value={mrrMode} onValueChange={(v) => setMrrMode(v as "net" | "gross")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net">Líquido (fallback bruto)</SelectItem>
                    <SelectItem value="gross">Bruto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-3">
              <Label className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                <Checkbox checked={safraEnabled} onCheckedChange={v => setSafraEnabled(v === true)} />
                Filtrar por safra (cadastro)
              </Label>
              {safraEnabled && (
                  <div className="flex gap-2">
                    <Input type="date" value={safra.start} onChange={e => setSafra({ ...safra, start: e.target.value })} />
                    <Input type="date" value={safra.end} onChange={e => setSafra({ ...safra, end: e.target.value })} />
                  </div>
                )}
              <Label className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                <Checkbox checked={reactivationOnly} onCheckedChange={v => setReactivationOnly(v === true)} />
                Somente reativações
              </Label>
              <Label className="text-sm font-normal flex items-center gap-2 cursor-pointer">
                <Checkbox checked={couponOnly} onCheckedChange={v => setCouponOnly(v === true)} />
                Somente com cupom
              </Label>
              <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span>{rangeValid ? `${fmtDate(`${period.start}T12:00:00-03:00`)} — ${fmtDate(`${period.end}T12:00:00-03:00`)}` : "Informe um intervalo de datas válido."}</span>
                <Button variant="ghost" size="sm" onClick={resetFilters}><RotateCcw className="mr-2 h-4 w-4" />Limpar filtros</Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {!rangeValid && <p role="alert" className="text-sm text-destructive">Preencha datas válidas, com início anterior ou igual ao fim.</p>}
        {queryError && <div role="alert" className="flex items-center gap-3 text-destructive"><AlertCircle className="h-4 w-4" /><span>Não foi possível carregar as conversões.</span><Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button></div>}
        {isFetching && <p role="status" className="flex gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />{isLoading ? "Carregando conversões…" : "Atualizando conversões…"}</p>}
        {health.missingNet > 0 && <p className="text-sm text-muted-foreground">{health.missingNet} registro(s) sem MRR líquido; no modo líquido, essas assinaturas usam o bruto.</p>}
        {stats.upsellCount > 0 && <p className="text-xs text-muted-foreground">Expansão e contração usam Δ MRR = MRR bruto − MRR anterior registrado. O seletor líquido/bruto aplica-se às assinaturas; não há líquido anterior para recalcular esses deltas.</p>}
        {!isLoading && !queryError && rangeValid && rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro corresponde aos filtros selecionados.</p>}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="detail">Detalhamento</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Conversões</p><p className="text-2xl font-bold tabular-nums whitespace-nowrap">{stats.total}</p><p className="text-[10px] text-muted-foreground">Novas vendas + recuperados + upsell</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Acréscimo de MRR</p><p className="text-2xl font-bold tabular-nums whitespace-nowrap">{fmtBRL(stats.totalMrr)}</p><p className="text-[10px] text-muted-foreground">Novas vendas + recuperados + incremento de upsell</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">New MRR</p><p className="text-2xl font-bold tabular-nums whitespace-nowrap">{fmtBRL(stats.newMrr)}</p><p className="text-[10px] text-muted-foreground">Novas vendas + recuperados ({stats.newCount})</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Expansão MRR (Δ bruto)</p><p className="text-2xl font-bold tabular-nums whitespace-nowrap">{fmtBRL(stats.expansionMrr)}</p><p className="text-[10px] text-muted-foreground">{stats.upsellCount} upsell(s)</p></CardContent></Card>
      </div>


      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AreaChart
          title="Distribuição por Área (Conversões)"
          data={byArea}
          colorOf={(a) => AREA_COLORS[a] || "hsl(var(--muted-foreground))"}
          variant="donut"
          storageKey="conversions.areaQtyChart"
          defaultLabel="qty"
          formatQty={(v) => `${v} conversões`}
          formatMrr={fmtBRL}
        />
        <AreaChart
          title="Acréscimo de MRR por Área"
          data={byArea}
          colorOf={(a) => AREA_COLORS[a] || "hsl(var(--muted-foreground))"}
          variant="bar"
          storageKey="conversions.areaMrrChart"
          defaultLabel="mrr"
          formatQty={(v) => `${v}`}
          formatMrr={fmtBRL}
          yTickFormat={(v) => `R$${(v / 1000).toFixed(0)}k`}
        />
      </div>

       <Card>
         <CardHeader><CardTitle className="text-base">Evolução do acréscimo de MRR por área</CardTitle></CardHeader>
         <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
              <Legend />
              {visibleAreas.map(a => (
                <Line key={a} type="monotone" dataKey={a} stroke={AREA_COLORS[a] || "hsl(var(--muted-foreground))"} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Acréscimo de MRR por Vendedor</CardTitle></CardHeader>
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
                  <Bar dataKey="mrr" radius={[0, 6, 6, 0]} fill="hsl(var(--chart-logo))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PlanChart
            title="Conversões por Plano"
            data={byPlanQty.map((e) => ({ plan: e.plan, value: e.conversoes, mrr: e.mrr, conversoes: e.conversoes }))}
            colorOf={planColor}
            formatValue={(v) => `${v} conversões`}
            formatQty={(v) => `${v} conversões`}
            formatMrr={fmtBRL}
            defaultLabel="qty"
            labelOptions={["qty", "pct", "both"]}
            storageKey="conversions.planQtyChart"
          />
          <PlanChart
            title="Acréscimo de MRR por Plano"
            data={byPlan.map((e) => ({ plan: e.plan, value: e.mrr, mrr: e.mrr, conversoes: e.conversoes }))}
            colorOf={planColor}
            formatValue={fmtBRL}
            formatQty={(v) => `${v}`}
            formatMrr={fmtBRL}
            defaultLabel="mrr"
            labelOptions={["mrr", "pct", "both"]}
            yTickFormat={(v) => `R$${(v / 1000).toFixed(0)}k`}
            storageKey="conversions.planMrrChart"
          />
        </div>


        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendas por Vendedor por Plano</CardTitle>
            <CardDescription>Apenas novas vendas ({sellerPlanSales.length} combinações)</CardDescription>
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

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Ranking de Vendedor</CardTitle>
              <ToggleGroup
                type="single"
                size="sm"
                value={sellerRankSort}
                onValueChange={(v: string) => v && setSellerRankSort(v as "mrr" | "qty")}
                className="rounded-md border border-border"
              >
                <ToggleGroupItem value="mrr" className="text-xs">MRR produzido</ToggleGroupItem>
                <ToggleGroupItem value="qty" className="text-xs">Quantidade</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <CardDescription>Conversões e MRR produzido por vendedor no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">MRR produzido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bySeller.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma conversão no período selecionado.</TableCell></TableRow>
                  )}
                  {[...bySeller]
                    .sort((a, b) => sellerRankSort === "qty" ? b.conversoes - a.conversoes : b.mrr - a.mrr)
                    .map((s, i) => (
                    <TableRow key={s.seller_id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.conversoes}</TableCell>
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
        {health.missingNet > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-warning bg-muted px-4 py-3 text-sm text-foreground">
            <span>{health.missingNet} conversão(ões) sem valor líquido; o cálculo usa o MRR bruto nessas linhas.</span>
            {role === "admin" && <Button variant="outline" size="sm" onClick={handleBackfillNetAmounts} disabled={backfillingNet || !rangeValid || isFetching}>Buscar valor líquido</Button>}
          </div>
        )}

        {health.missingNetPrices.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Prices sem MRR líquido</CardTitle>
              <CardDescription>{health.missingNetPrices.length} price(s) para revisar cadastro e registrar o valor líquido</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price ID</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead className="text-right">Conversões</TableHead>
                       <TableHead className="text-right">MRR bruto</TableHead>
                       <TableHead className="text-right">Ação</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {health.missingNetPrices.map(p => (
                       <TableRow key={p.price_id}>
                         <TableCell className="font-mono text-xs">{p.price_id}</TableCell>
                         <TableCell>{p.plan}</TableCell>
                         <TableCell>{p.product}</TableCell>
                         <TableCell>{p.area}</TableCell>
                         <TableCell className="text-right">{p.count}</TableCell>
                         <TableCell className="text-right">{fmtBRL(p.mrrBruto)}</TableCell>
                         <TableCell className="text-right">
                           {role === "admin" && (
                             <Button variant="outline" size="sm" disabled={isFetching || !rangeValid}
                             onClick={() => openNetEdit(p)}>
                               <Pencil className="mr-1 h-3.5 w-3.5" /> Editar cadastro
                             </Button>
                           )}
                         </TableCell>
                       </TableRow>
                     ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

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
            <CardDescription>{rows.length} registros filtrados · novas/upsells, renovações e downgrades conforme o filtro</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data da operação</TableHead>
                    <TableHead>Cliente desde</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Produto / Plano</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">MRR assinatura / Δ bruto</TableHead>
                    <TableHead className="text-right">Acréscimo MRR</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">Nenhuma conversão no período.</TableCell></TableRow>
                  )}
                  {rows.slice(detailPage * 50, (detailPage + 1) * 50).map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{fmtDate(r.converted_at)}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(r.registered_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge className={TYPE_COLOR[r.conversion_type] || TYPE_COLOR.new}>
                            {TYPE_LABEL[r.conversion_type] || r.conversion_type}
                          </Badge>
                          {r.is_reactivation && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-warning text-foreground"
                              title={r.previous_churn_at ? `Voltou após ${fmtDate(r.previous_churn_at)}` : "Cliente reativado"}
                            >
                              Reativação
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="sm"
                          disabled={role !== "admin"}
                          title="Clique para editar o price (área, oferta, plano, comissão)"
                          onClick={() => setAreaEdit({
                            conversion_id: r.id,
                            email: r.customer_email,
                            area: r.area,
                            price_id: r.stripe_price_id,
                            product_name: r.product_name,
                            plan_name: r.plan_name,
                          })}
                          className="h-auto p-0"
                        >
                          <Badge
                            variant="secondary" className="cursor-pointer"
                          >
                            {r.area}
                          </Badge>
                        </Button>
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
                          <div className="text-[10px] text-success">+{fmtBRL(Number(r.delta_mrr || 0))}</div>
                        )}
                        {r.conversion_type === "downgrade" && (
                          <div className="text-[10px] text-destructive">{fmtBRL(Number(r.delta_mrr || 0))}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmtBRL(contributionOf(r))}</TableCell>
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
                                className="mt-1 text-[9px] border-success text-success"
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
                              onMapped={() => { void refreshPanel(); }}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={role !== "admin"}
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
              {rows.length > 50 && <div className="mt-4 flex items-center justify-end gap-3">
                <span className="text-xs text-muted-foreground">{detailPage * 50 + 1}–{Math.min((detailPage + 1) * 50, rows.length)} de {rows.length}</span>
                <Button variant="outline" size="icon" title="Página anterior" disabled={detailPage === 0} onClick={() => setDetailPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" title="Próxima página" disabled={(detailPage + 1) * 50 >= rows.length} onClick={() => setDetailPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

        <EditConversionDialog
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          conversion={editing}
          onSaved={() => { void refreshPanel(); }}
        />

        <EditPriceDialog
          open={!!areaEdit}
          onOpenChange={(o) => { if (!o) setAreaEdit(null); }}
          target={areaEdit}
          areas={areaOptions}
          onSaved={() => { void refreshPanel(); }}
        />

        <Dialog open={!!netEdit} onOpenChange={(open) => { if (!open && !savingNet) setNetEdit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Registrar MRR líquido</DialogTitle>
              <DialogDescription>
                Informe o valor líquido mensal por conversão para o price <span className="font-mono text-xs">{netEdit?.price_id}</span>.
                Esse valor será aplicado somente às conversões sem MRR líquido no período filtrado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="net-mrr-value">MRR líquido por conversão (R$)</Label>
              <Input
                id="net-mrr-value"
                type="number"
                min="0"
                step="0.01"
                value={netEditValue}
                onChange={(e) => setNetEditValue(e.target.value)}
                autoFocus
              />
              {netEdit?.mapId && <Label className="flex items-center gap-2"><Checkbox checked={updatePriceReference} onCheckedChange={v => setUpdatePriceReference(v === true)} />Atualizar também a referência global deste price</Label>}
              {netEdit && <p className="text-xs text-muted-foreground">{netEdit.count} conversão(ões) · valor bruto total {fmtBRL(netEdit.mrrBruto)}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNetEdit(null)} disabled={savingNet}>Cancelar</Button>
              <Button onClick={handleSaveNetMrr} disabled={savingNet || isFetching || !rangeValid}>{savingNet ? "Salvando..." : "Aplicar ao recorte"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
