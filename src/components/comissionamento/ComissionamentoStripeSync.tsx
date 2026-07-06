import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onDone: () => void;
}

interface SyncResult {
  processed: number;
  pending_mapping: number;
  from: string;
  to: string;
}

function firstDayOfMonth(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths + 1);
  d.setDate(0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ComissionamentoStripeSync({ onDone }: Props) {
  const { toast } = useToast();
  const [from, setFrom] = useState<string>(firstDayOfMonth(-2));
  const [to, setTo] = useState<string>(lastDayOfMonth(0));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    const { data, error } = await supabase.rpc("apply_commissions_from_stripe_range", {
      p_from: `${from}T00:00:00Z`,
      p_to: `${to}T23:59:59Z`,
    });
    setRunning(false);
    if (error) {
      toast({ title: "Falha ao recalcular", description: error.message, variant: "destructive" });
      return;
    }
    setResult(data as unknown as SyncResult);
    toast({ title: "Recálculo concluído" });
    onDone();
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Sincronizar do Stripe
          </CardTitle>
          <CardDescription className="text-xs">
            Aplica a mesma inteligência de apuração usada em Metas e Conversões por Área:
            para cada conversão do Stripe no intervalo, cria ou atualiza a comissão correspondente
            usando o Mapa de Preços + Referência. Linhas revisadas manualmente têm os campos travados preservados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">De (data da conversão)</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Recalcular agora
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Atalhos:</span>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(firstDayOfMonth(0)); setTo(lastDayOfMonth(0)); }}>Mês atual</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(firstDayOfMonth(-1)); setTo(lastDayOfMonth(-1)); }}>Mês anterior</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(firstDayOfMonth(-2)); setTo(lastDayOfMonth(0)); }}>Últimos 3 meses</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(firstDayOfMonth(-5)); setTo(lastDayOfMonth(0)); }}>Últimos 6 meses</Button>
          </div>

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="default">Processadas</Badge>
                <span className="tabular-nums font-medium">{result.processed}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={result.pending_mapping > 0 ? "destructive" : "secondary"}>
                  Pendentes de mapeamento
                </Badge>
                <span className="tabular-nums font-medium">{result.pending_mapping}</span>
              </div>
              {result.pending_mapping > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Existem conversões do Stripe sem regra no Mapa de Preços ou sem entrada ativa em Referência.
                  Ajuste em <strong>Mapa de Preços</strong> e <strong>Referência</strong> e rode novamente,
                  ou vá em <strong>Conversões</strong> e clique em <strong>Mapear</strong> nas linhas pendentes.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Como funciona</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            Cada conversão do Stripe (mesma fonte de Metas e Conversões por Área) é resolvida assim:
          </p>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Busca no <strong>Mapa de Preços</strong> pelo <code>stripe_price_id</code>.</li>
            <li>Se mapeado, casa com <strong>Referência</strong> (plano + tipo de pagamento) para obter o %.</li>
            <li>MRR = override do mapa (se houver) ou MRR normalizado do Stripe.</li>
            <li>Vendedor = atribuído da conversão Stripe ou vendedor padrão do mapa.</li>
            <li>
              Comissão = MRR × %. Mês de venda = mês da conversão. Mês de pagamento = venda + T (Referência
              de comissão).
            </li>
          </ol>
          <p>
            A partir daqui, novas conversões do Stripe são recalculadas automaticamente por gatilho — este
            painel serve para <strong>backfill</strong> ou <strong>reprocessar</strong> após ajustes no Mapa
            de Preços ou na Referência.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
