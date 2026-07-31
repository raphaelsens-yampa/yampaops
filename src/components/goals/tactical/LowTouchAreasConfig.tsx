import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Settings2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { LowTouchArea } from "./useLowTouchData";

interface Props {
  areas: LowTouchArea[];
  allLabels: string[];
  canEdit: boolean;
  onChanged: () => void;
}

export function LowTouchAreasConfig({ areas, allLabels, canEdit, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const activeLabels = new Set(areas.filter((a) => a.is_active).map((a) => a.label));

  async function toggle(label: string, next: boolean) {
    setSaving(label);
    const existing = areas.find((a) => a.label === label);
    const { error } = existing
      ? await supabase.from("tactical_lowtouch_areas").update({ is_active: next }).eq("id", existing.id)
      : await supabase.from("tactical_lowtouch_areas").insert({ label, is_active: next });
    setSaving(null);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    onChanged();
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-left w-full">
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Áreas Low-touch</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeLabels.size} área(s) marcada(s): {Array.from(activeLabels).join(", ") || "nenhuma"}
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {!canEdit && (
              <p className="text-xs text-muted-foreground mb-3">
                Somente usuários Admin ou Tático podem alterar as áreas.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allLabels.map((label) => (
                <label
                  key={label}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={activeLabels.has(label)}
                    disabled={!canEdit || saving === label}
                    onCheckedChange={(v) => toggle(label, Boolean(v))}
                  />
                  <span>{label}</span>
                </label>
              ))}
              {allLabels.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum rótulo de Vendedor/Área encontrado no Mapa de Preços.
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
