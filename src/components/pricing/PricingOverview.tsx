import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPricingCtx, fmtBRL } from "@/lib/pricing/engine";
import { LINE_LABEL } from "@/lib/pricing/types";
import type { PricingSnapshot, PricingVersionRow, Service } from "@/lib/pricing/types";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FileDown, AlertTriangle, Package, FileText, TrendingUp, Calendar } from "lucide-react";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  preco_bom: "default",
  abaixo_ideal: "secondary",
  acima_ideal: "outline",
  prejuizo: "destructive",
};
const STATUS_LABEL: Record<string, string> = {
  preco_bom: "OK",
  abaixo_ideal: "Abaixo do ideal",
  acima_ideal: "Acima do ideal",
  prejuizo: "Prejuízo",
};

interface Props {
  version: PricingVersionRow;
  snap: PricingSnapshot;
  onAddToProposal: (svc: Service) => void;
  onDownloadPdf: (id: string) => void;
}

export function PricingOverview({ version, snap, onAddToProposal, onDownloadPdf }: Props) {
  const ctx = useMemo(() => createPricingCtx(snap), [snap]);

  const { data: proposals = [] } = useQuery({
    queryKey: ["pricing-proposals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_proposals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthly = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const list = proposals.filter((p: any) => new Date(p.created_at) >= start);
    const accepted = list.filter((p: any) => p.status === "accepted");
    const totalMonthly = list.reduce((s: number, p: any) => s + Number(p.total_monthly || 0), 0);
    const avg = list.length ? list.reduce((s: number, p: any) => s + Number(p.total_annual || 0), 0) / list.length : 0;
    return { count: list.length, accepted: accepted.length, totalMonthly, avg };
  }, [proposals]);

  const activeServices = useMemo(() => snap.services.filter((s) => s.active), [snap.services]);
  const calcs = useMemo(
    () => activeServices.map((s) => ({ svc: s, c: ctx.serviceCalc(s) })),
    [activeServices, ctx],
  );
  const prejuizoList = calcs.filter((x) => x.c.status === "prejuizo");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Versão ativa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{version.name}</div>
            <p className="text-xs text-muted-foreground">
              Atualizada {new Date(version.updated_at).toLocaleDateString("pt-BR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" /> Catálogo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeServices.length}</div>
            <p className="text-xs text-muted-foreground">produtos/serviços ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" /> Propostas no mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthly.count}</div>
            <p className="text-xs text-muted-foreground">
              {monthly.accepted} aceitas · {fmtBRL(monthly.totalMonthly)}/mês
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Ticket médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBRL(monthly.avg)}</div>
            <p className="text-xs text-muted-foreground">total contrato (mês corrente)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo rápido</CardTitle>
          <p className="text-sm text-muted-foreground">
            Adicione itens diretamente para montar uma proposta.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Linha</TableHead>
                <TableHead className="w-20 text-right">Prazo</TableHead>
                <TableHead className="text-right">Sugerido /mês</TableHead>
                <TableHead className="text-right">Praticado /mês</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-32 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calcs.map(({ svc, c }) => (
                <TableRow key={svc.id}>
                  <TableCell className="font-medium">{svc.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{LINE_LABEL[svc.line]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{svc.contract_months}m</TableCell>
                  <TableCell className="text-right">{fmtBRL(c.ideal_price_monthly)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(c.practiced_monthly)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onAddToProposal(svc)}>
                      <Plus className="h-3 w-3 mr-1" /> Proposta
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {calcs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nenhum serviço ativo no catálogo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Últimas propostas</CardTitle>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma proposta ainda.</p>
            ) : (
              <div className="space-y-2">
                {proposals.slice(0, 5).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{p.client_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("pt-BR")} ·{" "}
                        {fmtBRL(Number(p.total_monthly || 0))}/mês
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "accepted" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => onDownloadPdf(p.id)}>
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Atenção comercial
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Serviços com preço praticado abaixo do custo — revisar antes de propor.
            </p>
          </CardHeader>
          <CardContent>
            {prejuizoList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tudo certo. Todos os serviços ativos cobrem o custo.
              </p>
            ) : (
              <div className="space-y-2">
                {prejuizoList.map(({ svc, c }) => (
                  <div key={svc.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium">{svc.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Praticado {fmtBRL(c.practiced_monthly)}/mês ·{" "}
                        Custo {fmtBRL(c.cost_monthly)}/mês
                      </div>
                    </div>
                    <Badge variant="destructive">Prejuízo</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
