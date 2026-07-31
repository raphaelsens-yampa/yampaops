import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, Upload } from "lucide-react";
import { Profile, toBRDateKey } from "./types";

interface Props {
  profiles: Profile[];
  memberIds: string[];
  today: Date;
  onSaved?: () => void;
}

type NewRow = {
  customer_name: string;
  customer_email: string;
  plan_name: string;
  seller_id: string;
  recovered_at: string;
  price: string;
  mrr: string;
  note: string;
  entry_kind: "recovered" | "retained";
};

const emptyRow = (today: Date): NewRow => ({
  customer_name: "",
  customer_email: "",
  plan_name: "",
  seller_id: "",
  recovered_at: toBRDateKey(today),
  price: "",
  mrr: "",
  note: "",
  entry_kind: "recovered",
});

function parseKind(v: unknown): "recovered" | "retained" {
  const s = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return s.includes("retid") || s.includes("retain") || s.includes("retencao") ? "retained" : "recovered";
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toDateKey(v: unknown, fallback: string): string {
  if (v instanceof Date) return toBRDateKey(v);
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d+$/.test(s)) {
    const serial = Number(s);
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + serial);
    return d.toISOString().slice(0, 10);
  }
  return fallback;
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  for (const key of keys) {
    const target = norm(key);
    const found = Object.keys(row).find((k) => norm(k) === target);
    if (found !== undefined && row[found] !== undefined && row[found] !== "") return row[found];
  }
  return undefined;
}

