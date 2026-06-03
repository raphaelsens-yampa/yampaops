import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Plus, CheckCircle2, Archive } from "lucide-react";
import { usePricingVersions } from "@/hooks/usePricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { emptySnapshot } from "@/lib/pricing/engine";
import type { PricingVersionRow } from "@/lib/pricing/types";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VersionsManager({ selectedId, onSelect }: Props) {
  const { data: versions = [] } = usePricingVersions();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [duplicateFrom, setDuplicateFrom] = useState<PricingVersionRow | null>(null);

  const createVersion = async () => {
    if (!name.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    const snap = duplicateFrom?.snapshot ?? emptySnapshot();
    const { data, error } = await supabase
      .from("pricing_versions")
      .insert({
        name: name.trim(),
        description: desc.trim() || null,
        status: "draft",
        source: duplicateFrom ? "duplicate" : "manual",
        snapshot: snap as any,
      })
      .select("id")
      .single();
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Versão criada" });
    setOpen(false);
    setName(""); setDesc(""); setDuplicateFrom(null);
    qc.invalidateQueries({ queryKey: ["pricing-versions"] });
    if (data?.id) onSelect(data.id);
  };

  const activate = async (v: PricingVersionRow) => {
    await supabase.from("pricing_versions").update({ is_active: false }).eq("is_active", true);
    const { error } = await supabase
      .from("pricing_versions")
      .update({ is_active: true, status: "active" })
      .eq("id", v.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Versão ativada" });
    qc.invalidateQueries({ queryKey: ["pricing-versions"] });
  };

  const archive = async (v: PricingVersionRow) => {
    const { error } = await supabase
      .from("pricing_versions")
      .update({ status: "archived", is_active: false })
      .eq("id", v.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Versão arquivada" });
    qc.invalidateQueries({ queryKey: ["pricing-versions"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Versões de Precificação</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Apenas uma versão pode estar ativa por vez. Propostas ficam carimbadas com a versão usada.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setDuplicateFrom(null); setName(""); setDesc(""); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova versão
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{duplicateFrom ? `Duplicar "${duplicateFrom.name}"` : "Nova versão"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: v2 - Reajuste 2026" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createVersion}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Atualizada</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => (
              <TableRow
                key={v.id}
                className={selectedId === v.id ? "bg-accent" : "cursor-pointer"}
                onClick={() => onSelect(v.id)}
              >
                <TableCell>
                  <div className="font-medium">{v.name}</div>
                  {v.description && <div className="text-xs text-muted-foreground">{v.description}</div>}
                </TableCell>
                <TableCell>
                  {v.is_active ? (
                    <Badge className="bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Ativa</Badge>
                  ) : v.status === "archived" ? (
                    <Badge variant="outline">Arquivada</Badge>
                  ) : (
                    <Badge variant="secondary">Rascunho</Badge>
                  )}
                </TableCell>
                <TableCell><Badge variant="outline">{v.source}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(v.updated_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setDuplicateFrom(v); setName(`${v.name} (cópia)`); setDesc(v.description ?? ""); setOpen(true); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {!v.is_active && v.status !== "archived" && (
                      <Button variant="ghost" size="sm" onClick={() => activate(v)}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!v.is_active && v.status !== "archived" && (
                      <Button variant="ghost" size="sm" onClick={() => archive(v)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
