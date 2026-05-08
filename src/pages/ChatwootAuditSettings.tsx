import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, X, Plus, RefreshCw } from "lucide-react";

const MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (recomendado)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (mais barato)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (mais preciso)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5 (premium)" },
];

export default function ChatwootAuditSettings() {
  const { role } = useAuth();
  if (role !== "admin") return <Navigate to="/atendimentos/auditoria" replace />;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["audit-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("chatwoot_audit_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  const [profanityInput, setProfanityInput] = useState("");
  const [competitorInput, setCompetitorInput] = useState("");
  const [backfillDays, setBackfillDays] = useState(30);

  useEffect(() => { if (data && !form) setForm(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ai_model: form.ai_model,
        profanity_keywords: form.profanity_keywords,
        competitor_keywords: form.competitor_keywords,
        playbook_items: form.playbook_items,
        attention_threshold: form.attention_threshold,
        critical_threshold: form.critical_threshold,
        custom_instructions: form.custom_instructions,
      };
      const { error } = await supabase.from("chatwoot_audit_settings").update(payload).eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      qc.invalidateQueries({ queryKey: ["audit-settings"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const since = new Date(Date.now() - backfillDays * 24 * 3600 * 1000).toISOString();
      const before = new Date().toISOString();
      const { data, error } = await supabase.functions.invoke("chatwoot-audit-run", {
        body: { since, before, limit: 500, triggered_by: "backfill" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => toast.success(`Backfill: ${d?.analyzed || 0} analisados, ${d?.skipped || 0} já atualizados, ${d?.failed || 0} falharam.`),
    onError: (e: any) => toast.error("Erro no backfill: " + e.message),
  });

  if (isLoading || !form) {
    return <Layout><div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div></Layout>;
  }

  const addToList = (field: "profanity_keywords" | "competitor_keywords", value: string, setter: (v: string) => void) => {
    const v = value.trim().toLowerCase();
    if (!v) return;
    setForm({ ...form, [field]: Array.from(new Set([...(form[field] || []), v])) });
    setter("");
  };
  const removeFromList = (field: "profanity_keywords" | "competitor_keywords", v: string) => {
    setForm({ ...form, [field]: (form[field] || []).filter((x: string) => x !== v) });
  };

  const updatePlaybook = (idx: number, key: string, value: any) => {
    const items = [...form.playbook_items];
    items[idx] = { ...items[idx], [key]: value };
    setForm({ ...form, playbook_items: items });
  };
  const addPlaybook = () => {
    setForm({ ...form, playbook_items: [...form.playbook_items, { key: "novo_item", label: "Novo item" }] });
  };
  const removePlaybook = (idx: number) => {
    setForm({ ...form, playbook_items: form.playbook_items.filter((_: any, i: number) => i !== idx) });
  };

  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <h1 className="text-2xl font-heading font-bold">Configurações de Auditoria</h1>
            <p className="text-sm text-muted-foreground">Ajuste palavras-chave, playbook, modelo de IA e thresholds.</p>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Modelo de IA</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={form.ai_model} onValueChange={(v) => setForm({ ...form, ai_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Flash é o melhor custo-benefício para auditorias diárias.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Thresholds de severidade</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Atenção abaixo de</Label>
              <Input type="number" value={form.attention_threshold} onChange={(e) => setForm({ ...form, attention_threshold: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Crítico abaixo de</Label>
              <Input type="number" value={form.critical_threshold} onChange={(e) => setForm({ ...form, critical_threshold: Number(e.target.value) })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Palavrões / palavras inadequadas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Adicionar palavra..." value={profanityInput} onChange={(e) => setProfanityInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("profanity_keywords", profanityInput, setProfanityInput))} />
              <Button type="button" variant="outline" onClick={() => addToList("profanity_keywords", profanityInput, setProfanityInput)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.profanity_keywords || []).map((k: string) => (
                <Badge key={k} variant="outline" className="gap-1">
                  {k}
                  <button onClick={() => removeFromList("profanity_keywords", k)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Concorrentes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nome do concorrente..." value={competitorInput} onChange={(e) => setCompetitorInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("competitor_keywords", competitorInput, setCompetitorInput))} />
              <Button type="button" variant="outline" onClick={() => addToList("competitor_keywords", competitorInput, setCompetitorInput)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form.competitor_keywords || []).map((k: string) => (
                <Badge key={k} variant="outline" className="gap-1">
                  {k}
                  <button onClick={() => removeFromList("competitor_keywords", k)}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Itens do playbook</CardTitle>
              <Button size="sm" variant="outline" onClick={addPlaybook}><Plus className="h-3 w-3 mr-1" /> Item</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(form.playbook_items || []).map((it: any, idx: number) => (
              <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                <Input value={it.key} onChange={(e) => updatePlaybook(idx, "key", e.target.value)} placeholder="chave" />
                <Input value={it.label} onChange={(e) => updatePlaybook(idx, "label", e.target.value)} placeholder="descrição mostrada à IA" />
                <Button size="icon" variant="ghost" onClick={() => removePlaybook(idx)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Instruções customizadas (opcional)</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={4} placeholder="Ex: 'Considere mais grave qualquer menção a juros abusivos...'" value={form.custom_instructions || ""} onChange={(e) => setForm({ ...form, custom_instructions: e.target.value })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Backfill manual</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Roda a auditoria retroativa nos últimos N dias. Útil para popular o dashboard pela primeira vez.</p>
            <div className="flex items-center gap-2">
              <Label>Últimos</Label>
              <Input type="number" value={backfillDays} onChange={(e) => setBackfillDays(Number(e.target.value))} className="w-24" />
              <span>dias</span>
              <Button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending} className="ml-auto">
                {backfillMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Rodar backfill
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
