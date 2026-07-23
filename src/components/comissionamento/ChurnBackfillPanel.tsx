import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Result {
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors?: string[];
}

function firstDayOfMonth(offset: number) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ChurnBackfillPanel() {
  const { toast } = useToast();
  const [from, setFrom] = useState(firstDayOfMonth(-6));
  const [to, setTo] = useState(today());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("stripe-backfill-churn", {
      body: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    });
    setRunning(false);
    if (error) {
      toast({ title: "Falha no backfill", description: error.message, variant: "destructive" });
      return;
    }
    setResult(data as Result);
    toast({ title: "Backfill concluído", description: `${(data as Result).inserted} novos, ${(data as Result).updated} atualizados` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-rose-500" />
          Backfill de Churn (Stripe)
        </CardTitle>
        <CardDescription>
          Varre assinaturas canceladas no Stripe no período e popula <code>stripe_churn_events</code>, herdando MRR, área e vendedor da última conversão de cada cliente. Usado nas metas de retenção da tela de Metas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Rodar backfill
          </Button>
        </div>
        {result && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Analisadas: <strong>{result.scanned}</strong></span>
            <span>Inseridas: <strong className="text-emerald-600">{result.inserted}</strong></span>
            <span>Atualizadas: <strong>{result.updated}</strong></span>
            <span>Ignoradas: <strong>{result.skipped}</strong></span>
            {result.errors?.length ? <span className="text-rose-500">Erros: {result.errors.length}</span> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
