import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, CalendarIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  sellerLabel: string | null;
  lowTouch: boolean;
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
  includeLowTouch = false,
}: {
  memberIds: string[];
  profiles: Profile[];
  teamName: string | null;
  today: Date;
  refreshKey?: number;
  includeLowTouch?: boolean;
}) {
  const [days, setDays] = useState("30");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const isCustom = days === "custom";
  const customReady = isCustom && !!customFrom && !!customTo;

  const rangeKey = `${days}|${customFrom?.getTime() ?? ""}|${customTo?.getTime() ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (isCustom && !customReady) { setRows([]); setLoading(false); return; }
      setLoading(true);

      let from: Date;
      let to: Date;
      if (isCustom) {
        from = new Date(customFrom!);
        to = new Date(customTo!);
      } else {
        from = new Date(today);
        from.setDate(from.getDate() - (Number(days) - 1));
        to = new Date(today);
      }
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);

      const [convRes, mapRes, areasRes] = await Promise.all([
        supabase
          .from("stripe_conversions")
          .select("id, customer_email, plan_name, product_name, converted_at, mrr, mrr_net, net_amount, gross_amount, assigned_seller_id, stripe_price_id")
          .gte("converted_at", from.toISOString())
          .lte("converted_at", to.toISOString())
          .order("converted_at", { ascending: false }),
        includeLowTouch
          ? supabase.from("commission_price_map").select("price_id, seller_label")
          : Promise.resolve({ data: [] as any[] }),
        includeLowTouch
          ? supabase.from("tactical_lowtouch_areas").select("label, is_active")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const activeLowTouch = new Set(
        ((areasRes.data as any[]) || []).filter((a) => a.is_active).map((a) => String(a.label)),
      );
      const labelByPrice = new Map<string, string>();
      for (const m of ((mapRes.data as any[]) || [])) {
        const label = String(m.seller_label || "").trim();
        if (label) labelByPrice.set(String(m.price_id), label);
      }

      const list = (convRes.data || [])
        .map((c: any) => {
          const label = labelByPrice.get(String(c.stripe_price_id)) ?? null;
          const isLow = !!label && activeLowTouch.has(label);
          return {
            id: c.id,
            email: c.customer_email,
            name: null as string | null,
            plan: c.plan_name || c.product_name,
            converted_at: c.converted_at,
            price: Number(c.net_amount ?? c.gross_amount ?? 0),
            mrr: Number(c.mrr_net ?? c.mrr ?? 0),
            seller_id: c.assigned_seller_id,
            sellerLabel: label,
            lowTouch: isLow,
          } as Row;
        })
        .filter((r) => {
          if (r.mrr <= 0) return false;
          if (!memberIds.length) return true;
          if (memberIds.includes(r.seller_id as string)) return true;
          return includeLowTouch && r.lowTouch;
        });

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
  }, [rangeKey, memberIds.join(","), today.getTime(), refreshKey, includeLowTouch]);

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

  const sellerName = (r: Row) =>
    profiles.find((p) => p.user_id === r.seller_id)?.full_name || r.sellerLabel || "—";

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="px-4 md:px-6 flex flex-col items-stretch gap-3 space-y-0 md:flex-row md:items-center md:justify-between md:flex-wrap">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-start gap-2 text-left">
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">
                  Clientes convertidos{teamName ? ` · Time ${teamName}` : ""}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversões do Stripe com valor acima de R$ 0, atribuídas ao time
                  {includeLowTouch ? " (inclui Low-touch)" : ""}.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
            <Input
              placeholder="Buscar cliente, e-mail ou plano..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="col-span-2 h-10 md:h-8 md:w-56"
            />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-10 md:h-8 md:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Hoje</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="custom">Período personalizado</SelectItem>
              </SelectContent>
            </Select>
            {isCustom && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="col-span-2 h-10 md:h-8 md:w-auto justify-start gap-2 font-normal">
                    <CalendarIcon className="h-4 w-4" />
                    {customFrom && customTo
                      ? `${format(customFrom, "dd/MM/yy", { locale: ptBR })} – ${format(customTo, "dd/MM/yy", { locale: ptBR })}`
                      : "Selecionar datas"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    locale={ptBR}
                    selected={{ from: customFrom, to: customTo }}
                    onSelect={(range: any) => {
                      setCustomFrom(range?.from);
                      setCustomTo(range?.to);
                    }}
                    numberOfMonths={1}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
            <Badge variant="secondary" className="justify-center">{filtered.length} vendas</Badge>
          </div>
        </CardHeader>
        <CollapsibleContent>
      <CardContent className="px-3 sm:px-4 md:px-6">

        {isCustom && !customReady ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Selecione a data inicial e final do período.
          </p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma conversão no período para este time.
          </p>
        ) : (
          <>
          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium truncate">{r.name || r.email || "—"}</p>
                  <p className="text-sm font-semibold shrink-0">{fmtBRL(r.mrr)}</p>
                </div>
                {r.name && r.email && (
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {r.plan || "—"} · {parseDateBR(r.converted_at).toLocaleDateString("pt-BR")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {sellerName(r)}
                  {r.lowTouch ? " · Low-touch" : ""}
                  {r.price > 0 ? ` · ${fmtBRL(r.price)}` : ""}
                </p>
              </div>
            ))}
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
                      <span>{sellerName(r)}</span>
                      {r.lowTouch && (
                        <Badge variant="outline" className="ml-2 text-[10px]">Low-touch</Badge>
                      )}
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
          </>
        )}

      </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>

  );
}
