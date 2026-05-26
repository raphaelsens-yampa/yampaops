import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscountTier } from "@/lib/discounts";

export function useDiscountTiers() {
  return useQuery({
    queryKey: ["discount-tiers"],
    queryFn: async (): Promise<DiscountTier[]> => {
      const { data, error } = await supabase
        .from("discount_tiers")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export type DiscountClient = {
  id: string;
  opportunity_id: string | null;
  company_name: string;
  cnpj: string | null;
  saas_plan_name: string;
  saas_base_price: number;
  plan_type: "software" | "consultoria_bpo";
  embedded_software_value: number;
  cs_user_id: string | null;
  is_active: boolean;
};

export function useDiscountClients(opts?: { onlyMine?: boolean; userId?: string | null }) {
  return useQuery({
    queryKey: ["discount-clients", opts?.onlyMine, opts?.userId],
    queryFn: async (): Promise<DiscountClient[]> => {
      let q = supabase.from("discount_clients").select("*").eq("is_active", true).order("company_name");
      if (opts?.onlyMine && opts.userId) q = q.eq("cs_user_id", opts.userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export type TpvRow = {
  id: string;
  client_id: string;
  reference_month: string;
  tpv_amount: number;
  sync_status: string;
  synced_at: string | null;
};

export function useTpvForMonth(month: string) {
  return useQuery({
    queryKey: ["tpv-monthly", month],
    queryFn: async (): Promise<TpvRow[]> => {
      const { data, error } = await supabase
        .from("tpv_monthly")
        .select("*")
        .eq("reference_month", month);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export type InvoiceRow = {
  id: string;
  client_id: string;
  reference_month: string;
  tier_id: string | null;
  tpv_amount: number;
  original_value: number;
  discount_applied: number;
  final_value: number;
};

export function useInvoicesForMonth(month: string) {
  return useQuery({
    queryKey: ["invoice-log", month],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from("invoice_log")
        .select("*")
        .eq("reference_month", month);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}