export function RecoveryEntryDialog({ profiles, memberIds, today, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<NewRow>(emptyRow(today));
  const [preview, setPreview] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const teamProfiles = profiles.filter((p) => !memberIds.length || memberIds.includes(p.user_id));

  async function saveManual() {
    if (!row.customer_name && !row.customer_email) {
      toast({ title: "Informe o cliente", description: "Preencha o nome ou o e-mail.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("tactical_recoveries").insert({
      customer_name: row.customer_name || null,
      customer_email: row.customer_email ? row.customer_email.toLowerCase().trim() : null,
      plan_name: row.plan_name || null,
      seller_id: row.seller_id || auth.user?.id || null,
      recovered_at: row.recovered_at,
      price: toNumber(row.price),
      mrr: toNumber(row.mrr),
      note: row.note || null,
      entry_kind: row.entry_kind,
      source: "manual",
      created_by: auth.user?.id as string,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: row.entry_kind === "retained" ? "Retenção registrada" : "Recuperação registrada" });
    setRow(emptyRow(today));
    setOpen(false);
    onSaved?.();
  }

  async function handleFile(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const fallback = toBRDateKey(today);
    const byName = new Map(profiles.map((p) => [(p.full_name || "").toLowerCase().trim(), p.user_id]));
    const parsed = json
      .map((r) => {
        const sellerName = String(pick(r, ["responsavel", "vendedor", "seller", "owner"]) ?? "").toLowerCase().trim();
        return {
          customer_name: String(pick(r, ["cliente", "nome", "customer", "customer_name"]) ?? "") || null,
          customer_email: String(pick(r, ["email", "e-mail", "customer_email"]) ?? "").toLowerCase().trim() || null,
          plan_name: String(pick(r, ["plano", "plan", "produto", "plan_name"]) ?? "") || null,
          seller_id: byName.get(sellerName) ?? null,
          recovered_at: toDateKey(pick(r, ["data", "data recuperacao", "recovered_at", "date"]), fallback),
          price: toNumber(pick(r, ["preco", "preço", "price", "valor"])),
          mrr: toNumber(pick(r, ["mrr", "mrr recuperado", "mrr_net"])),
          note: String(pick(r, ["observacao", "obs", "note"]) ?? "") || null,
          entry_kind: parseKind(pick(r, ["tipo", "entry_kind", "kind", "classificacao"])),
          source: "import",
        };
      })
      .filter((r) => r.customer_name || r.customer_email);
    if (!parsed.length) {
      toast({
        title: "Nenhuma linha válida",
        description: "Use colunas: Cliente, E-mail, Plano, Responsável, Tipo, Data, Preço, MRR.",
        variant: "destructive",
      });
      return;
    }
    setPreview(parsed);
  }

  async function confirmImport() {
    if (!preview?.length) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id as string;
    const payload = preview.map((r) => ({ ...r, seller_id: r.seller_id ?? uid, created_by: uid }));
    const { error } = await supabase.from("tactical_recoveries").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${payload.length} registros importados` });
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    setOpen(false);
    onSaved?.();
  }

  function downloadTemplate() {
    const ws = XLSX.utils.json_to_sheet([
      { Cliente: "Empresa Exemplo", "E-mail": "cliente@exemplo.com", Plano: "Plano Pro", Responsável: teamProfiles[0]?.full_name ?? "", Tipo: "Recuperado", Data: toBRDateKey(today), Preço: 199.9, MRR: 199.9, Observação: "" },
      { Cliente: "Outra Empresa", "E-mail": "outro@exemplo.com", Plano: "Plano Pro", Responsável: teamProfiles[0]?.full_name ?? "", Tipo: "Retido", Data: toBRDateKey(today), Preço: 199.9, MRR: 199.9, Observação: "" },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recuperados");
    XLSX.writeFile(wb, "modelo-clientes-recuperados.xlsx");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <Plus className="h-4 w-4 mr-1" /> Adicionar recuperados/retidos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clientes recuperados e retidos</DialogTitle>
          <DialogDescription>Registre manualmente ou importe uma planilha (xlsx/csv).</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">Adição manual</TabsTrigger>
            <TabsTrigger value="import" className="flex-1">Importar planilha</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Input value={row.customer_name} onChange={(e) => setRow({ ...row, customer_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={row.customer_email} onChange={(e) => setRow({ ...row, customer_email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Plano</Label>
                <Input value={row.plan_name} onChange={(e) => setRow({ ...row, plan_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Select value={row.seller_id} onValueChange={(v) => setRow({ ...row, seller_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {teamProfiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || "—"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={row.entry_kind}
                  onValueChange={(v) => setRow({ ...row, entry_kind: v as "recovered" | "retained" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recovered">Cliente recuperado</SelectItem>
                    <SelectItem value="retained">Cliente retido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={row.recovered_at} onChange={(e) => setRow({ ...row, recovered_at: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Preço (R$)</Label>
                <Input inputMode="decimal" value={row.price} onChange={(e) => setRow({ ...row, price: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{row.entry_kind === "retained" ? "MRR retido (R$)" : "MRR recuperado (R$)"}</Label>
                <Input inputMode="decimal" value={row.mrr} onChange={(e) => setRow({ ...row, mrr: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Textarea rows={2} value={row.note} onChange={(e) => setRow({ ...row, note: e.target.value })} />
            </div>
            <DialogFooter>
              <Button onClick={saveManual} disabled={saving}>Salvar</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="import" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Colunas aceitas: Cliente, E-mail, Plano, Responsável, Data, Preço, MRR, Observação.
            </p>
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button variant="outline" size="sm" onClick={downloadTemplate}>Modelo</Button>
            </div>
            {preview && (
              <div className="border rounded-md max-h-64 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Cliente</th>
                      <th className="text-left p-2">E-mail</th>
                      <th className="text-left p-2">Plano</th>
                      <th className="text-left p-2">Data</th>
                      <th className="text-right p-2">Preço</th>
                      <th className="text-right p-2">MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.customer_name || "—"}</td>
                        <td className="p-2">{r.customer_email || "—"}</td>
                        <td className="p-2">{r.plan_name || "—"}</td>
                        <td className="p-2">{r.recovered_at}</td>
                        <td className="p-2 text-right">{r.price}</td>
                        <td className="p-2 text-right">{r.mrr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <DialogFooter>
              <Button onClick={confirmImport} disabled={saving || !preview?.length}>
                <Upload className="h-4 w-4 mr-1" />
                Importar {preview?.length ? `${preview.length} linhas` : ""}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
