import { useState } from "react";
import { Layout } from "@/components/Layout";
import { ManagerOnly } from "@/components/ManagerOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDiscountTiers } from "@/hooks/useDiscountData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { formatBRL, type DiscountTier } from "@/lib/discounts";

export default function DiscountRulesPage() {
  return (
    <ManagerOnly>
      <Layout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="font-heading text-2xl font-bold">Configuração de Faixas de Desconto</h1>
            <p className="text-muted-foreground text-sm">
              Defina as faixas de TPV mensal e o valor do desconto aplicado na mensalidade do SaaS.
            </p>
          </div>
          <RulesEditor />
        </div>
      </Layout>
    </ManagerOnly>
  );
}

function RulesEditor() {
  const { data: tiers = [], isLoading } = useDiscountTiers();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<DiscountTier> & { tpv_max_str?: string }>({
    name: "",
    tpv_min: 0,
    tpv_max: null,
    discount_value: 0,
  });

  async function updateRow(id: string, patch: Partial<DiscountTier>) {
    const { error } = await supabase.from("discount_tiers").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Faixa atualizada");
      qc.invalidateQueries({ queryKey: ["discount-tiers"] });
    }
  }

  async function removeRow(id: string) {
    if (!confirm("Excluir esta faixa?")) return;
    const { error } = await supabase.from("discount_tiers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Faixa removida");
      qc.invalidateQueries({ queryKey: ["discount-tiers"] });
    }
  }

  async function addRow() {
    if (!draft.name) return toast.error("Nome obrigatório");
    const payload = {
      name: draft.name,
      tpv_min: Number(draft.tpv_min) || 0,
      tpv_max: draft.tpv_max === null || draft.tpv_max === undefined ? null : Number(draft.tpv_max),
      discount_value: Number(draft.discount_value) || 0,
      position: (tiers.length || 0) + 1,
    };
    const { error } = await supabase.from("discount_tiers").insert(payload as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Faixa criada");
      setDraft({ name: "", tpv_min: 0, tpv_max: null, discount_value: 0 });
      qc.invalidateQueries({ queryKey: ["discount-tiers"] });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Faixas atuais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>TPV mínimo</TableHead>
              <TableHead>TPV máximo</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {tiers.map((t) => (
              <EditableTierRow key={t.id} tier={t} onSave={(p) => updateRow(t.id, p)} onDelete={() => removeRow(t.id)} />
            ))}
            {!isLoading && tiers.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma faixa cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>

        <div className="border-t pt-4">
          <h3 className="font-medium text-sm mb-3">Adicionar nova faixa</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label>Nome</Label>
              <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Elite" />
            </div>
            <div>
              <Label>TPV mínimo</Label>
              <Input type="number" value={draft.tpv_min ?? 0} onChange={(e) => setDraft({ ...draft, tpv_min: Number(e.target.value) })} />
            </div>
            <div>
              <Label>TPV máximo (vazio = sem teto)</Label>
              <Input type="number" value={draft.tpv_max ?? ""} onChange={(e) => setDraft({ ...draft, tpv_max: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label>Desconto (R$)</Label>
              <Input type="number" value={draft.discount_value ?? 0} onChange={(e) => setDraft({ ...draft, discount_value: Number(e.target.value) })} />
            </div>
            <Button onClick={addRow}><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O desconto nunca deixa o valor final negativo. Para clientes em planos de consultoria/BPO,
          o desconto incide apenas sobre o valor do software embutido.
        </p>
      </CardContent>
    </Card>
  );
}

function EditableTierRow({ tier, onSave, onDelete }: { tier: DiscountTier; onSave: (p: Partial<DiscountTier>) => void; onDelete: () => void }) {
  const [local, setLocal] = useState<DiscountTier>(tier);
  const dirty = JSON.stringify(local) !== JSON.stringify(tier);
  return (
    <TableRow>
      <TableCell><Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></TableCell>
      <TableCell><Input type="number" value={local.tpv_min} onChange={(e) => setLocal({ ...local, tpv_min: Number(e.target.value) })} /></TableCell>
      <TableCell>
        <Input
          type="number"
          value={local.tpv_max ?? ""}
          placeholder="Sem teto"
          onChange={(e) => setLocal({ ...local, tpv_max: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input type="number" value={local.discount_value} onChange={(e) => setLocal({ ...local, discount_value: Number(e.target.value) })} />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatBRL(local.discount_value)}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={!dirty} onClick={() => onSave({ name: local.name, tpv_min: local.tpv_min, tpv_max: local.tpv_max, discount_value: local.discount_value })} title="Salvar">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Excluir">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
