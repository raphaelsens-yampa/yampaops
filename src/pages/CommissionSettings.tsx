import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings } from "lucide-react";
import { ProductPricingTable } from "@/components/commissions/ProductPricingTable";
import { StripePricesTable } from "@/components/commissions/StripePricesTable";
import { CommissionTriggersTable } from "@/components/commissions/CommissionTriggersTable";

export default function CommissionSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [guaranteeMonths, setGuaranteeMonths] = useState("3");
  const [paymentDay, setPaymentDay] = useState("10");
  const [tPlusMonths, setTPlusMonths] = useState("2");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("commission_settings").select("*").limit(1).single();
      if (data) {
        setSettingsId(data.id);
        setGuaranteeMonths(data.guarantee_months.toString());
        setPaymentDay(data.payment_day.toString());
        setTPlusMonths(data.t_plus_months.toString());
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!settingsId) return;
    setSaving(true);
    const { error } = await supabase.from("commission_settings").update({
      guarantee_months: Number(guaranteeMonths),
      payment_day: Number(paymentDay),
      t_plus_months: Number(tPlusMonths),
    }).eq("id", settingsId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <h1 className="font-heading text-2xl font-bold">Configurações de Comissão</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Parâmetros Globais</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-6 text-muted-foreground">Carregando...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Meses de Garantia (Clawback)</Label>
                    <Input type="number" value={guaranteeMonths} onChange={(e) => setGuaranteeMonths(e.target.value)} min="0" />
                    <p className="text-xs text-muted-foreground mt-1">Período em que cancelamento gera estorno</p>
                  </div>
                  <div>
                    <Label>Dia de Pagamento</Label>
                    <Input type="number" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)} min="1" max="28" />
                    <p className="text-xs text-muted-foreground mt-1">Dia do mês para crédito</p>
                  </div>
                  <div>
                    <Label>T+ (Meses)</Label>
                    <Input type="number" value={tPlusMonths} onChange={(e) => setTPlusMonths(e.target.value)} min="0" />
                    <p className="text-xs text-muted-foreground mt-1">Meses após a venda para pagamento</p>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Salvar Configurações
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <ProductPricingTable />
      </div>
    </Layout>
  );
}
