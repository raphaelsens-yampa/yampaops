import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ORIGIN_LABELS } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";

interface EditOpportunityDialogProps {
  opportunity: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageOrder: string[];
  stageLabels: Record<string, string>;
  profiles: any[];
  onUpdated: () => void;
}

export function EditOpportunityDialog({
  opportunity, open, onOpenChange, stageOrder, stageLabels, profiles, onUpdated,
}: EditOpportunityDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [origin, setOrigin] = useState("freetrial");
  const [subOrigin, setSubOrigin] = useState("");
  const [stage, setStage] = useState("");
  const [mrr, setMrr] = useState("");
  const [tpv, setTpv] = useState("");
  const [probability, setProbability] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [notes, setNotes] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [productId, setProductId] = useState("");
  const [billingType, setBillingType] = useState("monthly");
  const [isActive, setIsActive] = useState(true);
  const [cancellationDate, setCancellationDate] = useState("");
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from("commission_products").select("id, name").order("name").then(({ data }) => {
      setProducts(data || []);
    });
  }, []);

  useEffect(() => {
    if (opportunity) {
      setTitle(opportunity.title || "");
      setName(opportunity.name || "");
      setCompany(opportunity.company || "");
      setOrigin(opportunity.origin || "freetrial");
      setSubOrigin(opportunity.sub_origin || "");
      setStage(opportunity.stage || "");
      setMrr(opportunity.estimated_mrr?.toString() || "");
      setTpv(opportunity.estimated_tpv?.toString() || "");
      setProbability(opportunity.probability?.toString() || "");
      setCloseDate(opportunity.estimated_close_date || "");
      setConsultantId(opportunity.consultant_id || "");
      setNotes(opportunity.notes || "");
      setLossReason(opportunity.loss_reason || "");
      setProductId(opportunity.product_id || "");
      setBillingType(opportunity.billing_type || "monthly");
      setIsActive(opportunity.is_active !== false);
      setCancellationDate(opportunity.cancellation_date || "");
    }
  }, [opportunity]);

  const handleSave = async () => {
    if (!opportunity) return;
    setSaving(true);
    const { error } = await supabase.from("opportunities").update({
      title: title || null,
      name,
      company: company || null,
      origin: origin as any,
      sub_origin: subOrigin || null,
      stage,
      estimated_mrr: mrr ? Number(mrr) : null,
      estimated_tpv: tpv ? Number(tpv) : null,
      probability: probability ? Number(probability) : null,
      estimated_close_date: closeDate || null,
      consultant_id: consultantId || null,
      notes: notes || null,
      loss_reason: lossReason || null,
      product_id: productId || null,
      billing_type: billingType,
      is_active: isActive,
      cancellation_date: cancellationDate || null,
    }).eq("id", opportunity.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Oportunidade atualizada" });
      onUpdated();
      onOpenChange(false);
    }
  };

  const handleDelete = async () => {
    if (!opportunity || !confirm("Tem certeza que deseja excluir esta oportunidade?")) return;
    setDeleting(true);
    const { error } = await supabase.from("opportunities").delete().eq("id", opportunity.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Oportunidade excluída" });
      onUpdated();
      onOpenChange(false);
    }
  };

  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Oportunidade</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da oportunidade" />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label>Empresa</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Etapa</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOrder.map(s => (
                    <SelectItem key={s} value={s}>{stageLabels[s] || s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal de Origem</Label>
              <Select value={origin} onValueChange={setOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGIN_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>MRR (R$)</Label>
              <Input type="number" value={mrr} onChange={e => setMrr(e.target.value)} />
            </div>
            <div>
              <Label>TPV (R$)</Label>
              <Input type="number" value={tpv} onChange={e => setTpv(e.target.value)} />
            </div>
            <div>
              <Label>Probabilidade (%)</Label>
              <Input type="number" value={probability} onChange={e => setProbability(e.target.value)} min="0" max="100" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data prevista de fechamento</Label>
              <Input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
            </div>
            <div>
              <Label>Sub-origem</Label>
              <Input value={subOrigin} onChange={e => setSubOrigin(e.target.value)} placeholder="Ex: campanha X" />
            </div>
          </div>

          <div>
            <Label>Consultor</Label>
            <Select value={consultantId} onValueChange={setConsultantId}>
              <SelectTrigger><SelectValue placeholder="Selecionar consultor" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Cobrança</Label>
              <Select value={billingType} onValueChange={setBillingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Oportunidade Ativa</Label>
              <p className="text-xs text-muted-foreground">Desmarque para registrar cancelamento</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {!isActive && (
            <div>
              <Label>Data de Cancelamento</Label>
              <Input type="date" value={cancellationDate} onChange={e => setCancellationDate(e.target.value)} />
            </div>
          )}

          <div>
            <Label>Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          {stage === "perdido" && (
            <div>
              <Label>Motivo da perda</Label>
              <Textarea value={lossReason} onChange={e => setLossReason(e.target.value)} rows={2} placeholder="Por que essa oportunidade foi perdida?" />
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
