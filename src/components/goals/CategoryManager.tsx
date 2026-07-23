import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Lock, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AREA_LABELS, METRIC_TYPE_LABELS, AUTO_SOURCE_LABELS, GOAL_DIRECTION_LABELS, STRIPE_AREA_PRESETS,
  type CategoryArea, type MetricType, type AutoSource, type GoalCategory, type GoalDirection,
} from "@/lib/goalCategories";

const AUTO_KEYS: AutoSource[] = [
  "manual", "stripe", "stripe_ltv", "stripe_cac", "stripe_ltv_cac",
  "stripe_churn_mrr", "stripe_churn_logos", "stripe_churn_rate_logos",
  "deals_count",
];
const CHURN_SOURCES = new Set<AutoSource>(["stripe_churn_mrr", "stripe_churn_logos", "stripe_churn_rate_logos"]);

export function CategoryManager() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<GoalCategory[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GoalCategory | null>(null);

  const [name, setName] = useState("");
  const [area, setArea] = useState<CategoryArea>("sales");
  const [metricType, setMetricType] = useState<MetricType>("mrr");
  const [description, setDescription] = useState("");
  const [autoSource, setAutoSource] = useState<AutoSource>("manual");
  const [stripeArea, setStripeArea] = useState<string>("");
  const [goalDirection, setGoalDirection] = useState<GoalDirection>("gte");

  async function load() {
    const { data } = await supabase.from("goal_categories").select("*").order("area").order("name");
    setCategories((data as GoalCategory[]) || []);
  }
  useEffect(() => { load(); }, []);

  function slugify(s: string) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  function resetForm() {
    setEditing(null);
    setName(""); setDescription(""); setArea("sales"); setMetricType("mrr");
    setAutoSource("manual"); setStripeArea(""); setGoalDirection("gte");
  }

  function openEdit(c: GoalCategory) {
    setEditing(c);
    setName(c.name);
    setArea(c.area);
    setMetricType(c.metric_type);
    setDescription(c.description || "");
    setAutoSource((c.auto_source as AutoSource) || "manual");
    setStripeArea(c.stripe_area || "");
    setGoalDirection((c.goal_direction as GoalDirection) || "gte");
    setOpen(true);
  }

  async function save() {
    if (!name.trim()) return;
    const usesStripeArea = autoSource === "stripe" || CHURN_SOURCES.has(autoSource);
    const payload: any = {
      name: name.trim(),
      area,
      metric_type: metricType,
      description: description || null,
      auto_source: autoSource,
      stripe_area: usesStripeArea ? (stripeArea || null) : null,
      goal_direction: goalDirection,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("goal_categories").update(payload).eq("id", editing.id));
    } else {
      payload.slug = slugify(name) + "_" + Date.now().toString(36);
      payload.is_system = false;
      payload.is_active = true;
      ({ error } = await supabase.from("goal_categories").insert(payload));
    }
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Categoria atualizada" : "Categoria criada" });
    setOpen(false); resetForm(); load();
  }

  async function toggleActive(c: GoalCategory) {
    const { error } = await supabase.from("goal_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function deleteCategory(c: GoalCategory) {
    if (c.is_system) return;
    if (!confirm(`Excluir categoria "${c.name}"?`)) return;
    const { error } = await supabase.from("goal_categories").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    load();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-lg">Categorias de Meta</CardTitle>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Categoria</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar Categoria" : "Nova Categoria"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Expansão Enterprise" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Área</Label>
                  <Select value={area} onValueChange={(v) => setArea(v as CategoryArea)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(AREA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Métrica</Label>
                  <Select value={metricType} onValueChange={(v) => setMetricType(v as MetricType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METRIC_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Fonte do realizado</Label>
                <Select value={autoSource} onValueChange={(v) => setAutoSource(v as AutoSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUTO_KEYS.map((k) => <SelectItem key={k} value={k}>{AUTO_SOURCE_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(autoSource === "stripe" || CHURN_SOURCES.has(autoSource)) && (
                <div>
                  <Label>Área Stripe (filtro)</Label>
                  <Select value={stripeArea || "__none"} onValueChange={(v) => setStripeArea(v === "__none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a área" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Todas —</SelectItem>
                      {STRIPE_AREA_PRESETS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CHURN_SOURCES.has(autoSource)
                      ? "Se preenchido, considera apenas cancelamentos cuja área bata com este valor."
                      : "O realizado virá da soma do MRR líquido das conversões cujo área bate com este valor."}
                  </p>
                </div>
              )}
              <div>
                <Label>Direção do alvo</Label>
                <Select value={goalDirection} onValueChange={(v) => setGoalDirection(v as GoalDirection)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GOAL_DIRECTION_LABELS) as GoalDirection[]).map((k) => (
                      <SelectItem key={k} value={k}>{GOAL_DIRECTION_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Use "Teto" para métricas como churn, em que o objetivo é ficar abaixo do valor.
                </p>
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <Button onClick={save} className="w-full">{editing ? "Salvar" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Métrica</TableHead>
              <TableHead>Fonte</TableHead>
              <TableHead>Área Stripe</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead className="text-center">Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  {c.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}
                  {c.name}
                </TableCell>
                <TableCell><Badge variant="outline">{AREA_LABELS[c.area]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{METRIC_TYPE_LABELS[c.metric_type]}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{AUTO_SOURCE_LABELS[(c.auto_source as AutoSource) || "manual"]}</TableCell>
                <TableCell className="text-xs">{c.stripe_area || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant={c.goal_direction === "lte" ? "secondary" : "outline"} className="text-[10px]">
                    {c.goal_direction === "lte" ? "Teto" : "Alvo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!c.is_system && (
                      <Button variant="ghost" size="icon" onClick={() => deleteCategory(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground p-6">Nenhuma categoria</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
