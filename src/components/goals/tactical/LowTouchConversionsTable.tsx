import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDateBR } from "@/lib/dateBR";
import { toBRDateKey } from "./types";
import type { LowTouchSale } from "./useLowTouchData";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function LowTouchConversionsTable({
  sales,
  today,
}: {
  sales: LowTouchSale[];
  today: Date;
}) {
  const [days, setDays] = useState("30");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<Map<string, string | null>>(new Map());

  const inRange = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - (Number(days) - 1));
    const a = toBRDateKey(start);
    const b = toBRDateKey(today);
    return sales.filter((s) => s.dateKey >= a && s.dateKey <= b);
  }, [sales, days, today]);

  useEffect(() => {
    let cancelled = false;
    async function loadNames() {
      const emails = Array.from(new Set(inRange.map((r) => r.email).filter(Boolean))) as string[];
      if (!emails.length) { setNames(new Map()); return; }
      const { data } = await supabase
        .from("contacts")
        .select("name, email")
        .in("email", emails.slice(0, 500));
      if (cancelled) return;
      setNames(new Map((data || []).map((c: any) => [String(c.email).toLowerCase(), c.name])));
    }
    loadNames();
    return () => { cancelled = true; };
  }, [inRange]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inRange;
    return inRange.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(q) ||
        (r.plan || "").toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        (names.get((r.email || "").toLowerCase()) || "").toLowerCase().includes(q),
    );
  }, [inRange, query, names]);

  const totalMrr = filtered.reduce((s, r) => s + r.mrr, 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-4 md:px-6 flex flex-col items-stretch gap-3 space-y-0 md:flex-row md:items-center md:justify-between md:flex-wrap">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-start gap-2 text-left">
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">Clientes convertidos · Low-touch</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Vendas com valor acima de R$ 0 atribuídas a áreas Low-touch no Mapa de Preços.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
            <Input
              placeholder="Buscar cliente, e-mail, plano ou área..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="col-span-2 h-10 md:h-8 md:w-60"
            />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-10 md:h-8 md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="justify-center">{filtered.length} vendas</Badge>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-3 sm:px-4 md:px-6">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhuma conversão Low-touch no período.
              </p>
            ) : (
              <>
              <div className="md:hidden space-y-2">
                {filtered.map((r) => {
                  const nm = names.get((r.email || "").toLowerCase());
                  return (
                    <div key={r.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium truncate">{nm || r.email || "—"}</p>
                        <p className="text-sm font-semibold shrink-0">{fmtBRL(r.mrr)}</p>
                      </div>
                      {nm && r.email && <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {r.plan || "—"} · {parseDateBR(r.converted_at).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.area}{r.price > 0 ? ` · ${fmtBRL(r.price)}` : ""}
                      </p>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm font-semibold">
                  <span>Total MRR</span>
                  <span>{fmtBRL(totalMrr)}</span>
                </div>
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Área</TableHead>
                      <TableHead>Data da conversão</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {names.get((r.email || "").toLowerCase()) || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                        <TableCell>{r.plan || "—"}</TableCell>
                        <TableCell>{r.area}</TableCell>
                        <TableCell>{parseDateBR(r.converted_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">{r.price > 0 ? fmtBRL(r.price) : "—"}</TableCell>
                        <TableCell className="text-right font-medium">{fmtBRL(r.mrr)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell colSpan={6}>Total</TableCell>
                      <TableCell className="text-right">{fmtBRL(totalMrr)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              </>
            )}

          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
