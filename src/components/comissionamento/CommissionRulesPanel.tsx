import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ProductPricingTable } from "@/components/commissions/ProductPricingTable";
import { CommissionTriggersTable } from "@/components/commissions/CommissionTriggersTable";

export function CommissionRulesPanel() {

  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [guaranteeMonths, setGuaranteeMonths] = useState("3");
  const [paymentDay, setPaymentDay] = useState("10");
  const [tPlusMonths, setTPlusMonths] = useState("2");
  const [reactivationGapMonths, setReactivationGapMonths] = useState("2");
  const [commissionBase, setCommissionBase] = useState<"net" | "gross">("net");
  const [eligibleNew, setEligibleNew] = useState(true);
  const [eligibleReactivation, setEligibleReactivation] = useState(true);
  const [eligibleUpsell, setEligibleUpsell] = useState(true);
  const [eligibleRenewal, setEligibleRenewal] = useState(false);
  const [eligibleDowngrade, setEligibleDowngrade] = useState(false);
  const [multNew, setMultNew] = useState("1");
  const [multReactivation, setMultReactivation] = useState("1");
  const [multUpsell, setMultUpsell] = useState("1");
  const [upsellBase, setUpsellBase] = useState("delta");
  const [clawbackEnabled, setClawbackEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("commission_settings").select("*").limit(1).single();
      if (data) {
        setSettingsId(data.id);
        setGuaranteeMonths(data.guarantee_months.toString());
        setPaymentDay(data.payment_day.toString());
        setTPlusMonths(data.t_plus_months.toString());
        if ((data as any).reactivation_gap_months != null) {
          setReactivationGapMonths(String((data as any).reactivation_gap_months));
        }
        if ((data as any).commission_base) {
          setCommissionBase((data as any).commission_base as "net" | "gross");
        }
        setEligibleNew(Boolean((data as any).eligible_new));
        setEligibleReactivation(Boolean((data as any).eligible_reactivation));
        setEligibleUpsell(Boolean((data as any).eligible_upsell));
        setEligibleRenewal(Boolean((data as any).eligible_renewal));
        setEligibleDowngrade(Boolean((data as any).eligible_downgrade));
        setMultNew(String((data as any).mult_new ?? 1));
        setMultReactivation(String((data as any).mult_reactivation ?? 1));
        setMultUpsell(String((data as any).mult_upsell ?? 1));
        setUpsellBase(String((data as any).upsell_base ?? "delta"));
        setClawbackEnabled(Boolean((data as any).clawback_enabled));
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
      reactivation_gap_months: Number(reactivationGapMonths),
      commission_base: commissionBase,
      eligible_new: eligibleNew,
      eligible_reactivation: eligibleReactivation,
      eligible_upsell: eligibleUpsell,
      eligible_renewal: eligibleRenewal,
      eligible_downgrade: eligibleDowngrade,
      mult_new: Number(multNew) || 0,
      mult_reactivation: Number(multReactivation) || 0,
      mult_upsell: Number(multUpsell) || 0,
      upsell_base: upsellBase,
      clawback_enabled: clawbackEnabled,
    } as any).eq("id", settingsId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas" });
    }
  };

  return (
    <div className="space-y-6 pt-4">


        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Parâmetros Globais</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-6 text-muted-foreground">Carregando...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  <div>
                    <Label>Gap p/ Reativação (meses)</Label>
                    <Input type="number" value={reactivationGapMonths} onChange={(e) => setReactivationGapMonths(e.target.value)} min="1" max="24" />
                    <p className="text-xs text-muted-foreground mt-1">Cliente que voltou após esse gap conta como nova venda</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Base de cálculo da comissão</Label>
                    <Select value={commissionBase} onValueChange={(v) => setCommissionBase(v as "net" | "gross")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="net">Valor líquido (com desconto de cupom)</SelectItem>
                        <SelectItem value="gross">Valor bruto (price de tabela)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Quando o mapa de preços define um <code>mrr_override</code>, ele prevalece sobre essa configuração.
                    </p>
                  </div>
                </div>
                <div className="space-y-3 rounded-md border p-4">
                  <div className="text-sm font-medium">Elegibilidade e multiplicadores</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {[
                      ["Nova venda", eligibleNew, setEligibleNew, multNew, setMultNew],
                      ["Reativação", eligibleReactivation, setEligibleReactivation, multReactivation, setMultReactivation],
                      ["Upsell", eligibleUpsell, setEligibleUpsell, multUpsell, setMultUpsell],
                      ["Renovação", eligibleRenewal, setEligibleRenewal, null, null],
                      ["Downgrade", eligibleDowngrade, setEligibleDowngrade, null, null],
                    ].map(([label, enabled, setEnabled, multiplier, setMultiplier]) => (
                      <div key={String(label)} className="flex items-center justify-between gap-3 rounded-md bg-muted/30 p-3">
                        <div className="flex items-center gap-2"><Switch checked={Boolean(enabled)} onCheckedChange={setEnabled as (value: boolean) => void} /><Label>{String(label)}</Label></div>
                        {setMultiplier && <Input className="w-24" type="number" min="0" step="0.05" value={String(multiplier)} onChange={(event) => (setMultiplier as (value: string) => void)(event.target.value)} aria-label={`Multiplicador de ${String(label)}`} />}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div><Label>Base do upsell</Label><Select value={upsellBase} onValueChange={setUpsellBase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="delta">Delta de MRR</SelectItem><SelectItem value="total">MRR total</SelectItem></SelectContent></Select></div>
                    <div className="flex items-center justify-between rounded-md bg-muted/30 p-3"><div><Label>Estornos por churn</Label><p className="text-xs text-muted-foreground">Usa a base histórica de churn.</p></div><Switch checked={clawbackEnabled} onCheckedChange={setClawbackEnabled} /></div>
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

        <CommissionTriggersTable />

        <ProductPricingTable />
    </div>

  );
}

