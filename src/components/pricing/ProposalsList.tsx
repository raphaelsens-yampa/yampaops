import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fmtBRL } from "@/lib/pricing/engine";

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "sent", label: "Enviada" },
  { value: "accepted", label: "Aceita" },
  { value: "rejected", label: "Recusada" },
];

export function ProposalsList() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: proposals = [], isLoading } = useQuery({
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proposals.filter((p: any) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (q && !p.client_name?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [proposals, statusFilter, search]);

  const downloadPdf = async (id: string, name: string) => {
    const { data, error } = await supabase.functions.invoke("pricing-proposal-pdf", {
      body: { proposal_id: id },
    });
    if (error) {
      toast({ title: "Erro PDF", description: error.message, variant: "destructive" });
      return;
    }
    const blob = new Blob(
      [Uint8Array.from(atob((data as any).pdf_base64), (c) => c.charCodeAt(0))],
      { type: "application/pdf" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposta-${(name || id).replace(/\s+/g, "_")}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("pricing_proposals").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["pricing-proposals"] });
  };

  const del = async (id: string) => {
    if (!confirm("Excluir proposta?")) return;
    const { error } = await supabase.from("pricing_proposals").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["pricing-proposals"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Propostas</CardTitle>
        <div className="flex gap-2 mt-3">
          <Input
            placeholder="Buscar cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Mensal</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Criada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.client_doc}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === "accepted" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{fmtBRL(Number(p.total_monthly || 0))}</TableCell>
                <TableCell className="text-right">{fmtBRL(Number(p.total_annual || 0))}</TableCell>
                <TableCell className="text-xs">
                  {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(p.id, p.client_name)} title="Baixar PDF">
                    <FileDown className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "accepted")} title="Marcar aceita">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "rejected")} title="Marcar recusada">
                    <XCircle className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(p.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  {isLoading ? "Carregando…" : "Nenhuma proposta encontrada."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
