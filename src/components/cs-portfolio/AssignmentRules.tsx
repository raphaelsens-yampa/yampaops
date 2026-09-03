import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CsAssignmentRule, CsSegment } from "@/lib/csPortfolio";
import { useCsSegmentMutations } from "@/hooks/useCsPortfolio";

export function AssignmentRules({
  segments,
  rules,
  analysts,
}: {
  segments: CsSegment[];
  rules: CsAssignmentRule[];
  analysts: { user_id: string; full_name: string | null; email: string | null }[];
}) {
  const { saveAssignment, deleteAssignment } = useCsSegmentMutations();
  const [draft, setDraft] = useState<Partial<CsAssignmentRule> | null>(null);

  const name = (id: string | null) => analysts.find((a) => a.user_id === id)?.full_name || analysts.find((a) => a.user_id === id)?.email || "—";
  const segName = (id: string) => segments.find((s) => s.id === id)?.name || "—";

  async function save() {
    if (!draft?.segment_id) return toast.error("Selecione o segmento");
    if (!draft.cs_user_ids?.length) return toast.error("Selecione pelo menos um CS");
    try {
      await saveAssignment.mutateAsync({
        id: draft.id,
        segment_id: draft.segment_id,
        mode: draft.mode || "round_robin",
        cs_user_ids: draft.cs_user_ids,
        is_active: draft.is_active ?? true,
      });
      toast.success("Regra de encarteiramento salva");
      setDraft(null);
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Encarteiramento por segmento</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Atribuição automática na atualização da carteira. Atribuições manuais nunca são sobrescritas.
          </p>
        </div>
        <Button size="sm" onClick={() => setDraft({ mode: "round_robin", cs_user_ids: [], is_active: true })}>
          <Plus className="h-4 w-4 mr-1" /> Nova regra
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{segName(r.segment_id)}</p>
              <p className="text-xs text-muted-foreground">
                {r.mode === "fixed" ? "CS fixo" : "Round-robin"} · {r.cs_user_ids.map((id) => name(id)).join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!r.is_active && <Badge variant="outline">Inativa</Badge>}
              <Button size="sm" variant="outline" onClick={() => setDraft({ ...r })}>Editar</Button>
              <Button
                size="sm" variant="ghost"
                onClick={async () => {
                  if (!confirm("Excluir esta regra?")) return;
                  try { await deleteAssignment.mutateAsync(r.id); toast.success("Regra excluída"); }
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? "Editar regra" : "Nova regra"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Segmento</Label>
              <Select value={draft?.segment_id || ""} onValueChange={(v) => setDraft((d) => ({ ...d, segment_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Modo</Label>
              <Select value={draft?.mode || "round_robin"} onValueChange={(v) => setDraft((d) => ({ ...d, mode: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">CS fixo (primeiro da lista)</SelectItem>
                  <SelectItem value="round_robin">Round-robin entre os CS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Analistas de CS</Label>
              <div className="max-h-52 overflow-y-auto space-y-1 rounded-md border p-2">
                {analysts.map((a) => {
                  const checked = (draft?.cs_user_ids || []).includes(a.user_id);
                  return (
                    <label key={a.user_id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setDraft((d) => {
                            const cur = d?.cs_user_ids || [];
                            return { ...d, cs_user_ids: v ? [...cur, a.user_id] : cur.filter((x) => x !== a.user_id) };
                          })
                        }
                      />
                      {a.full_name || a.email}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saveAssignment.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
