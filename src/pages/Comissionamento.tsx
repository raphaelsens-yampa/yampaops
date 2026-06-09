import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { DollarSign } from "lucide-react";
import type { CommissionReference, PriceMapEntry } from "@/lib/commissioning";
import { ComissionamentoOverview } from "@/components/comissionamento/ComissionamentoOverview";
import { ComissionamentoConversions } from "@/components/comissionamento/ComissionamentoConversions";
import { ComissionamentoImport } from "@/components/comissionamento/ComissionamentoImport";
import { ComissionamentoReference } from "@/components/comissionamento/ComissionamentoReference";
import { ComissionamentoPriceMap } from "@/components/comissionamento/ComissionamentoPriceMap";

export interface ConversionRow {
  id: string;
  import_id: string | null;
  sale_month: string;
  payment_month: string;
  customer_name: string | null;
  customer_email: string | null;
  price_id: string | null;
  offer_name: string | null;
  mrr: number;
  origem_cliente: string | null;
  resolved_plan: string | null;
  resolved_payment_type: string | null;
  resolved_seller_user_id: string | null;
  resolved_seller_label: string | null;
  commission_pct: number;
  commission_amount: number;
  status: string;
}

export interface ProfileLite {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export default function Comissionamento() {
  const { session, role } = useAuth();
  const isAdmin = role === "admin";
  const userId = session?.user?.id;

  const [reference, setReference] = useState<CommissionReference[]>([]);
  const [priceMap, setPriceMap] = useState<PriceMapEntry[]>([]);
  const [conversions, setConversions] = useState<ConversionRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [refRes, mapRes, convRes, profRes] = await Promise.all([
      supabase.from("commission_reference").select("*").order("plan_name").order("payment_type"),
      supabase.from("commission_price_map").select("*").order("plan_name", { nullsFirst: false }),
      supabase
        .from("commission_conversions")
        .select(
          "id, import_id, sale_month, payment_month, customer_name, customer_email, price_id, offer_name, mrr, origem_cliente, resolved_plan, resolved_payment_type, resolved_seller_user_id, resolved_seller_label, commission_pct, commission_amount, status",
        )
        .order("sale_month", { ascending: false })
        .limit(5000),
      isAdmin
        ? supabase.from("profiles").select("user_id, full_name, email")
        : Promise.resolve({ data: [], error: null } as { data: ProfileLite[]; error: null }),
    ]);

    setReference((refRes.data as CommissionReference[] | null) || []);
    setPriceMap((mapRes.data as PriceMapEntry[] | null) || []);
    setConversions((convRes.data as ConversionRow[] | null) || []);
    setProfiles(((profRes as { data: ProfileLite[] | null }).data) || []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredConversions = useMemo(
    () => (isAdmin ? conversions : conversions.filter((c) => c.resolved_seller_user_id === userId)),
    [conversions, isAdmin, userId],
  );

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 shrink-0" />
          <h1 className="font-heading text-xl sm:text-2xl font-bold">Comissionamento</h1>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:grid-cols-5 sm:inline-flex">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="conversions">Conversões</TabsTrigger>
            {isAdmin && <TabsTrigger value="import">Importar</TabsTrigger>}
            {isAdmin && <TabsTrigger value="reference">Referência</TabsTrigger>}
            {isAdmin && <TabsTrigger value="pricemap">Mapa de Preços</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview">
            <ComissionamentoOverview
              conversions={filteredConversions}
              profiles={profiles}
              isAdmin={isAdmin}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="conversions">
            <ComissionamentoConversions
              conversions={filteredConversions}
              profiles={profiles}
              priceMap={priceMap}
              reference={reference}
              isAdmin={isAdmin}
              onChanged={fetchAll}
            />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="import">
              <ComissionamentoImport
                priceMap={priceMap}
                reference={reference}
                onImported={fetchAll}
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="reference">
              <ComissionamentoReference reference={reference} onChanged={fetchAll} />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="pricemap">
              <ComissionamentoPriceMap
                priceMap={priceMap}
                reference={reference}
                profiles={profiles}
                onChanged={fetchAll}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
