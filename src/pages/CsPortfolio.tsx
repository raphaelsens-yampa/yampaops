import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useCsAnalysts, useCsAssignmentRules, useCsPortfolio, useCsPortfolioMutations, useCsSegments,
} from "@/hooks/useCsPortfolio";
import {
  cadenceStatus, fmtBRL, fmtDate, queuePriority, type CsPortfolioRow,
} from "@/lib/csPortfolio";
import { PortfolioFilters, EMPTY_FILTERS, applyPortfolioFilters, type PortfolioFilterState } from "@/components/cs-portfolio/PortfolioFilters";
import { PortfolioTable } from "@/components/cs-portfolio/PortfolioTable";
import { ClientDrawer360 } from "@/components/cs-portfolio/ClientDrawer360";
import { ContactLogDialog } from "@/components/cs-portfolio/ContactLogDialog";
import { SegmentBuilder } from "@/components/cs-portfolio/SegmentBuilder";
import { AssignmentRules } from "@/components/cs-portfolio/AssignmentRules";
import { EnrichmentImportDialog } from "@/components/cs-portfolio/EnrichmentImportDialog";
import { PortfolioReports } from "@/components/cs-portfolio/PortfolioReports";
import { useAuth } from "@/hooks/useAuth";

export default function CsPortfolio() {
  const { user, role } = useAuth();
  const { data: rows = [], isLoading } = useCsPortfolio();
  const { data: segments = [] } = useCsSegments();
  const { data: assignmentRules = [] } = useCsAssignmentRules();
  const { data: analysts = [] } = useCsAnalysts();
  const { refresh, assign } = useCsPortfolioMutations();

  const [filters, setFilters] = useState<PortfolioFilterState>({ ...EMPTY_FILTERS });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerRow, setDrawerRow] = useState<CsPortfolioRow | null>(null);
  const [logRow, setLogRow] = useState<CsPortfolioRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkCs, setBulkCs] = useState("");

  const analystName = (id: string | null) => {
    if (!id) return "Sem CS";
    const a = analysts.find((x) => x.user_id === id);
    return a?.full_name || a?.email || "—";
  };

  const filtered = useMemo(
    () => applyPortfolioFilters(rows, filters, (r) => cadenceStatus(r)),
    [rows, filters],
  );

  const queue = useMemo(
    () =>
      rows
        .filter((r) => role === "admin" || !r.cs_user_id || r.cs_user_id === user?.id)
        .filter((r) => ["vencido", "nunca", "vence_breve"].includes(cadenceStatus(r)))
        .sort((a, b) => queuePriority(b) - queuePriority(a))
        .slice(0, 100),
    [rows, role, user?.id],
  );

  const kpis = useMemo(() => {
    const mrr = filtered.reduce((s, r) => s + r.mrr, 0);
    const overdue = filtered.filter((r) => cadenceStatus(r) === "vencido").length;
    const never = filtered.filter((r) => cadenceStatus(r) === "nunca").length;
    const noCs = filtered.filter((r) => !r.cs_user_id).length;
    return { clients: filtered.length, mrr, overdue, never, noCs };
  }, [filtered]);

  function exportXlsx() {
    const data = filtered.map((r) => ({
      "E-mail": r.email,
      Empresa: r.company_name || "",
      Segmento: segments.find((s) => s.id === r.segment_id)?.name || "",
      CS: analystName(r.cs_user_id),
      Plano: r.plano || "",
      Oferta: r.nome_oferta || "",
      MRR: r.mrr,
      Origem: r.origem_cliente || "",
      Recorrência: r.recorrencia_pagamento || "",
      Ramo: r.industry || "",
      "Engajamento": r.engagement_score ?? "",
      "Faixa": r.engagement_band || "",
      "Risco de churn": r.churn_risk_score ?? "",
      "Conversas 90d": r.conversations_90d,
      "Cliente desde": fmtDate(r.data_inicio),
      "Último contato": fmtDate(r.last_contact_at),
      "Próximo contato": fmtDate(r.next_contact_due),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Carteira CS");
    XLSX.writeFile(wb, `carteira-cs-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function bulkAssign() {
    if (!selected.size || !bulkCs) return;
    try {
      await assign.mutateAsync({ ids: Array.from(selected), csUserId: bulkCs === "none" ? null : bulkCs });
      toast.success(`${selected.size} cliente(s) atualizado(s)`);
      setSelected(new Set());
      setBulkCs("");
    } catch (e: any) {
      toast.error(e.message || "Falha ao encarteirar");
    }
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Carteira de CS</h1>
            <p className="text-sm text-muted-foreground">
              Controle de clientes ativos pagantes por analista, segmento e cadência de atendimento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportXlsx}>
              <Download className="h-4 w-4 mr-1" /> Exportar
            </Button>
            {role === "admin" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" /> Ramo de atuação
                </Button>
                <Button
                  size="sm"
                  disabled={refresh.isPending}
                  onClick={async () => {
                    try {
                      const res = await refresh.mutateAsync();
                      toast.success(
                        `Carteira atualizada: ${res?.upserted ?? 0} clientes, ${res?.assigned ?? 0} encarteirados, ${res?.deactivated ?? 0} inativados`,
                      );
                    } catch (e: any) {
                      toast.error(e.message || "Falha ao atualizar carteira");
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${refresh.isPending ? "animate-spin" : ""}`} />
                  Atualizar carteira
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5">
          <Kpi label="Clientes" value={String(kpis.clients)} />
          <Kpi label="MRR da seleção" value={fmtBRL(kpis.mrr)} />
          <Kpi label="Cadência vencida" value={String(kpis.overdue)} />
          <Kpi label="Nunca atendidos" value={String(kpis.never)} />
          <Kpi label="Sem CS" value={String(kpis.noCs)} />
        </div>

        <Tabs defaultValue="carteira">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="carteira">Carteira</TabsTrigger>
            <TabsTrigger value="fila">Fila do dia</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
            {role === "admin" && <TabsTrigger value="config">Configurações</TabsTrigger>}
          </TabsList>

          <TabsContent value="carteira" className="space-y-3 mt-4">
            <PortfolioFilters
              rows={rows}
              segments={segments}
              analysts={analysts}
              value={filters}
              onChange={setFilters}
            />
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <Badge variant="secondary">{selected.size} selecionado(s)</Badge>
                <Select value={bulkCs} onValueChange={setBulkCs}>
                  <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Atribuir a..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Remover CS</SelectItem>
                    {analysts.map((a) => (
                      <SelectItem key={a.user_id} value={a.user_id}>{a.full_name || a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={bulkAssign} disabled={!bulkCs || assign.isPending}>Aplicar</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
              </div>
            )}
            <Card>
              <CardContent className="p-3 sm:p-4 md:p-6">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">Carregando carteira...</p>
                ) : (
                  <PortfolioTable
                    rows={filtered.slice(0, 500)}
                    segments={segments}
                    analystName={analystName}
                    selected={selected}
                    onToggle={(id) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        next.has(id) ? next.delete(id) : next.add(id);
                        return next;
                      })
                    }
                    onToggleAll={(checked) =>
                      setSelected(checked ? new Set(filtered.slice(0, 500).map((r) => r.id)) : new Set())
                    }
                    onOpen={setDrawerRow}
                    onLog={setLogRow}
                  />
                )}
                {filtered.length > 500 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Exibindo os 500 primeiros de {filtered.length} clientes. Refine os filtros ou use a exportação.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fila" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fila do dia</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Prioridade por atraso na cadência, risco de churn e MRR. Mostra seus clientes e os sem CS.
                </p>
              </CardHeader>
              <CardContent className="p-3 sm:p-4 md:p-6">
                <PortfolioTable
                  rows={queue}
                  segments={segments}
                  analystName={analystName}
                  selected={selected}
                  onToggle={(id) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  onToggleAll={(checked) => setSelected(checked ? new Set(queue.map((r) => r.id)) : new Set())}
                  onOpen={setDrawerRow}
                  onLog={setLogRow}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="relatorios" className="mt-4">
            <PortfolioReports rows={filtered} segments={segments} analystName={analystName} />
          </TabsContent>

          {role === "admin" && (
            <TabsContent value="config" className="mt-4 space-y-4">
              <SegmentBuilder segments={segments} />
              <AssignmentRules segments={segments} rules={assignmentRules} analysts={analysts} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ClientDrawer360
        row={drawerRow}
        segments={segments}
        analystName={analystName}
        onOpenChange={(v) => !v && setDrawerRow(null)}
        onLog={(r) => setLogRow(r)}
      />
      <ContactLogDialog row={logRow} open={!!logRow} onOpenChange={(v) => !v && setLogRow(null)} />
      <EnrichmentImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </Layout>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        <p className="text-xl sm:text-2xl font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
