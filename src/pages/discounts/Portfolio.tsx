import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useDiscountClients, useDiscountTiers, useTpvForMonth } from "@/hooks/useDiscountData";
import { calcDiscount, currentMonthStart, formatBRL, monthLabel, nextTier } from "@/lib/discounts";
import { MessageCircle, Copy, Users, Crown, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function DiscountPortfolioPage() {
  return (
    <Layout>
      <PortfolioContent />
    </Layout>
  );
}

function PortfolioContent() {
  const { user, role, profile } = useAuth();
  const [month, setMonth] = useState<string>(currentMonthStart());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isManager = role === "admin" || role === "tatico";
  const { data: clients = [] } = useDiscountClients({
    onlyMine: !isManager,
    userId: user?.id ?? null,
  });
  const { data: tiers = [] } = useDiscountTiers();
  const { data: tpvRows = [] } = useTpvForMonth(month);

  const tpvByClient = useMemo(() => {
    const m = new Map<string, number>();
    tpvRows.forEach((r) => m.set(r.client_id, Number(r.tpv_amount)));
    return m;
  }, [tpvRows]);

  const rows = useMemo(() => {
    return clients
      .map((c) => {
        const tpv = tpvByClient.get(c.id) ?? 0;
        const r = calcDiscount(tiers, c.plan_type, Number(c.saas_base_price), Number(c.embedded_software_value), tpv);
        const next = nextTier(tiers, tpv);
        const diffToNext = next ? Math.max(0, next.tpv_min - tpv) : null;
        // Próximo se está a menos de 15% do tpv_min da próxima faixa
        const proximityPct = next ? (1 - diffToNext! / Math.max(next.tpv_min, 1)) : 0;
        const isClose = !!next && diffToNext! > 0 && (diffToNext! / Math.max(next.tpv_min, 1)) <= 0.15;
        return { client: c, tpv, ...r, next, diffToNext, proximityPct, isClose };
      })
      .filter((x) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          x.client.company_name.toLowerCase().includes(s) ||
          (x.client.cnpj || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => b.tpv - a.tpv);
  }, [clients, tiers, tpvByClient, search]);

  const alerts = rows.filter((r) => r.isClose).sort((a, b) => (a.diffToNext ?? 0) - (b.diffToNext ?? 0));
  const maxTier = tiers[tiers.length - 1];
  const onMax = rows.filter((r) => r.tier?.id === maxTier?.id).length;

  const selected = rows.find((r) => r.client.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Minha Carteira — Descontos por TPV</h1>
          <p className="text-muted-foreground text-sm">{monthLabel(month)} · {rows.length} cliente(s)</p>
        </div>
        <div>
          <Label className="text-xs">Mês de referência</Label>
          <Input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(`${e.target.value}-01`)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard icon={<Users />} label="Contas atribuídas" value={String(rows.length)} accent="primary" />
        <KpiCard icon={<Crown />} label="Na faixa máxima" value={String(onMax)} accent="success" />
        <KpiCard icon={<AlertCircle />} label="Alertas de oportunidade" value={String(alerts.length)} accent="warning" hint="≤ 15% da próxima faixa" />
      </div>

      {alerts.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" /> Próximos da próxima faixa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((a) => (
              <div key={a.client.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{a.client.company_name}</p>
                  <p className="text-xs text-muted-foreground">
                    TPV {formatBRL(a.tpv)} · falta <span className="font-semibold text-warning">{formatBRL(a.diffToNext ?? 0)}</span> para ganhar <span className="font-semibold text-success">{formatBRL(a.next!.discount_value)}</span> de desconto ({a.next!.name})
                  </p>
                  <Progress value={Math.round(a.proximityPct * 100)} className="h-1.5 mt-2" />
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelectedId(a.client.id)}>
                  <MessageCircle className="h-4 w-4" /> Gerar mensagem
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-lg">Carteira completa</CardTitle>
          <Input
            placeholder="Buscar por nome ou CNPJ…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="text-right">TPV mês</TableHead>
                <TableHead>Faixa</TableHead>
                <TableHead className="text-right">Desconto p/ próx. fatura</TableHead>
                <TableHead className="text-right">Fatura final</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum cliente.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.client.id} className="cursor-pointer" onClick={() => setSelectedId(r.client.id)}>
                  <TableCell className="font-medium">{r.client.company_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.client.cnpj || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.client.saas_plan_name || r.client.plan_type}</Badge></TableCell>
                  <TableCell className="text-right">{formatBRL(r.tpv)}</TableCell>
                  <TableCell>
                    {r.tier
                      ? <Badge>{r.tier.name}</Badge>
                      : <Badge variant="secondary">Sem faixa</Badge>}
                  </TableCell>
                  <TableCell className="text-right text-warning font-medium">{formatBRL(r.discount)}</TableCell>
                  <TableCell className="text-right">{formatBRL(r.finalValue)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedId(r.client.id); }}>
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <WhatsAppSheet
        open={!!selected}
        onOpenChange={(v) => !v && setSelectedId(null)}
        clientName={selected?.client.company_name ?? ""}
        csName={profile?.full_name ?? "seu CS"}
        tpv={selected?.tpv ?? 0}
        diff={selected?.diffToNext ?? 0}
        discount={selected?.next?.discount_value ?? selected?.tier?.discount_value ?? 0}
        nextTierName={selected?.next?.name ?? null}
        currentTierName={selected?.tier?.name ?? null}
      />
    </div>
  );
}

function KpiCard({ icon, label, value, accent, hint }: { icon: React.ReactNode; label: string; value: string; accent: "primary" | "warning" | "success" | "destructive"; hint?: string }) {
  const ring = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[accent];
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${ring}`}>
          <div className="[&>svg]:h-5 [&>svg]:w-5">{icon}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="font-heading text-2xl font-bold truncate">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsAppSheet({
  open, onOpenChange, clientName, csName, tpv, diff, discount, nextTierName, currentTierName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientName: string;
  csName: string;
  tpv: number;
  diff: number;
  discount: number;
  nextTierName: string | null;
  currentTierName: string | null;
}) {
  const message = nextTierName && diff > 0
    ? `Olá ${clientName}, aqui é o ${csName} do yampa. Passando para avisar que este mês você já transacionou ${formatBRL(tpv)} na nossa maquininha/link! Você está a apenas ${formatBRL(diff)} de atingir a próxima meta (${nextTierName}) e ganhar ${formatBRL(discount)} de desconto direto na sua próxima mensalidade do yampa. Bora concentrar as vendas da semana por aqui?`
    : currentTierName
      ? `Olá ${clientName}, aqui é o ${csName} do yampa. Você já transacionou ${formatBRL(tpv)} este mês e está na faixa "${currentTierName}", garantindo ${formatBRL(discount)} de desconto na próxima mensalidade. Conta com a gente para manter esse ritmo!`
      : `Olá ${clientName}, aqui é o ${csName} do yampa. Vamos começar a concentrar suas vendas na nossa maquininha/link? Assim você libera descontos na mensalidade do yampa.`;

  const [text, setText] = useState(message);

  // sincroniza quando muda cliente
  useMemo(() => setText(message), [message]);

  async function copy() {
    await navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> Mensagem para WhatsApp</SheetTitle>
          <SheetDescription>{clientName} · você pode editar antes de copiar.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 mt-4">
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="text-sm" />
          <Button onClick={copy} className="w-full">
            <Copy className="h-4 w-4" /> Copiar mensagem
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
