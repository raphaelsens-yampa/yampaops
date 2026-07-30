import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDateBR } from "@/lib/dateBR";
import { Profile } from "./types";

interface Row {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  converted_at: string;
  price: number;
  mrr: number;
  seller_id: string | null;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export function TeamConversionsTable({
  memberIds,
  profiles,
  teamName,
  today,
  refreshKey = 0,
}: {
  memberIds: string[];
  profiles: Profile[];
  teamName: string | null;
  today: Date;
  refreshKey?: number;
}) {
  const [days, setDays] = useState("30");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const from = new Date(today);
      from.setDate(from.getDate() - (Number(days) - 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date(today);
      to.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from("stripe_conversions")
        .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, net_amount, gross_amount, assigned_seller_id")
        .gte("converted_at", from.toISOString())
        .lte("converted_at", to.toISOString())
        .order("converted_at", { ascending: false });

      if (cancelled) return;

      const list = (data || [])
        .filter((c: any) => !memberIds.length || memberIds.includes(c.assigned_seller_id))
        .map((c: any) => ({
          id: c.id,
          email: c.customer_email,
          name: null as string | null,
          plan: c.plan_name || c.product_name,
          converted_at: c.converted_at,
          price: Number(c.net_amount ?? c.gross_amount ?? 0),
          mrr: Number(c.mrr_net ?? c.mrr ?? 0),
          seller_id: c.assigned_seller_id,
        }))
        .filter((r) => r.mrr > 0);

      const emails = Array.from(new Set(list.map((r) => r.email).filter(Boolean))) as string[];
      if (emails.length) {
        const { data: contacts } = await supabase
          .from("contacts")
          .select("name, email")
          .in("email", emails.slice(0, 500));
        const byEmail = new Map((contacts || []).map((c: any) => [String(c.email).toLowerCase(), c.name]));
        for (const r of list) {
          if (r.email) r.name = byEmail.get(r.email.toLowerCase()) ?? null;
        }
      }

      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, memberIds.join(","), today.getTime(), refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.email || "").toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.plan || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totalMrr = filtered.reduce((s, r) => s + r.mrr, 0);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-left">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div>
                <CardTitle className="text-base">
                  Clientes convertidos{teamName ? ` · Time ${teamName}` : ""}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversões do Stripe com valor acima de R$ 0, atribuídas ao time.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar cliente, e-mail ou plano..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-56"
            />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} vendas</Badge>
          </div>
        </CardHeader>
        <CollapsibleContent>
      <CardContent>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma conversão no período para este time.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Data da conversão</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                    <TableCell>{r.plan || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {profiles.find((p) => p.user_id === r.seller_id)?.full_name || "—"}
                    </TableCell>
                    <TableCell>
                      {parseDateBR(r.converted_at).toLocaleDateString("pt-BR")}
                    </TableCell>
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
        )}
      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>

  );
}
