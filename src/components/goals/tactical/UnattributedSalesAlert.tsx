import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { parseDateBR } from "@/lib/dateBR";
import { format } from "date-fns";

interface Row {
  id: string;
  email: string | null;
  plan: string | null;
  price_id: string | null;
  converted_at: string;
  mrr: number;
  reason: string;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Alerta de vendas do Stripe com MRR > 0 que não entram em nenhum placar:
 * price_id fora do Mapa de Preços, ou mapeado sem vendedor e sem área Low-touch ativa.
 */
export function UnattributedSalesAlert({
  rangeStart,
  rangeEnd,
  refreshKey = 0,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const from = new Date(rangeStart); from.setHours(0, 0, 0, 0);
      const to = new Date(rangeEnd); to.setHours(23, 59, 59, 999);

      const [convRes, mapRes, areasRes] = await Promise.all([
        supabase
          .from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, stripe_price_id, converted_at, mrr, mrr_net, assigned_seller_id")
          .is("assigned_seller_id", null)
          .gte("converted_at", from.toISOString())
          .lte("converted_at", to.toISOString())
          .order("converted_at", { ascending: false }),
        supabase.from("commission_price_map").select("price_id, seller_label, seller_user_id"),
        supabase.from("tactical_lowtouch_areas").select("label, is_active"),
      ]);
      if (cancelled) return;

      const activeAreas = new Set(
        ((areasRes.data as any[]) || []).filter((a) => a.is_active).map((a) => String(a.label)),
      );
      const mapByPrice = new Map<string, { label: string | null; seller: string | null }>();
      for (const m of (mapRes.data as any[]) || []) {
        mapByPrice.set(String(m.price_id), { label: m.seller_label ?? null, seller: m.seller_user_id ?? null });
      }

      const list: Row[] = [];
      for (const c of (convRes.data as any[]) || []) {
        const mrr = Number(c.mrr_net ?? c.mrr ?? 0);
        if (!(mrr > 0)) continue;
        const priceId = c.stripe_price_id ? String(c.stripe_price_id) : null;
        const entry = priceId ? mapByPrice.get(priceId) : undefined;
        let reason = "";
        if (!priceId) reason = "Venda sem price_id no Stripe";
        else if (!entry) reason = "Price não cadastrado no Mapa de Preços";
        else if (!entry.seller && !(entry.label && activeAreas.has(entry.label)))
          reason = "Mapa de Preços sem vendedor nem área Low-touch";
        if (!reason) continue;
        list.push({
          id: c.id,
          email: c.customer_email ?? null,
          plan: c.plan_name || c.product_name || null,
          price_id: priceId,
          converted_at: c.converted_at,
          mrr,
          reason,
        });
      }
      setRows(list);
    }
    load();
    return () => { cancelled = true; };
  }, [rangeStart.getTime(), rangeEnd.getTime(), refreshKey]);

  if (!rows.length) return null;

  const total = rows.reduce((s, r) => s + r.mrr, 0);

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <h3 className="font-semibold text-sm">
            {rows.length} venda{rows.length > 1 ? "s" : ""} não contabilizada{rows.length > 1 ? "s" : ""} · {brl(total)} de MRR
          </h3>
          <Badge variant="outline" className="ml-auto">Mapa de Preços</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Essas conversões do Stripe não aparecem nos placares porque o price não tem vendedor
          nem área Low-touch definidos. Cadastre no Mapa de Preços para contabilizá-las.
        </p>
        <ul className="space-y-2">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id} className="rounded-md border bg-background p-2.5 text-xs space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium break-all">{r.email || "—"}</span>
                <span className="font-semibold">{brl(r.mrr)}</span>
              </div>
              <div className="text-muted-foreground break-all">
                {format(parseDateBR(r.converted_at), "dd/MM/yyyy")} · {r.plan || "Plano —"}
                {r.price_id ? ` · ${r.price_id}` : ""}
              </div>
              <div className="text-destructive">{r.reason}</div>
            </li>
          ))}
        </ul>
        {rows.length > 8 && (
          <p className="text-xs text-muted-foreground">+ {rows.length - 8} outras conversões.</p>
        )}
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link to="/comissionamento">
            Abrir Mapa de Preços <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
