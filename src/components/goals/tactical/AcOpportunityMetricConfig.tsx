import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StageOption {
  ac_stage_id: string;
  title: string;
}

interface Props {
  groupId: string;
  stages: StageOption[];
  owners: string[];
  canEdit: boolean;
}

const NONE = "__none__";

/**
 * Configura a métrica tática "Oportunidades abertas": qual movimentação de
 * etapa conta como oportunidade aberta e o vínculo proprietário AC -> vendedor.
 */
export function AcOpportunityMetricConfig({ groupId, stages, owners, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fromStage, setFromStage] = useState("");
  const [toStage, setToStage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [cfg, pf, om] = await Promise.all([
        supabase.from("ac_stage_move_config").select("*").eq("metric_key", "oportunidades_abertas").maybeSingle(),
        supabase.from("profiles").select("user_id, full_name").order("full_name"),
        supabase.from("ac_owner_seller_map").select("owner_name, seller_id").eq("ac_group_id", groupId),
      ]);
      if (cancelled) return;
      const c = cfg.data as any;
      setFromStage(c?.from_stage_id ?? "");
      setToStage(c?.to_stage_id ?? "");
      setStartDate(c?.start_date ?? "");
      setProfiles((pf.data as any[]) ?? []);
      const m: Record<string, string> = {};
      for (const row of (om.data as any[]) ?? []) m[row.owner_name] = row.seller_id;
      setMap(m);
      setLoading(false);
    }
    if (groupId) load();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  /** Vendedor resolvido automaticamente por nome igual ao do perfil. */
  const autoMatch = (owner: string) =>
    profiles.find((p) => (p.full_name ?? "").trim().toLowerCase() === owner.trim().toLowerCase());

  async function saveConfig() {
    if (!fromStage || !toStage) {
      toast.error("Selecione a etapa de origem e a de destino");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ac_stage_move_config").upsert(
      {
        metric_key: "oportunidades_abertas",
        ac_group_id: groupId,
        from_stage_id: fromStage,
        to_stage_id: toStage,
        start_date: startDate || new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "metric_key" },
    );
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configuração salva — o realizado da meta usa esse par de etapas");
  }

  async function saveOwner(owner: string, sellerId: string) {
    if (sellerId === NONE) {
      const { error } = await supabase
        .from("ac_owner_seller_map")
        .delete()
        .eq("ac_group_id", groupId)
        .eq("owner_name", owner);
      if (error) return toast.error(error.message);
      setMap((prev) => {
        const next = { ...prev };
        delete next[owner];
        return next;
      });
      return;
    }
    const { error } = await supabase.from("ac_owner_seller_map").upsert(
      { ac_group_id: groupId, owner_name: owner, seller_id: sellerId, updated_at: new Date().toISOString() },
      { onConflict: "ac_group_id,owner_name" },
    );
    if (error) return toast.error(error.message);
    setMap((prev) => ({ ...prev, [owner]: sellerId }));
    toast.success("Vínculo atualizado");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meta tática — Oportunidades abertas</CardTitle>
        <CardDescription>
          O realizado da meta "Oportunidades abertas" (painel de Metas Táticas) é a quantidade de negócios que cada
          vendedor moveu da etapa de origem para a de destino, por dia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Etapa de origem</Label>
                <Select value={fromStage} onValueChange={setFromStage} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.ac_stage_id} value={s.ac_stage_id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa de destino</Label>
                <Select value={toStage} onValueChange={setToStage} disabled={!canEdit}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.ac_stage_id} value={s.ac_stage_id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contar a partir de</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canEdit} />
              </div>
              <div className="flex items-end">
                <Button onClick={saveConfig} disabled={!canEdit || saving} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Proprietários do ActiveCampaign</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Nomes iguais ao cadastro são vinculados automaticamente. Use o seletor para os que não casam.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proprietário no AC</TableHead>
                      <TableHead>Vendedor no painel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owners.map((o) => {
                      const auto = autoMatch(o);
                      const value = map[o] ?? auto?.user_id ?? NONE;
                      return (
                        <TableRow key={o}>
                          <TableCell className="font-medium">{o}</TableCell>
                          <TableCell>
                            <Select value={value} onValueChange={(v) => saveOwner(o, v)} disabled={!canEdit}>
                              <SelectTrigger className="w-full sm:w-[260px]">
                                <SelectValue placeholder="Sem vínculo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>Sem vínculo (não conta)</SelectItem>
                                {profiles.map((p) => (
                                  <SelectItem key={p.user_id} value={p.user_id}>
                                    {p.full_name || p.user_id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!map[o] && auto && (
                              <span className="ml-2 text-xs text-muted-foreground">vínculo automático por nome</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!owners.length && (
                      <TableRow>
                        <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                          Nenhum proprietário sincronizado neste funil.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
