import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CADENCE_LABEL, ENGAGEMENT_LABEL, cadenceStatus, daysOverdue, fmtBRL, fmtDate, type CadenceStatus, type CsPortfolioRow, type CsSegment } from "@/lib/csPortfolio";
import { CheckCircle2, User } from "lucide-react";

const CADENCE_VARIANT: Record<CadenceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  nunca: "outline",
  vencido: "destructive",
  vence_breve: "default",
  em_dia: "secondary",
};

export function PortfolioTable({
  rows,
  segments,
  analystName,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onLog,
}: {
  rows: CsPortfolioRow[];
  segments: CsSegment[];
  analystName: (id: string | null) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (row: CsPortfolioRow) => void;
  onLog: (row: CsPortfolioRow) => void;
}) {
  const segName = new Map(segments.map((s) => [s.id, s]));
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Nenhum cliente encontrado com os filtros atuais.</p>;
  }

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => {
          const st = cadenceStatus(r);
          return (
            <div key={r.id} className="rounded-lg border p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <button className="text-left min-w-0" onClick={() => onOpen(r)}>
                  <p className="text-sm font-medium truncate">{r.company_name || r.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                </button>
                <p className="text-sm font-semibold shrink-0">{fmtBRL(r.mrr)}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.segment_id && <Badge variant="outline">{segName.get(r.segment_id)?.name}</Badge>}
                <Badge variant={CADENCE_VARIANT[st]}>{CADENCE_LABEL[st]}</Badge>
                {r.engagement_band && <Badge variant="secondary">{ENGAGEMENT_LABEL[r.engagement_band] || r.engagement_band}</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                CS: {analystName(r.cs_user_id)} · Próx.: {fmtDate(r.next_contact_due)}
              </p>
              <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => onLog(r)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Registrar atendimento
              </Button>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox checked={allChecked} onCheckedChange={(v) => onToggleAll(!!v)} aria-label="Selecionar todos" />
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>CS</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-right">Engaj.</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead>Próximo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const st = cadenceStatus(r);
              const late = daysOverdue(r);
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={() => onToggle(r.id)} aria-label="Selecionar" />
                  </TableCell>
                  <TableCell className="max-w-[240px]">
                    <p className="font-medium truncate">{r.company_name || r.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                  </TableCell>
                  <TableCell>
                    {r.segment_id ? (
                      <Badge variant="outline">{segName.get(r.segment_id)?.name || "—"}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {analystName(r.cs_user_id)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{r.plano || "—"}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.mrr)}</TableCell>
                  <TableCell className="text-right">
                    {r.engagement_score != null ? r.engagement_score : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(r.last_contact_at)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(r.next_contact_due)}</TableCell>
                  <TableCell>
                    <Badge variant={CADENCE_VARIANT[st]}>
                      {CADENCE_LABEL[st]}{st === "vencido" ? ` · ${late}d` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={() => onLog(r)}>Atendi</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
