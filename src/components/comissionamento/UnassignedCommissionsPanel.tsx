import { useMemo, useState } from "react";
import { CheckSquare, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { ConversionRow, ProfileLite } from "@/pages/Comissionamento";

interface Props { conversions: ConversionRow[]; profiles: ProfileLite[]; onChanged: () => void; }

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

export function UnassignedCommissionsPanel({ conversions, profiles, onChanged }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [sellerId, setSellerId] = useState("none");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => conversions.filter((row) => !row.resolved_seller_user_id && !row.resolved_seller_label), [conversions]);
  const selectedRows = rows.filter((row) => selected.includes(row.id));

  const toggleAll = (checked: boolean) => setSelected(checked ? rows.map((row) => row.id) : []);
  const toggleRow = (id: string, checked: boolean) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));

  const assign = async () => {
    if (sellerId === "none" || selectedRows.length === 0 || !session?.user?.id) return;
    setSaving(true);
    const profile = profiles.find((item) => item.user_id === sellerId);
    const label = profile?.full_name || profile?.email || null;
    const results = await Promise.all(selectedRows.map((row) => supabase.from("commission_conversions").update({
      resolved_seller_user_id: sellerId,
      resolved_seller_label: label,
      seller_source: "manual",
      manually_reviewed: true,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
      override_fields: Array.from(new Set([...(row.override_fields || []), "resolved_seller_user_id", "resolved_seller_label"])),
    }).eq("id", row.id)));
    setSaving(false);
    const error = results.find((result) => result.error)?.error;
    if (error) {
      toast({ title: "Erro ao atribuir vendedor", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Vendedor atribuído", description: `${selectedRows.length} conversões foram marcadas para revisão manual.` });
    setSelected([]);
    setSellerId("none");
    onChanged();
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium"><UserRound className="h-4 w-4" /> Conversões sem vendedor <Badge variant={rows.length ? "destructive" : "secondary"}>{rows.length}</Badge></CardTitle>
          <CardDescription className="mt-1 text-xs">Atribuição manual auditável. A origem será registrada como “manual” e o recálculo automático ficará travado nessas linhas.</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Escolha o vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Escolha o vendedor</SelectItem>
              {profiles.slice().sort((a, b) => (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "")).map((profile) => <SelectItem key={profile.user_id} value={profile.user_id}>{profile.full_name || profile.email || profile.user_id}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={assign} disabled={saving || sellerId === "none" || selectedRows.length === 0}><CheckSquare className="mr-2 h-4 w-4" /> Atribuir {selectedRows.length || "selecionadas"}</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={(value) => toggleAll(value === true)} aria-label="Selecionar todas" /></TableHead><TableHead>Cliente</TableHead><TableHead>Mês da venda</TableHead><TableHead>Plano</TableHead><TableHead className="text-right">MRR</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Todas as conversões têm vendedor atribuído.</TableCell></TableRow>}
            {rows.slice(0, 1000).map((row) => <TableRow key={row.id} data-state={selected.includes(row.id) ? "selected" : undefined}>
              <TableCell><Checkbox checked={selected.includes(row.id)} onCheckedChange={(value) => toggleRow(row.id, value === true)} aria-label={`Selecionar ${row.customer_name || row.customer_email || "conversão"}`} /></TableCell>
              <TableCell><div className="font-medium">{row.customer_name || "—"}</div><div className="text-xs text-muted-foreground">{row.customer_email || ""}</div></TableCell>
              <TableCell>{dateBR(row.sale_month)}</TableCell>
              <TableCell>{row.resolved_plan || row.offer_name || row.price_id || "Não mapeado"}</TableCell>
              <TableCell className="text-right tabular-nums">{brl(Number(row.mrr || 0))}</TableCell>
              <TableCell><Badge variant="destructive">Sem vendedor</Badge></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        {rows.length > 1000 && <p className="pt-3 text-center text-xs text-muted-foreground">Mostrando 1.000 de {rows.length} linhas. Use a aba Conversões para refinar o período.</p>}
      </CardContent>
    </Card>
  );
}
