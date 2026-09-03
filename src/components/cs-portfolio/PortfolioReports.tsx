import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CADENCE_LABEL, ENGAGEMENT_LABEL, cadenceStatus, fmtBRL, type CadenceStatus, type CsPortfolioRow, type CsSegment } from "@/lib/csPortfolio";

export function PortfolioReports({
  rows,
  segments,
  analystName,
}: {
  rows: CsPortfolioRow[];
  segments: CsSegment[];
  analystName: (id: string | null) => string;
}) {
  const bySegment = useMemo(() => {
    const map = new Map<string, { label: string; count: number; mrr: number; overdue: number }>();
    for (const r of rows) {
      const key = r.segment_id || "none";
      const label = r.segment_id ? segments.find((s) => s.id === r.segment_id)?.name || "—" : "Sem segmento";
      const cur = map.get(key) ?? { label, count: 0, mrr: 0, overdue: 0 };
      cur.count += 1;
      cur.mrr += r.mrr;
      if (cadenceStatus(r) === "vencido") cur.overdue += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.mrr - a.mrr);
  }, [rows, segments]);

  const byCs = useMemo(() => {
    const map = new Map<string, { label: string; count: number; mrr: number; overdue: number; never: number }>();
    for (const r of rows) {
      const key = r.cs_user_id || "none";
      const label = r.cs_user_id ? analystName(r.cs_user_id) : "Sem CS";
      const cur = map.get(key) ?? { label, count: 0, mrr: 0, overdue: 0, never: 0 };
      cur.count += 1;
      cur.mrr += r.mrr;
      const st = cadenceStatus(r);
      if (st === "vencido") cur.overdue += 1;
      if (st === "nunca") cur.never += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [rows, analystName]);

  const byCadence = useMemo(() => {
    const counts: Record<CadenceStatus, number> = { nunca: 0, vencido: 0, vence_breve: 0, em_dia: 0 };
    for (const r of rows) counts[cadenceStatus(r)] += 1;
    return (Object.keys(counts) as CadenceStatus[]).map((k) => ({ label: CADENCE_LABEL[k], clientes: counts[k] }));
  }, [rows]);

  const byBand = useMemo(() => {
    const map = new Map<string, { label: string; clientes: number; mrr: number }>();
    for (const r of rows) {
      const k = r.engagement_band || "sem";
      const cur = map.get(k) ?? { label: ENGAGEMENT_LABEL[k] || "Sem cálculo", clientes: 0, mrr: 0 };
      cur.clientes += 1;
      cur.mrr += r.mrr;
      map.set(k, cur);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cadência da carteira</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCadence} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={36} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="clientes" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="clientes" position="top" style={{ fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Engajamento</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byBand} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={36} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="clientes" fill="hsl(38 92% 50%)" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="clientes" position="top" style={{ fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Por segmento</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segmento</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Vencidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySegment.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.mrr)}</TableCell>
                  <TableCell className="text-right">{r.overdue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Por analista de CS</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CS</TableHead>
                <TableHead className="text-right">Clientes</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Vencidos</TableHead>
                <TableHead className="text-right">Nunca atendidos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCs.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{fmtBRL(r.mrr)}</TableCell>
                  <TableCell className="text-right">{r.overdue}</TableCell>
                  <TableCell className="text-right">{r.never}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
