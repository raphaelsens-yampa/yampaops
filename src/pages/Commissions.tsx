import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { SellerCommissionView } from "@/components/commissions/SellerCommissionView";
import { AdminCommissionView } from "@/components/commissions/AdminCommissionView";
import { DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

export default function Commissions() {
  const { session, role } = useAuth();
  const isAdmin = role === "admin";
  const userId = session?.user?.id;

  const [commissions, setCommissions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [wonMrr, setWonMrr] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchData();
  }, [userId, isAdmin]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch commissions with opportunity and product info
    let query = supabase
      .from("commissions")
      .select("*, opportunity:opportunities(name, company, estimated_mrr, origin), product:commission_products(name)")

      .order("sale_date", { ascending: false });

    if (!isAdmin) {
      query = query.eq("seller_id", userId!);
    }

    const { data: commData } = await query;
    setCommissions(commData || []);

    // Fetch profiles for admin view
    if (isAdmin) {
      const { data: profData } = await supabase.from("profiles").select("user_id, full_name, email");
      setProfiles(profData || []);
    }

    // Fetch goals for current period
    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    let goalsQuery = supabase.from("goals").select("target_mrr").lte("period_start", periodStart).gte("period_end", periodStart);
    if (!isAdmin) goalsQuery = goalsQuery.eq("user_id", userId!);
    const { data: goalsData } = await goalsQuery;
    setGoals(goalsData || []);

    // Won MRR for current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    // Get won stages
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
    }

    setLoading(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            <h1 className="font-heading text-2xl font-bold">Comissões</h1>
          </div>
          {isAdmin && (
            <Link to="/commissions/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-1" /> Configurações
              </Button>
            </Link>
          )}
        </div>

        {isAdmin ? (
          <Tabs defaultValue="seller">
            <TabsList>
              <TabsTrigger value="seller">Minha Visão</TabsTrigger>
              <TabsTrigger value="admin">Visão Gerencial</TabsTrigger>
            </TabsList>
            <TabsContent value="seller">
              <SellerCommissionView
                commissions={commissions.filter((c) => c.seller_id === userId)}
                goals={goals}
                wonMrr={wonMrr}
                loading={loading}
              />
            </TabsContent>
            <TabsContent value="admin">
              <AdminCommissionView commissions={commissions} profiles={profiles} loading={loading} />
            </TabsContent>
          </Tabs>
        ) : (
          <SellerCommissionView commissions={commissions} goals={goals} wonMrr={wonMrr} loading={loading} />
        )}
      </div>
    </Layout>
  );
}
