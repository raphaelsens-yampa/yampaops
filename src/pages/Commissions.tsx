import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { SellerCommissionView } from "@/components/commissions/SellerCommissionView";
import { AdminCommissionView } from "@/components/commissions/AdminCommissionView";
import { CommissionMonthFilter } from "@/components/commissions/CommissionMonthFilter";
import { DollarSign, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export interface GoalsByScope {
  company: number;
  team: number;
  individual: number;
}

export default function Commissions() {
  const { session, role } = useAuth();
  const isAdmin = role === "admin";
  const userId = session?.user?.id;

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [commissions, setCommissions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [goalsByScope, setGoalsByScope] = useState<GoalsByScope>({ company: 0, team: 0, individual: 0 });
  const [wonMrr, setWonMrr] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchBaseData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    let query = supabase
      .from("commissions")
      .select("*, opportunity:opportunities(name, company, estimated_mrr, origin), product:commission_products(name)")
      .order("sale_date", { ascending: false });

    if (!isAdmin) query = query.eq("seller_id", userId);

    const { data: commData } = await query;
    setCommissions(commData || []);

    if (isAdmin) {
      const { data: profData } = await supabase.from("profiles").select("user_id, full_name, email");
      setProfiles(profData || []);
    }

    setLoading(false);
  }, [userId, isAdmin]);

  // Fetch goals & wonMrr based on filterMonth
  const fetchMonthData = useCallback(async () => {
    if (!userId) return;

    const periodStr = `${filterMonth.getFullYear()}-${String(filterMonth.getMonth() + 1).padStart(2, "0")}-01`;

    // Goals by scope
    const { data: allGoals } = await supabase
      .from("goals")
      .select("target_mrr, scope, user_id")
      .lte("period_start", periodStr)
      .gte("period_end", periodStr);

    const goals = allGoals || [];
    const companyMrr = goals.filter((g) => g.scope === "company").reduce((s, g) => s + (g.target_mrr || 0), 0);
    const teamMrr = goals.filter((g) => g.scope === "team").reduce((s, g) => s + (g.target_mrr || 0), 0);
    const individualMrr = goals
      .filter((g) => g.scope === "individual" && (isAdmin || g.user_id === userId))
      .reduce((s, g) => s + (g.target_mrr || 0), 0);

    setGoalsByScope({ company: companyMrr, team: teamMrr, individual: individualMrr });

    // Won MRR for the filtered month
    const monthStart = new Date(filterMonth.getFullYear(), filterMonth.getMonth(), 1).toISOString();
    const monthEnd = new Date(filterMonth.getFullYear(), filterMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const { data: wonStages } = await supabase.from("pipeline_stages").select("slug").eq("is_won", true);
    const wonSlugs = (wonStages || []).map((s) => s.slug);

    if (wonSlugs.length > 0) {
      let mrrQuery = supabase
        .from("opportunities")
        .select("estimated_mrr")
        .in("stage", wonSlugs)
        .gte("updated_at", monthStart)
        .lte("updated_at", monthEnd);
      if (!isAdmin) mrrQuery = mrrQuery.eq("consultant_id", userId!);
      const { data: mrrData } = await mrrQuery;
      setWonMrr((mrrData || []).reduce((s, o) => s + (o.estimated_mrr || 0), 0));
    } else {
      setWonMrr(0);
    }
  }, [userId, isAdmin, filterMonth]);

  useEffect(() => { fetchBaseData(); }, [fetchBaseData]);
  useEffect(() => { fetchMonthData(); }, [fetchMonthData]);

  return (
    <Layout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 shrink-0" />
            <h1 className="font-heading text-xl sm:text-2xl font-bold">Comissões</h1>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 flex-wrap">
            <CommissionMonthFilter currentMonth={filterMonth} onMonthChange={setFilterMonth} />
            {isAdmin && (
              <Link to="/commissions/settings">
                <Button variant="outline" size="sm" className="shrink-0">
                  <Settings className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Configurações</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {isAdmin ? (
          <Tabs defaultValue="seller">
            <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
              <TabsTrigger value="seller">Minha Visão</TabsTrigger>
              <TabsTrigger value="admin">Visão Gerencial</TabsTrigger>
            </TabsList>
            <TabsContent value="seller">
              <SellerCommissionView
                commissions={commissions.filter((c) => c.seller_id === userId)}
                goalsByScope={goalsByScope}
                wonMrr={wonMrr}
                loading={loading}
                filterMonth={filterMonth}
              />
            </TabsContent>
            <TabsContent value="admin">
              <AdminCommissionView commissions={commissions} profiles={profiles} loading={loading} filterMonth={filterMonth} />
            </TabsContent>
          </Tabs>
        ) : (
          <SellerCommissionView commissions={commissions} goalsByScope={goalsByScope} wonMrr={wonMrr} loading={loading} filterMonth={filterMonth} />
        )}
      </div>
    </Layout>
  );
}
