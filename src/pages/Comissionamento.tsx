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
import { ComissionamentoStripeSync } from "@/components/comissionamento/ComissionamentoStripeSync";
import { CommissionClawbacksPanel } from "@/components/comissionamento/CommissionClawbacksPanel";
import { CommissionClosingPanel } from "@/components/comissionamento/CommissionClosingPanel";
import { CommissionRulesPanel } from "@/components/comissionamento/CommissionRulesPanel";
import { UnassignedCommissionsPanel } from "@/components/comissionamento/UnassignedCommissionsPanel";
import { NetAmountDivergences } from "@/components/stripe/NetAmountDivergences";
import { ChurnBackfillPanel } from "@/components/comissionamento/ChurnBackfillPanel";

export type ConversionSource = "stripe" | "manual" | "import";

export interface ConversionRow {
  id: string;
  import_id: string | null;
  source: ConversionSource;
  stripe_conversion_id: string | null;
  manually_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  override_fields: string[];
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
  seller_source?: string | null;
  conversion_type?: string | null;
  base_kind?: string | null;
  commission_pct: number;
  commission_amount: number;
  status: string;
  sale_at?: { converted_at: string | null } | null;
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
      supabase.from("commission_conversions").select("id, import_id, source, stripe_conversion_id, manually_reviewed, reviewed_by, reviewed_at, override_fields, sale_month, payment_month, customer_name, customer_email, price_id, offer_name, mrr, origem_cliente, resolved_plan, resolved_payment_type, resolved_seller_user_id, resolved_seller_label, seller_source, conversion_type, base_kind, commission_pct, commission_amount, status, sale_at:stripe_conversions(converted_at)").order("sale_month", { ascending: false }).limit(5000),
      isAdmin ? supabase.from("profiles").select("user_id, full_name, email") : Promise.resolve({ data: [], error: null } as { data: ProfileLite[]; error: null }),
    ]);
    setReference((refRes.data as CommissionReference[] | null) || []);
    setPriceMap((mapRes.data as PriceMapEntry[] | null) || []);
    setConversions((convRes.data as ConversionRow[] | null) || []);
    setProfiles(((profRes as { data: ProfileLite[] | null }).data) || []);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredConversions = useMemo(() => isAdmin ? conversions : conversions.filter((conversion) => conversion.resolved_seller_user_id === userId), [conversions, isAdmin, userId]);
  const unassigned = useMemo(() => conversions.filter((conversion) => !conversion.resolved_seller_user_id && !conversion.resolved_seller_label), [conversions]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2"><DollarSign className="h-5 w-5 shrink-0" /><h1 className="font-heading text-xl font-bold sm:text-2xl">Comissionamento</h1></div>
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger><TabsTrigger value="conversions">Conversões</TabsTrigger>
            {isAdmin && <TabsTrigger value="unassigned">Sem vendedor {unassigned.length > 0 && `(${unassigned.length})`}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="stripe">Stripe</TabsTrigger>}{isAdmin && <TabsTrigger value="import">Importar</TabsTrigger>}{isAdmin && <TabsTrigger value="rules">Regras</TabsTrigger>}{isAdmin && <TabsTrigger value="reference">Referência</TabsTrigger>}{isAdmin && <TabsTrigger value="pricemap">Mapa de Preços</TabsTrigger>}{isAdmin && <TabsTrigger value="clawbacks">Estornos</TabsTrigger>}{isAdmin && <TabsTrigger value="closing">Fechamento</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview"><ComissionamentoOverview conversions={filteredConversions} profiles={profiles} priceMap={priceMap} isAdmin={isAdmin} loading={loading} /></TabsContent>
          <TabsContent value="conversions"><ComissionamentoConversions conversions={filteredConversions} profiles={profiles} priceMap={priceMap} reference={reference} isAdmin={isAdmin} onChanged={fetchAll} /></TabsContent>
          {isAdmin && <TabsContent value="unassigned"><UnassignedCommissionsPanel conversions={conversions} profiles={profiles} onChanged={fetchAll} /></TabsContent>}
          {isAdmin && <TabsContent value="stripe" className="space-y-4"><ComissionamentoStripeSync onDone={fetchAll} /><ChurnBackfillPanel /><NetAmountDivergences /></TabsContent>}
          {isAdmin && <TabsContent value="import"><ComissionamentoImport priceMap={priceMap} reference={reference} onImported={fetchAll} /></TabsContent>}
          {isAdmin && <TabsContent value="rules"><CommissionRulesPanel /></TabsContent>}
          {isAdmin && <TabsContent value="reference"><ComissionamentoReference reference={reference} onChanged={fetchAll} /></TabsContent>}
          {isAdmin && <TabsContent value="pricemap"><ComissionamentoPriceMap priceMap={priceMap} reference={reference} profiles={profiles} onChanged={fetchAll} /></TabsContent>}
          {isAdmin && <TabsContent value="clawbacks"><CommissionClawbacksPanel profiles={profiles} onChanged={fetchAll} /></TabsContent>}
          {isAdmin && <TabsContent value="closing"><CommissionClosingPanel profiles={profiles} onChanged={fetchAll} /></TabsContent>}
        </Tabs>
      </div>
    </Layout>
  );
}
