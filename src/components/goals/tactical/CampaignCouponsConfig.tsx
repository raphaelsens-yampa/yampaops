import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Info } from "lucide-react";
import { useCampaignCoupons } from "./campaignCoupons";

interface CouponStat {
  coupon_id: string;
  coupon_name: string | null;
  count: number;
  first: string;
  last: string;
}

/**
 * Cadastro dos cupons da Stripe que representam campanhas. O painel semanal de
 * Metas Táticas usa essa marcação para separar realizado de campanha.
 */
export function CampaignCouponsConfig() {
  const { coupons, reload } = useCampaignCoupons();
  const [stats, setStats] = useState<CouponStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("stripe_conversions")
        .select("coupon_id, coupon_name, converted_at")
        .not("coupon_id", "is", null)
        .order("converted_at", { ascending: true })
        .limit(5000);
      const acc = new Map<string, CouponStat>();
      for (const r of ((data as any[]) || []) as any[]) {
        const id = String(r.coupon_id);
        const date = String(r.converted_at ?? "").slice(0, 10);
        const cur = acc.get(id);
        if (!cur) {
          acc.set(id, {
            coupon_id: id,
            coupon_name: r.coupon_name ?? null,
            count: 1,
            first: date,
            last: date,
          });
        } else {
          cur.count += 1;
          if (date && (!cur.first || date < cur.first)) cur.first = date;
          if (date && date > cur.last) cur.last = date;
          if (!cur.coupon_name && r.coupon_name) cur.coupon_name = r.coupon_name;
        }
      }
      setStats(Array.from(acc.values()).sort((a, b) => b.count - a.count));
      setLoading(false);
    })();
  }, []);

  const marked = useMemo(
    () => new Set(coupons.filter((c) => c.is_campaign).map((c) => c.coupon_id)),
    [coupons],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stats;
    return stats.filter(
      (s) =>
        s.coupon_id.toLowerCase().includes(q) ||
        String(s.coupon_name ?? "").toLowerCase().includes(q),
    );
  }, [stats, search]);

  const toggle = async (s: CouponStat, next: boolean) => {
    setSaving(s.coupon_id);
    const { error } = await supabase
      .from("tactical_campaign_coupons")
      .upsert(
        { coupon_id: s.coupon_id, coupon_name: s.coupon_name, is_campaign: next },
        { onConflict: "coupon_id" },
      );
    setSaving(null);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    await reload();
  };

  return (
    <Card>
      <CardHeader className="pb-3 px-4 md:px-6">
        <CardTitle className="text-sm sm:text-base">Cupons de campanha (Stripe)</CardTitle>
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          Marque os cupons usados para trackear campanhas. O painel semanal por categoria passa a
          permitir o recorte Campanha / Não-campanha usando essa lista.
        </p>
      </CardHeader>
      <CardContent className="px-4 md:px-6 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cupom por nome ou código"
            className="h-9 max-w-xs"
          />
          <Badge variant="secondary" className="text-[10px]">
            {marked.size} marcados
          </Badge>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando cupons...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cupom encontrado nas conversões.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y">
            {filtered.map((s) => (
              <label
                key={s.coupon_id}
                className="flex items-start gap-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md px-1"
              >
                <Checkbox
                  checked={marked.has(s.coupon_id)}
                  disabled={saving === s.coupon_id}
                  onCheckedChange={(v) => toggle(s, !!v)}
                  className="mt-0.5"
                />
                <span className="text-sm leading-tight">
                  {s.coupon_name || s.coupon_id}
                  <span className="block text-[11px] text-muted-foreground">
                    {s.coupon_id} · {s.count} venda{s.count === 1 ? "" : "s"} · {s.first} → {s.last}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
