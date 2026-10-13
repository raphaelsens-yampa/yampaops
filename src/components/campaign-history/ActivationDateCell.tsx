import { useState } from "react";
import { Pencil, RotateCcw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR } from "@/lib/campaignCohort";

type Props = {
  contactId: string;
  activatedAt: string | null;
  fallback: string | null | undefined;
  onSaved: () => void;
};

/** Data de ativação editável: sobrescreve a data de início da assinatura no cohort. */
export function ActivationDateCell({ contactId, activatedAt, fallback, onSaved }: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (v: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("campaign_cohort_contacts")
      .update({ activated_at: v })
      .eq("id", contactId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar data", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    toast({ title: v ? "Data de ativação ajustada" : "Ajuste de data removido" });
    onSaved();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input type="date" className="h-7 w-36 text-xs" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!value || saving} onClick={() => save(value)}>
          <Check className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span title={activatedAt ? `Ajustada manualmente (original: ${formatDateBR(fallback)})` : undefined}>
        {formatDateBR(activatedAt ?? fallback)}
      </span>
      {activatedAt && <span className="text-[10px] text-primary">ajustada</span>}
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        title="Editar data de ativação no cohort"
        onClick={() => {
          setValue(String(activatedAt ?? fallback ?? "").slice(0, 10));
          setEditing(true);
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      {activatedAt && (
        <Button size="icon" variant="ghost" className="h-6 w-6" title="Voltar à data original" disabled={saving} onClick={() => save(null)}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
