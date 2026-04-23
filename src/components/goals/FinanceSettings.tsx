import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function FinanceSettings() {
  const { toast } = useToast();
  const [id, setId] = useState<string | null>(null);
  const [churn, setChurn] = useState("");
  const [campaignCost, setCampaignCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("finance_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setId(data.id);
        setChurn(data.avg_churn_rate?.toString() || "");
        setCampaignCost(data.avg_campaign_cost?.toString() || "");
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    const payload = {
      avg_churn_rate: parseFloat(churn) || 0,
      avg_campaign_cost: parseFloat(campaignCost) || 0,
    };
    const { error } = id
      ? await supabase.from("finance_settings").update(payload).eq("id", id)
      : await supabase.from("finance_settings").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Configurações salvas" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Configurações Financeiras (LTV / CAC)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Churn médio mensal (%)</Label>
            <Input type="number" step="0.1" value={churn} onChange={e => setChurn(e.target.value)} placeholder="Ex: 5" />
            <p className="text-xs text-muted-foreground mt-1">Usado em LTV = MRR médio ÷ churn</p>
          </div>
          <div>
            <Label>Custo médio de campanha (R$)</Label>
            <Input type="number" value={campaignCost} onChange={e => setCampaignCost(e.target.value)} placeholder="Ex: 5000" />
            <p className="text-xs text-muted-foreground mt-1">Usado em CAC = custo ÷ conversões</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
}
