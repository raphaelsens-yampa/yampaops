import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Wand2 } from "lucide-react";
import { MapStripePriceButton } from "@/components/MapStripePriceButton";
import { ForceConversionDialog, type ForcePrefill } from "./ForceConversionDialog";
import { EditConversionDialog, type ConversionToEdit } from "./EditConversionDialog";

type FindingStatus =
  | "already_counted" | "unmapped_price" | "zero_mrr" | "no_paid_invoice"
  | "discarded_other" | "not_in_stripe" | "no_subscription" | "error";

interface Finding {
  status: FindingStatus;
  reason: string;
  subscription_id?: string | null;
  customer_id?: string | null;
  price_id?: string | null;
  product_name?: string | null;
  plan_name?: string | null;
  area?: string | null;
  mrr?: number;
  registered_at?: string | null;
  converted_at?: string | null;
  conversion_id?: string | null;
  sub_status?: string | null;
}

interface EmailResult {
  email: string;
  findings: Finding[];
}

const STATUS_META: Record<FindingStatus, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  already_counted: { label: "Já contabilizado", tone: "ok" },
  unmapped_price: { label: "Pendente de mapeamento", tone: "warn" },
  zero_mrr: { label: "MRR zerado", tone: "warn" },
  no_paid_invoice: { label: "Sem invoice paga", tone: "warn" },
  discarded_other: { label: "Descartado", tone: "warn" },
  not_in_stripe: { label: "Não está na Stripe", tone: "err" },
  no_subscription: { label: "Sem assinatura", tone: "err" },
  error: { label: "Erro", tone: "err" },
};

function toneClass(tone: "ok" | "warn" | "err" | "muted") {
  switch (tone) {
    case "ok": return "bg-success/15 text-success border-success/30";
    case "warn": return "bg-warning/15 text-warning border-warning/30";
    case "err": return "bg-destructive/15 text-destructive border-destructive/30";
    default: return "bg-muted text-muted-foreground";
  }
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EmailDiagnosis() {
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EmailResult[]>([]);
  const [forcePrefill, setForcePrefill] = useState<ForcePrefill | null>(null);
  const [forceOpen, setForceOpen] = useState(false);

  function parseEmails(text: string): string[] {
    return Array.from(new Set(
      text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")),
    ));
  }

  async function diagnose(targetEmails?: string[]) {
    const emails = targetEmails ?? parseEmails(raw);
    if (emails.length === 0) {
      toast.error("Cole pelo menos um email válido");
      return;
    }
    if (emails.length > 100) {
      toast.error("Máximo de 100 emails por consulta");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-diagnose-emails", {
        body: { emails },
      });
      if (error) throw error;
      const newResults = (data as any)?.results || [];
      if (targetEmails && targetEmails.length === 1) {
        // Mescla: substitui só o email recarregado
        setResults((prev) => {
          const map = new Map(prev.map((r) => [r.email, r]));
          for (const r of newResults) map.set(r.email, r);
          return Array.from(map.values());
        });
      } else {
        setResults(newResults);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao diagnosticar");
    } finally {
      setLoading(false);
    }
  }

  function openForce(email: string, f: Finding) {
    setForcePrefill({
      email,
      area: f.area || "Sales",
      mrr: f.mrr && f.mrr > 0 ? f.mrr : undefined,
      plan_name: f.plan_name,
      product_name: f.product_name,
      subscription_id: f.subscription_id,
      customer_id: f.customer_id,
      price_id: f.price_id,
      registered_at: f.registered_at,
      converted_at: f.converted_at || new Date().toISOString(),
    });
    setForceOpen(true);
  }

  const flatRows = results.flatMap((r) =>
    r.findings.length > 0
      ? r.findings.map((f) => ({ email: r.email, finding: f }))
      : [{ email: r.email, finding: { status: "error" as const, reason: "Sem resultados" } }],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Diagnosticar emails ausentes</CardTitle>
        <CardDescription>
          Cole emails apontados pela equipe Comercial. O sistema explica linha por linha por que cada um não entrou em
          <strong> Conversões por Área</strong> / <strong>Metas</strong> e oferece ajuste manual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          placeholder="cliente1@empresa.com&#10;cliente2@empresa.com&#10;..."
          className="font-mono text-sm"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Até 100 emails por consulta. Um por linha, ou separados por vírgula.
          </p>
          <Button onClick={() => diagnose()} disabled={loading} size="sm">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
            Diagnosticar
          </Button>
        </div>

        {flatRows.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Email</TableHead>
                  <TableHead className="text-left">Status</TableHead>
                  <TableHead className="text-left">Detalhe</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.map(({ email, finding: f }, i) => {
                  const meta = STATUS_META[f.status];
                  return (
                    <TableRow key={`${email}-${i}`}>
                      <TableCell className="font-mono text-xs">{email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={toneClass(meta.tone)}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{f.reason}</div>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {f.area && f.area !== "desconhecida" && <div>Área: <strong>{f.area}</strong></div>}
                          {f.plan_name && <div>Plano: {f.plan_name}</div>}
                          {f.subscription_id && <div>Sub: <code className="font-mono">{f.subscription_id}</code></div>}
                          {f.price_id && <div>Price: <code className="font-mono">{f.price_id}</code></div>}
                          {f.sub_status && <div>Status Stripe: {f.sub_status}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {f.mrr ? fmtBRL(f.mrr) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.status === "already_counted" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : f.status === "unmapped_price" && f.price_id ? (
                          <div className="flex justify-end gap-2 flex-wrap">
                            <MapStripePriceButton
                              price_id={f.price_id}
                              customer_email={email}
                              mrr={f.mrr}
                              onMapped={() => diagnose([email])}
                            />
                            <Button size="sm" variant="ghost" onClick={() => openForce(email, f)}>Forçar</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openForce(email, f)}>
                            Forçar registro
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ForceConversionDialog
        open={forceOpen}
        onOpenChange={setForceOpen}
        prefill={forcePrefill}
        onSaved={() => forcePrefill && diagnose([forcePrefill.email])}
      />
    </Card>
  );
}
