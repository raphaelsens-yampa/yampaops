import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Download, Upload, Loader2 } from "lucide-react";
import { usePricingVersions, useVersionEditor } from "@/hooks/usePricing";
import { PricingOverview } from "@/components/pricing/PricingOverview";
import { CostListEditor } from "@/components/pricing/CostListEditor";
import { CapacityEditor } from "@/components/pricing/CapacityEditor";
import { MarkupEditor } from "@/components/pricing/MarkupEditor";
import { InputsEditor } from "@/components/pricing/InputsEditor";
import { ServicesEditor } from "@/components/pricing/ServicesEditor";
import { VersionsManager } from "@/components/pricing/VersionsManager";
import { CapacityScenarios } from "@/components/pricing/CapacityScenarios";
import { ProposalsManager } from "@/components/pricing/ProposalsManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { AccessDenied } from "@/components/AccessDenied";

export default function PricingPage() {
  const { role, canView, canEdit } = useAuth();
  const qc = useQueryClient();
  const { data: versions = [], isLoading } = usePricingVersions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const isAdmin = role === "admin";
  const canEditPricing = isAdmin || canEdit("pricing");
  const canViewPricing = isAdmin || canView("pricing");

  // Auto-select active version on load
  useEffect(() => {
    if (!selectedId && versions.length > 0) {
      const active = versions.find((v) => v.is_active) ?? versions[0];
      setSelectedId(active.id);
    }
  }, [versions, selectedId]);

  const selected = useMemo(() => versions.find((v) => v.id === selectedId) ?? null, [versions, selectedId]);
  const editor = useVersionEditor(selected);

  if (!canViewPricing) return <Layout><AccessDenied /></Layout>;

  const exportXlsx = async () => {
    if (!selected) return;
    const { data, error } = await supabase.functions.invoke("pricing-export-xlsx", { body: { version_id: selected.id } });
    if (error) { toast({ title: "Erro export", description: error.message, variant: "destructive" }); return; }
    const blob = new Blob(
      [Uint8Array.from(atob((data as any).xlsx_base64), (c) => c.charCodeAt(0))],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `precificacao-${selected.name.replace(/\s+/g,"_")}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const importXlsx = async (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = (reader.result as string).split(",")[1];
      const { error } = await supabase.functions.invoke("pricing-import-xlsx", {
        body: { xlsx_base64: b64, filename: file.name },
      });
      setImporting(false);
      if (error) { toast({ title: "Erro import", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Versão importada", description: "Disponível como rascunho." });
      qc.invalidateQueries({ queryKey: ["pricing-versions"] });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-heading font-bold">Precificação Serviços</h1>
            <p className="text-muted-foreground">
              Motor completo de custo, markup, ficha técnica e geração de proposta comercial.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedId ?? ""} onValueChange={setSelectedId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder={isLoading ? "Carregando…" : "Selecione uma versão"} />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} {v.is_active && "· ativa"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEditPricing && (
              <>
                <label>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && importXlsx(e.target.files[0])}
                  />
                  <Button asChild variant="outline" disabled={importing}>
                    <span>{importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Importar XLSX</span>
                  </Button>
                </label>
                <Button variant="outline" onClick={exportXlsx} disabled={!selected}>
                  <Download className="h-4 w-4 mr-1" /> Exportar
                </Button>
                <Button onClick={editor.save} disabled={!editor.dirty || editor.saving}>
                  {editor.saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Salvar {editor.dirty && <Badge variant="secondary" className="ml-2">não salvo</Badge>}
                </Button>
              </>
            )}
          </div>
        </div>

        {selected ? (
          <Tabs defaultValue={canEditPricing ? "overview" : "proposals"}>
            <TabsList className="flex-wrap h-auto">
              {canEditPricing && <TabsTrigger value="overview">Visão Geral</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="fixed">Custos Fixos</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="labor">Mão de Obra</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="capacity">Capacidade</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="markup">Markup</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="inputs">Insumos & Subprodutos</TabsTrigger>}
              {canEditPricing && <TabsTrigger value="services">Serviços</TabsTrigger>}
              <TabsTrigger value="proposals">Propostas</TabsTrigger>
              <TabsTrigger value="versions">Versões</TabsTrigger>
            </TabsList>

            {canEditPricing && (
              <>
                <TabsContent value="overview" className="mt-4"><PricingOverview snap={editor.snap} update={editor.update} /></TabsContent>
                <TabsContent value="fixed" className="mt-4">
                  <CostListEditor title="Custos Fixos Mensais" field="fixed_costs" snap={editor.snap} update={editor.update} />
                </TabsContent>
                <TabsContent value="labor" className="mt-4">
                  <CostListEditor title="Mão de Obra Direta" field="labor_costs" snap={editor.snap} update={editor.update} />
                </TabsContent>
                <TabsContent value="capacity" className="mt-4">
                  <CapacityEditor snap={editor.snap} update={editor.update} />
                </TabsContent>
                <TabsContent value="markup" className="mt-4">
                  <MarkupEditor snap={editor.snap} update={editor.update} />
                </TabsContent>
                <TabsContent value="inputs" className="mt-4">
                  <InputsEditor snap={editor.snap} update={editor.update} />
                </TabsContent>
                <TabsContent value="services" className="mt-4">
                  <ServicesEditor snap={editor.snap} update={editor.update} />
                </TabsContent>
              </>
            )}
            <TabsContent value="proposals" className="mt-4">
              <ProposalsManager version={selected} />
            </TabsContent>
            <TabsContent value="versions" className="mt-4">
              <VersionsManager selectedId={selectedId} onSelect={setSelectedId} />
            </TabsContent>
          </Tabs>
        ) : (
          !isLoading && <p className="text-muted-foreground">Nenhuma versão encontrada.</p>
        )}
      </div>
    </Layout>
  );
}
