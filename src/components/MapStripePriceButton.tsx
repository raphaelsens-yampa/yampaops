import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MapPriceDialog } from "@/components/comissionamento/MapPriceDialog";
import type { CommissionReference, PriceMapEntry } from "@/lib/commissioning";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";

interface Props {
  price_id?: string | null;
  offer_name?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  mrr?: number | null;
  size?: "default" | "sm" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  className?: string;
  onMapped?: () => void;
}

export function MapStripePriceButton({
  price_id, offer_name, customer_name, customer_email, mrr,
  size = "sm", variant = "outline", label = "Mapear", className, onMapped,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<CommissionReference[]>([]);
  const [priceMap, setPriceMap] = useState<PriceMapEntry[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!price_id && !offer_name) {
      toast.error("Sem price_id ou nome de oferta para mapear");
      return;
    }
    setLoading(true);
    try {
      const [refRes, mapRes, profRes] = await Promise.all([
        supabase.from("commission_reference").select("*").order("plan_name").order("payment_type"),
        supabase.from("commission_price_map").select("*").order("plan_name", { nullsFirst: false }),
        supabase.from("profiles").select("user_id, full_name, email"),
      ]);
      setReference((refRes.data as CommissionReference[] | null) || []);
      setPriceMap((mapRes.data as PriceMapEntry[] | null) || []);
      setProfiles((profRes.data as ProfileLite[] | null) || []);
      setOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao carregar dados de mapeamento");
    } finally {
      setLoading(false);
    }
  }

  const target: ConversionRow = {
    id: "__stripe_pending__",
    import_id: null,
    source: "manual",
    stripe_conversion_id: null,
    manually_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    override_fields: [],
    sale_month: new Date().toISOString().slice(0, 10),
    payment_month: new Date().toISOString().slice(0, 10),
    customer_name: customer_name || customer_email || "—",
    customer_email: customer_email || null,
    price_id: price_id || null,
    offer_name: offer_name || null,
    mrr: Number(mrr || 0),
    origem_cliente: null,
    resolved_plan: null,
    resolved_payment_type: null,
    resolved_seller_user_id: null,
    resolved_seller_label: null,
    commission_pct: 0,
    commission_amount: 0,
    status: "pending_mapping",
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3 mr-1" />}
        {size !== "icon" && label}
      </Button>
      {open && (
        <MapPriceDialog
          target={target}
          reference={reference}
          priceMap={priceMap}
          profiles={profiles}
          onClose={() => setOpen(false)}
          onMapped={() => { setOpen(false); onMapped?.(); toast.success("Mapeamento salvo"); }}
        />
      )}
    </>
  );
}
