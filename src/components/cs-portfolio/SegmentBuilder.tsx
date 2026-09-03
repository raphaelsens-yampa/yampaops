import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { RULE_FIELDS, RULE_OPS, fmtBRL, type CsSegment, type RuleOp, type SegmentRule } from "@/lib/csPortfolio";
import { previewSegment, useCsSegmentMutations } from "@/hooks/useCsPortfolio";

const emptyDraft = (): Partial<CsSegment> => ({
  name: "",
  color: "#01B8E0",
  cadence_days: 30,
  rules: [],
  priority: 100,
  is_active: true,
});

export function SegmentBuilder({ segments }: { segments: CsSegment[] }) {
  const { saveSegment, deleteSegment } = useCsSegmentMutations();
  const [draft, setDraft] = useState<(Partial<CsSegment> & { id?: string }) | null>(null);
  const [preview, setPreview] = useState<{ count: number; mrr: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const rules = (draft?.rules || []) as SegmentRule[];
  const setRules = (r: SegmentRule[]) => setDraft((d) => ({ ...(d || {}), rules: r }));

  async function runPreview() {
    setPreviewing(true);
    try {
      setPreview(await previewSegment(rules));
    } catch (e: any) {
      toast.error(e.message || "Falha na simulação");
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    if (!draft?.name?.trim()) return toast.error("Informe o nome do segmento");
    try {
      await saveSegment.mutateAsync(draft);
      toast.success("Segmento salvo");
      setDraft(null);
      setPreview(null);
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Segmentos</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Regras combináveis sobre a base de ativos pagantes. Prioridade menor vence quando o cliente atende mais de um segmento.
          </p>
        </div>
        <Button size="sm" onClick={() => { setDraft(emptyDraft()); setPreview(null); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {segments.length === 0 && <p className="text-sm text-muted-foreground">Nenhum segmento cadastrado.</p>}
        {segments.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
                <p className="font-medium truncate">{s.name}</p>
                {!s.is_active && <Badge variant="outline">Inativo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                Cadência {s.cadence_days}d · prioridade {s.priority} · {s.rules.length} regra(s)
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => { setDraft({ ...s }); setPreview(null); }}>Editar</Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`Excluir o segmento "${s.name}"?`)) return;
                  try { await deleteSegment.mutateAsync(s.id); toast.success("Segmento excluído"); }
                  catch (e: any) { toast.error(e.message); }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{draft?.id ? "Editar segmento" : "Novo segmento"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2 space-y-1">
                <Label>Nome</Label>
                <Input value={draft?.name || ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Cadência (dias)</Label>
                <Input
                  type="number" min={1}
                  value={draft?.cadence_days ?? 30}
                  onChange={(e) => setDraft((d) => ({ ...d, cadence_days: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={draft?.priority ?? 100}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Cor</Label>
                <Input type="color" value={draft?.color || "#01B8E0"} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={draft?.is_active ?? true} onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))} />
                <Label>Ativo</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Regras (todas precisam ser verdadeiras)</Label>
                <Button size="sm" variant="outline" onClick={() => setRules([...rules, { field: "plano", op: "eq", value: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Regra
                </Button>
              </div>
              {rules.length === 0 && <p className="text-xs text-muted-foreground">Sem regras: o segmento aceita todos os clientes.</p>}
              {rules.map((r, i) => {
                const op = RULE_OPS.find((o) => o.key === r.op);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Select value={r.field} onValueChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, field: v } : x)))}>
                      <SelectTrigger className="col-span-4 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RULE_FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={r.op} onValueChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, op: v as RuleOp } : x)))}>
                      <SelectTrigger className="col-span-3 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RULE_OPS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {op?.needsValue ? (
                      <Input
                        className="col-span-4 h-9"
                        placeholder={op.list ? "valor1, valor2" : "valor"}
                        value={Array.isArray(r.value) ? (r.value as string[]).join(", ") : String(r.value ?? "")}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = op.list ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw;
                          setRules(rules.map((x, j) => (j === i ? { ...x, value: val } : x)));
                        }}
                      />
                    ) : <div className="col-span-4" />}
                    <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing}>
                <Wand2 className="h-4 w-4 mr-1" /> Simular
              </Button>
              {preview && (
                <p className="text-sm">
                  <strong>{preview.count}</strong> clientes · MRR {fmtBRL(preview.mrr)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saveSegment.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
