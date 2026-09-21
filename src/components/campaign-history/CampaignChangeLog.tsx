import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { campaignLabel, type HistoryCampaign } from "@/lib/campaignHistory";
import { CHANGE_TYPE_LABELS, formatAuditDate, type AuditChange, type AuditEntry } from "@/lib/campaignHistoryAudit";

export function CampaignChangeLog({
  campaigns,
  campaignId,
  onCampaignChange,
}: {
  campaigns: HistoryCampaign[];
  campaignId: string;
  onCampaignChange: (id: string) => void;
}) {
  const logQ = useQuery({
    queryKey: ["campaign-history-audit", campaignId],
    queryFn: async () => {
      let q = supabase
        .from("campaign_history_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (campaignId) q = q.eq("campaign_id", campaignId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        changes: Array.isArray(r.changes) ? (r.changes as AuditChange[]) : [],
      })) as AuditEntry[];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["campaign-history-audit-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const p of data ?? []) map.set((p as any).user_id, (p as any).full_name || "");
      return map;
    },
  });

  const entries = logQ.data ?? [];
  const names = profilesQ.data ?? new Map<string, string>();
  const campaignNames = useMemo(() => new Map(campaigns.map((c) => [c.id, campaignLabel(c)])), [campaigns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px]">
          <Label className="text-xs">Campanha</Label>
          <Select value={campaignId || "all"} onValueChange={(v) => onCampaignChange(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as campanhas</SelectItem>
              {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{campaignLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Log de alterações</CardTitle>
          <p className="text-sm text-muted-foreground">
            Toda edição feita depois da criação da campanha exige justificativa e fica registrada aqui.
          </p>
        </CardHeader>
        <CardContent>
          {logQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : !entries.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Data</TableHead>
                  <TableHead className="w-[170px]">Responsável</TableHead>
                  {!campaignId && <TableHead>Campanha</TableHead>}
                  <TableHead className="w-[160px]">Tipo</TableHead>
                  <TableHead>O que mudou</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="whitespace-nowrap text-sm">{formatAuditDate(e.created_at)}</TableCell>
                    <TableCell className="text-sm">{(e.changed_by && names.get(e.changed_by)) || "—"}</TableCell>
                    {!campaignId && (
                      <TableCell className="text-sm">{campaignNames.get(e.campaign_id) || "—"}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant="secondary">{CHANGE_TYPE_LABELS[e.change_type] || e.change_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.changes.length ? (
                        <ul className="space-y-1">
                          {e.changes.map((c, i) => (
                            <li key={i}>
                              <span className="font-medium">{c.field}:</span>{" "}
                              <span className="text-muted-foreground line-through">{c.before ?? "vazio"}</span>{" "}
                              <span aria-hidden>→</span> <span>{c.after ?? "vazio"}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] whitespace-pre-wrap text-sm">{e.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
