import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/supabasePaged";
import { usageByEmail, type UsageRow } from "@/lib/productUsage";

export type StoredUsageRow = UsageRow & { reference_date: string; imported_at: string };

export function useProductUsage() {
  return useQuery({
    queryKey: ["cs-product-usage"],
    queryFn: async () => {
      const { data, error } = await fetchAllPaged<StoredUsageRow>(() =>
        supabase.from("cs_product_usage").select("*").order("company_id") as any);
      if (error) throw new Error(error);
      return { rows: data, byEmail: usageByEmail(data), referenceDate: data[0]?.reference_date ?? null };
    },
  });
}

export function useImportProductUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, referenceDate }: { rows: UsageRow[]; referenceDate: string }) => {
      const { data, error } = await supabase.rpc("cs_product_usage_import" as any, { p_rows: rows as any, p_reference_date: referenceDate });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cs-product-usage"] }),
  });
}
