import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BRL, parseDateOnly } from "@/lib/commissioning";
import type { ConversionRow } from "@/pages/Comissionamento";

interface Props {
  conversions: ConversionRow[];
  onClose: () => void;
  onDone: () => void;
}

interface DupGroup {
  key: string;
  stripe: ConversionRow;
  duplicates: ConversionRow[];
}

function normEmail(e?: string | null) {
  return (e || "").trim().toLowerCase();
}
function monthKey(d?: string | null) {
  const dt = parseDateOnly(d);
  if (!dt) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function DuplicatesDialog({ conversions, onClose, onDone }: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const groups = useMemo<DupGroup[]>(() => {
    // Index stripe rows by (email + sale_month)
    const stripeIndex = new Map<string, ConversionRow>();
    for (const c of conversions) {
      if ((c.source || "manual") !== "stripe") continue;
      const email = normEmail(c.customer_email);
      const m = monthKey(c.sale_month);
      if (!email || !m) continue;
      const key = `${email}|${m}`;
      // keep first stripe per key (any works as reference)
      if (!stripeIndex.has(key)) stripeIndex.set(key, c);
    }
    const out = new Map<string, DupGroup>();
    for (const c of conversions) {
      const src = c.source || "manual";
      if (src === "stripe") continue;
      const email = normEmail(c.customer_email);
      const m = monthKey(c.sale_month);
      if (!email || !m) continue;
      const key = `${email}|${m}`;
      const strp = stripeIndex.get(key);
      if (!strp) continue;
      if (!out.has(key)) out.set(key, { key, stripe: strp, duplicates: [] });
      out.get(key)!.duplicates.push(c);
    }
    return Array.from(out.values()).sort((a, b) =>
      (a.stripe.customer_email || "").localeCompare(b.stripe.customer_email || ""),
    );
  }, [conversions]);

  // Default: preselect all non-reviewed duplicates
  useMemo(() => {
    const pre = new Set<string>();
    for (const g of groups) for (const d of g.duplicates) if (!d.manually_reviewed) pre.add(d.id);
    setSelected(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const totalDups = groups.reduce((s, g) => s + g.duplicates.length, 0);
  const selectedCount = selected.size;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = () => {
    if (selected.size === totalDups) setSelected(new Set());
    else {
      const all = new Set<string>();
      for (const g of groups) for (const d of g.duplicates) all.add(d.id);
      setSelected(all);
    }
  };

  const fmtMonth = (d: string | null) => {
    const dt = parseDateOnly(d);
    return dt ? dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "") : "—";
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Remover ${selected.size} conversão(ões) duplicada(s)? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    const ids = Array.from(selected);
    // Delete in chunks to avoid URL length issues
    const CHUNK = 100;
    let deleted = 0;
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { error, count } = await supabase
          .from("commission_conversions")
          .delete({ count: "exact" })
          .in("id", slice)
          .neq("source", "stripe"); // safety net: never delete stripe rows
        if (error) throw error;
        deleted += count || slice.length;
      }
      toast({ title: "Duplicatas removidas", description: `${deleted} conversão(ões) excluída(s).` });
      onDone();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message || "Falha", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Remover duplicatas de importação
          </DialogTitle>
          <DialogDescription>
            Foram encontradas {totalDups} conversão(ões) importadas/manuais que possuem uma equivalente vinda do Stripe
            (mesmo e-mail do cliente + mesmo mês de venda). Selecione quais deseja excluir. Linhas revisadas manualmente
            vêm desmarcadas por padrão.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma duplicata encontrada. 🎉
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>{selectedCount} de {totalDups} selecionadas</span>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selected.size === totalDups ? "Desmarcar todas" : "Marcar todas"}
              </Button>
            </div>
            <ScrollArea className="max-h-[55vh] pr-3">
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.key} className="border rounded-md p-3 space-y-2">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{g.stripe.customer_email || "—"}</span>
                      {" · "}Venda {fmtMonth(g.stripe.sale_month)}
                    </div>
                    <div className="text-xs bg-muted/40 rounded px-2 py-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="default">Stripe (manter)</Badge>
                        <span>{g.stripe.resolved_plan || g.stripe.offer_name || "—"}</span>
                      </div>
                      <span className="tabular-nums">
                        MRR {BRL(Number(g.stripe.mrr || 0))} · Com. {BRL(Number(g.stripe.commission_amount || 0))}
                      </span>
                    </div>
                    {g.duplicates.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-3 text-xs bg-destructive/5 border border-destructive/20 rounded px-2 py-1.5 cursor-pointer hover:bg-destructive/10"
                      >
                        <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} />
                        <div className="flex-1 flex items-center gap-2">
                          <Badge variant={d.source === "import" ? "secondary" : "outline"}>
                            {d.source === "import" ? "Import" : "Manual"}
                          </Badge>
                          {d.manually_reviewed && <Badge variant="outline" className="text-amber-700">Revisada</Badge>}
                          <span>{d.resolved_plan || d.offer_name || "—"}</span>
                          <span className="text-muted-foreground">· {d.resolved_seller_label || "sem vendedor"}</span>
                        </div>
                        <span className="tabular-nums">
                          MRR {BRL(Number(d.mrr || 0))} · Com. {BRL(Number(d.commission_amount || 0))}
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={selectedCount === 0 || deleting}>
            {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Remover {selectedCount > 0 ? `(${selectedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
