import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Check, X, Tag as TagIcon } from "lucide-react";
import { PipelineFunnel } from "@/components/PipelineFunnel";

export type FunnelStage = {
  id: string;
  name: string;
  color: string;
  tags: string[];
  match: "all" | "any";
  is_conversion?: boolean;
  position?: number;
};

const DEFAULT_COLORS = [
  "hsl(193, 99%, 44%)", "hsl(210, 78%, 52%)", "hsl(260, 65%, 50%)",
  "hsl(280, 60%, 48%)", "hsl(152, 60%, 42%)",
];

function newStage(pos: number): FunnelStage {
  return {
    id: crypto.randomUUID(),
    name: `Etapa ${pos + 1}`,
    color: DEFAULT_COLORS[pos % DEFAULT_COLORS.length],
    tags: [],
    match: "any",
    is_conversion: false,
  };
}

function useCampaignTags(campaignId: string) {
  return useQuery({
    queryKey: ["scc-campaign-tags", campaignId],
    queryFn: async () => {
      const [campaignRes, globalRes] = await Promise.all([
        (supabase as any).rpc("scc_list_campaign_tags", { p_campaign_id: campaignId }),
        (supabase as any).rpc("get_chatwoot_labels"),
      ]);
      if (campaignRes.error) throw campaignRes.error;
      if (globalRes.error) throw globalRes.error;
      const campaignTags = (campaignRes.data ?? []) as { tag: string; usage_count: number }[];
      const seen = new Set(campaignTags.map((t) => t.tag));
      const globalTags = ((globalRes.data ?? []) as string[])
        .filter((t) => t && !seen.has(t))
        .map((t) => ({ tag: t, usage_count: 0 }));
      return [...campaignTags, ...globalTags];
    },
    staleTime: 30_000,
  });
}

export function TagFunnelTab({ campaign }: { campaign: any }) {
  const qc = useQueryClient();
  const stages: FunnelStage[] = useMemo(() => {
    const s = (campaign.funnel_stages ?? []) as FunnelStage[];
    return [...s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [campaign.funnel_stages]);

  const { data: funnel, isLoading, refetch } = useQuery({
    queryKey: ["scc-tag-funnel", campaign.id],
    enabled: stages.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("scc_compute_tag_funnel", { p_campaign_id: campaign.id });
      if (error) throw error;
      return (data ?? []) as { stage_id: string; contact_count: number; mrr_total: number; contact_ids: string[] }[];
    },
  });

  const { data: baseTotal } = useQuery({
    queryKey: ["scc-base-total", campaign.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales_campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil de Tags</CardTitle>
          <CardDescription>Configure as etapas do funil em "Configuração" para começar a acompanhar.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const data: Record<string, { count: number; mrr: number }> = {};
  const stageOrder: string[] = [];
  const stageLabels: Record<string, string> = {};
  stages.forEach((s) => {
    stageOrder.push(s.id);
    stageLabels[s.id] = s.name;
    const found = funnel?.find((f) => f.stage_id === s.id);
    data[s.id] = { count: found?.contact_count ?? 0, mrr: Number(found?.mrr_total ?? 0) };
  });

  const topCount = data[stageOrder[0]]?.count ?? 0;

  return (
    <div className="space-y-4">
      <PipelineFunnel
        data={data}
        stageOrder={stageOrder}
        stageLabels={stageLabels}
        subtitle={`Base: ${baseTotal ?? 0} contatos · Topo do funil: ${topCount} (${baseTotal ? ((topCount / baseTotal) * 100).toFixed(0) : 0}% da base)`}
        rightSlot={
          <Button size="sm" variant="outline" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["scc-campaign-tags", campaign.id] }); }}>
            Recalcular
          </Button>
        }
      />
      {isLoading && <p className="text-xs text-muted-foreground">Calculando...</p>}
    </div>
  );
}

export function TagFunnelEditor({ campaign, onSaved }: { campaign: any; onSaved: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const initial: FunnelStage[] = useMemo(() => {
    const s = (campaign.funnel_stages ?? []) as FunnelStage[];
    return [...s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [campaign.funnel_stages]);
  const [stages, setStages] = useState<FunnelStage[]>(initial);
  const { data: knownTags = [] } = useCampaignTags(campaign.id);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const copy = [...stages];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setStages(copy);
  };
  const update = (i: number, patch: Partial<FunnelStage>) => {
    const copy = [...stages];
    copy[i] = { ...copy[i], ...patch };
    setStages(copy);
  };
  const remove = (i: number) => setStages(stages.filter((_, idx) => idx !== i));
  const add = () => setStages([...stages, newStage(stages.length)]);

  const save = async () => {
    const payload = stages.map((s, i) => ({ ...s, position: i }));
    const { error } = await supabase
      .from("sales_campaigns")
      .update({ funnel_stages: payload as any })
      .eq("id", campaign.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Funil de tags salvo" });
    qc.invalidateQueries({ queryKey: ["scc-tag-funnel", campaign.id] });
    onSaved();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Funil de Tags do Chatwoot</CardTitle>
          <CardDescription>
            Defina as etapas do funil de conversação. Cada contato é alocado na etapa mais avançada cujas tags estão presentes nas conversas dele.
          </CardDescription>
        </div>
        <Button size="sm" onClick={save}><Save className="h-4 w-4 mr-1" />Salvar funil</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma etapa configurada. Adicione a primeira abaixo.</p>
        )}
        {stages.map((s, i) => (
          <div key={s.id} className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground w-6">{i + 1}</span>
              <Input
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Nome da etapa"
                className="font-medium flex-1"
              />
              <Input
                type="color"
                value={s.color.startsWith("#") ? s.color : "#01B8E0"}
                onChange={(e) => update(i, { color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
                title="Cor"
              />
              <Select value={s.match} onValueChange={(v) => update(i, { match: v as any })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer tag</SelectItem>
                  <SelectItem value="all">Todas as tags</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === stages.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div>
              <Label className="text-xs">Tags do Chatwoot</Label>
              <TagMultiSelect
                value={s.tags}
                onChange={(tags) => update(i, { tags })}
                options={knownTags.map((t) => t.tag)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={!!s.is_conversion}
                onChange={(e) => update(i, { is_conversion: e.target.checked })}
              />
              Esta é a etapa final (conversão)
            </label>
          </div>
        ))}
        <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar etapa</Button>
      </CardContent>
    </Card>
  );
}

function TagMultiSelect({
  value, onChange, options,
}: { value: string[]; onChange: (v: string[]) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else onChange([...value, tag]);
  };
  const addFree = () => {
    const t = input.trim();
    if (!t) return;
    if (!value.includes(t)) onChange([...value, t]);
    setInput("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1 min-h-[28px]">
        {value.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhuma tag selecionada</span>}
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1 font-mono text-[11px]">
            <TagIcon className="h-3 w-3" /> {t}
            <button onClick={() => toggle(t)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Selecionar tag</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar ou digitar tag..." />
              <CommandList>
                <CommandEmpty>Nenhuma tag encontrada.</CommandEmpty>
                <CommandGroup heading={`Tags vistas (${options.length})`}>
                  {options.map((tag) => {
                    const active = value.includes(tag);
                    return (
                      <CommandItem key={tag} value={tag} onSelect={() => toggle(tag)}>
                        <Check className={`mr-2 h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-0"}`} />
                        <span className="font-mono text-xs">{tag}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFree(); } }}
          placeholder="Ou digite e Enter"
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}
