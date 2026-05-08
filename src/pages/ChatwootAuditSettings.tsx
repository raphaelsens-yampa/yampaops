import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, X, Plus, RefreshCw, Eye, EyeOff, BookOpen, Filter as FilterIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import ReactMarkdown from "react-markdown";

const MODELS = [
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (recomendado)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (mais barato)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (mais preciso)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5 (premium)" },
];

function MarkdownEditor({ value, onChange, rows = 18 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(!preview)}>
          {preview ? <><EyeOff className="h-3 w-3 mr-1" /> Editar</> : <><Eye className="h-3 w-3 mr-1" /> Pré-visualizar</>}
        </Button>
      </div>
      {preview ? (
        <div className="prose prose-sm max-w-none border rounded-md p-4 bg-muted/30 min-h-[200px]">
          <ReactMarkdown>{value || "_(vazio)_"}</ReactMarkdown>
        </div>
      ) : (
        <Textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      )}
    </div>
  );
}

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
  const [patternInput, setPatternInput] = useState("");
  const [backfillDays, setBackfillDays] = useState(30);

  useEffect(() => { if (data && !form) setForm(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ai_model: form.ai_model,
        profanity_keywords: form.profanity_keywords,
        competitor_keywords: form.competitor_keywords,
        playbook_items: form.playbook_items,
        playbook_markdown: form.playbook_markdown,
        scoring_rubric: form.scoring_rubric,
        tone_categories: form.tone_categories,
        churn_signal_types: form.churn_signal_types,
        system_message_patterns: form.system_message_patterns,
        attention_threshold: form.attention_threshold,
        critical_threshold: form.critical_threshold,
        custom_instructions: form.custom_instructions,
        sampling_enabled: form.sampling_enabled,
        sampling_percent_per_seller: form.sampling_percent_per_seller,
        sampling_new_seller_days: form.sampling_new_seller_days,
        sampling_new_seller_percent: form.sampling_new_seller_percent,
        must_audit_lost: form.must_audit_lost,
        must_audit_critical: form.must_audit_critical,
        must_audit_sla_breach: form.must_audit_sla_breach,
        sla_breach_seconds: form.sla_breach_seconds,
        product_knowledge_base: form.product_knowledge_base,
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
    onSuccess: (d: any) => toast.success(`Backfill iniciado: ${d?.total || 0} conversas na fila.`),
    onError: (e: any) => toast.error("Erro no backfill: " + e.message),
  });

  if (isLoading || !form) {
    return <Layout><div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div></Layout>;
  }

  const addToList = (field: string, value: string, setter: (v: string) => void, lower = true) => {
    const v = lower ? value.trim().toLowerCase() : value.trim();
    if (!v) return;
    setForm({ ...form, [field]: Array.from(new Set([...(form[field] || []), v])) });
    setter("");
  };
  const removeFromList = (field: string, v: string) => {
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

  const updateCategoryList = (field: "tone_categories" | "churn_signal_types", idx: number, key: string, value: any) => {
    const items = [...(form[field] || [])];
    items[idx] = { ...items[idx], [key]: value };
    setForm({ ...form, [field]: items });
  };
  const addCategory = (field: "tone_categories" | "churn_signal_types") => {
    setForm({ ...form, [field]: [...(form[field] || []), { key: "novo", label: "Novo" }] });
  };
  const removeCategory = (field: "tone_categories" | "churn_signal_types", idx: number) => {
    setForm({ ...form, [field]: (form[field] || []).filter((_: any, i: number) => i !== idx) });
  };

  return (
    <Layout>
      <div className="space-y-6 p-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2"><Link to="/atendimentos/auditoria"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link></Button>
            <h1 className="text-2xl font-heading font-bold">Configurações de Auditoria</h1>
            <p className="text-sm text-muted-foreground">Ajuste rubrica, playbook, palavras-chave e filtros usados pela IA.</p>
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>

        <Tabs defaultValue="geral">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="rubrica">Rubrica de Análise</TabsTrigger>
            <TabsTrigger value="playbook">Playbook</TabsTrigger>
            <TabsTrigger value="filtros">Filtros & Palavras-chave</TabsTrigger>
            <TabsTrigger value="amostragem"><FilterIcon className="h-3 w-3 mr-1" />Amostragem</TabsTrigger>
            <TabsTrigger value="knowledge"><BookOpen className="h-3 w-3 mr-1" />Knowledge Base</TabsTrigger>
            <TabsTrigger value="backfill">Backfill</TabsTrigger>
          </TabsList>

          {/* GERAL */}
          <TabsContent value="geral" className="space-y-4 mt-4">
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
                <p className="text-xs text-muted-foreground col-span-2">Use <code>{"{{attention_threshold}}"}</code> e <code>{"{{critical_threshold}}"}</code> dentro da rubrica para referenciar estes valores.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Instruções customizadas (opcional)</CardTitle></CardHeader>
              <CardContent>
                <Textarea rows={4} placeholder="Ex: 'Considere mais grave qualquer menção a juros abusivos...'" value={form.custom_instructions || ""} onChange={(e) => setForm({ ...form, custom_instructions: e.target.value })} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* RUBRICA */}
          <TabsContent value="rubrica" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rubrica de scoring e severity</CardTitle>
                <p className="text-xs text-muted-foreground">Markdown enviado para a IA explicando como calcular cada nota e classificar a severidade. É o cérebro da análise — edite com cuidado.</p>
              </CardHeader>
              <CardContent>
                <MarkdownEditor value={form.scoring_rubric || ""} onChange={(v) => setForm({ ...form, scoring_rubric: v })} rows={20} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Categorias de tom de voz</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => addCategory("tone_categories")}><Plus className="h-3 w-3 mr-1" /> Categoria</Button>
                </div>
                <p className="text-xs text-muted-foreground">A IA usará exatamente estas chaves nas <code>tone_flags</code>.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {(form.tone_categories || []).map((c: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                    <Input value={c.key} onChange={(e) => updateCategoryList("tone_categories", idx, "key", e.target.value)} placeholder="chave" />
                    <Input value={c.label} onChange={(e) => updateCategoryList("tone_categories", idx, "label", e.target.value)} placeholder="descrição" />
                    <Button size="icon" variant="ghost" onClick={() => removeCategory("tone_categories", idx)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Tipos de sinal de churn</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => addCategory("churn_signal_types")}><Plus className="h-3 w-3 mr-1" /> Tipo</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(form.churn_signal_types || []).map((c: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                    <Input value={c.key} onChange={(e) => updateCategoryList("churn_signal_types", idx, "key", e.target.value)} placeholder="chave" />
                    <Input value={c.label} onChange={(e) => updateCategoryList("churn_signal_types", idx, "label", e.target.value)} placeholder="descrição" />
                    <Button size="icon" variant="ghost" onClick={() => removeCategory("churn_signal_types", idx)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PLAYBOOK */}
          <TabsContent value="playbook" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Playbook (markdown)</CardTitle>
                <p className="text-xs text-muted-foreground">Documento completo enviado como contexto à IA. Use para descrever processos, expectativas e exemplos.</p>
              </CardHeader>
              <CardContent>
                <MarkdownEditor value={form.playbook_markdown || ""} onChange={(v) => setForm({ ...form, playbook_markdown: v })} rows={22} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Itens do checklist</CardTitle>
                  <Button size="sm" variant="outline" onClick={addPlaybook}><Plus className="h-3 w-3 mr-1" /> Item</Button>
                </div>
                <p className="text-xs text-muted-foreground">Itens objetivos que a IA marcará como cumpridos ou não em cada conversa.</p>
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
          </TabsContent>

          {/* FILTROS */}
          <TabsContent value="filtros" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Padrões de mensagens a ignorar</CardTitle>
                <p className="text-xs text-muted-foreground">Expressões regulares (regex). Mensagens cujo conteúdo casar com qualquer padrão serão removidas da transcrição antes da análise. Útil para descartar avisos de sistema do Chatwoot ("Conversa marcada como resolvida por X", "Envio via app", etc.).</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Ex: ^Conversa foi marcada como" value={patternInput} onChange={(e) => setPatternInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList("system_message_patterns", patternInput, setPatternInput, false))} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => addToList("system_message_patterns", patternInput, setPatternInput, false)}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(form.system_message_patterns || []).map((p: string) => (
                    <Badge key={p} variant="outline" className="gap-1 font-mono text-xs">
                      {p}
                      <button onClick={() => removeFromList("system_message_patterns", p)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
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
          </TabsContent>

          {/* AMOSTRAGEM */}
          <TabsContent value="amostragem" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Amostragem estratificada</CardTitle>
                <p className="text-xs text-muted-foreground">Em vez de auditar 100% das conversas, defina uma amostra representativa por vendedor — combinada com regras "must audit" para casos críticos. Ideal para volumes acima de 500 conversas/semana.</p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Amostragem habilitada</Label>
                    <p className="text-xs text-muted-foreground">Quando desligado, audita todas as conversas do período.</p>
                  </div>
                  <Switch checked={!!form.sampling_enabled} onCheckedChange={(v) => setForm({ ...form, sampling_enabled: v })} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs"><Label>% aleatório por vendedor</Label><span className="font-mono">{form.sampling_percent_per_seller}%</span></div>
                  <Slider value={[Number(form.sampling_percent_per_seller) || 0]} max={100} step={5} onValueChange={([v]) => setForm({ ...form, sampling_percent_per_seller: v })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Vendedor novo: até quantos dias</Label>
                    <Input type="number" value={form.sampling_new_seller_days} onChange={(e) => setForm({ ...form, sampling_new_seller_days: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>% para vendedor novo</Label>
                    <Input type="number" value={form.sampling_new_seller_percent} onChange={(e) => setForm({ ...form, sampling_new_seller_percent: Number(e.target.value) })} />
                  </div>
                  <p className="text-xs text-muted-foreground col-span-2">Vendedores recém-contratados recebem amostragem maior para acelerar coaching.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Regras de auditoria obrigatória ("must audit")</CardTitle>
                <p className="text-xs text-muted-foreground">Conversas que se enquadram nestas regras serão auditadas SEMPRE, mesmo fora da amostra.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between"><Label>Sempre auditar conversas marcadas como crítica em análise prévia</Label><Switch checked={!!form.must_audit_critical} onCheckedChange={(v) => setForm({ ...form, must_audit_critical: v })} /></div>
                <div className="flex items-center justify-between"><Label>Sempre auditar oportunidades perdidas vinculadas</Label><Switch checked={!!form.must_audit_lost} onCheckedChange={(v) => setForm({ ...form, must_audit_lost: v })} /></div>
                <div className="flex items-center justify-between"><Label>Sempre auditar conversas com SLA estourado</Label><Switch checked={!!form.must_audit_sla_breach} onCheckedChange={(v) => setForm({ ...form, must_audit_sla_breach: v })} /></div>
                <div>
                  <Label>SLA em segundos (TM1R máximo aceitável)</Label>
                  <Input type="number" value={form.sla_breach_seconds} onChange={(e) => setForm({ ...form, sla_breach_seconds: Number(e.target.value) })} className="w-40" />
                  <p className="text-xs text-muted-foreground mt-1">Padrão: 1800s (30 min). Conversas com primeira resposta acima disso entram na fila.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* KNOWLEDGE BASE */}
          <TabsContent value="knowledge" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Base de conhecimento do produto</CardTitle>
                <p className="text-xs text-muted-foreground">Informações factuais sobre seu produto que a IA usará como referência ao avaliar precisão técnica do atendimento. Inclua taxas, prazos, condições, políticas, limites — tudo que o vendedor não pode errar ou prometer indevidamente.</p>
              </CardHeader>
              <CardContent>
                <MarkdownEditor value={form.product_knowledge_base || ""} onChange={(v) => setForm({ ...form, product_knowledge_base: v })} rows={24} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* BACKFILL */}
          <TabsContent value="backfill" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Backfill manual</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Roda a auditoria retroativa nos últimos N dias. Útil após editar a rubrica ou playbook para reanalisar conversas.</p>
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
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
