import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ORIGIN_LABELS, STAGE_LABELS } from "@/lib/constants";
import { Upload, Download, FileUp, Plus, Pencil, Trash2, Search, Contact } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  segment: string | null;
  icp_level: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  opportunity_count?: number;
};

const emptyContact = { name: "", email: "", phone: "", company: "", segment: "", icp_level: 3 };

export default function ContactsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Listing state
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [icpFilter, setIcpFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRow | null>(null);
  const [form, setForm] = useState(emptyContact);

  // Import contacts state
  const contactFileRef = useRef<HTMLInputElement>(null);
  const [contactCsvData, setContactCsvData] = useState<Record<string, string>[]>([]);
  const [contactHeaders, setContactHeaders] = useState<string[]>([]);
  const [contactMapping, setContactMapping] = useState<Record<string, string>>({});
  const [importingContacts, setImportingContacts] = useState(false);

  // Import opportunities state
  const oppFileRef = useRef<HTMLInputElement>(null);
  const [oppCsvData, setOppCsvData] = useState<Record<string, string>[]>([]);
  const [oppHeaders, setOppHeaders] = useState<string[]>([]);
  const [oppMapping, setOppMapping] = useState<Record<string, string>>({});
  const [importingOpps, setImportingOpps] = useState(false);

  const contactTargetFields = ["name", "email", "phone", "company", "segment", "icp_level"];
  const oppTargetFields = ["name", "company", "origin", "estimated_mrr", "estimated_tpv", "take_rate", "notes", "stage", "title", "sub_origin", "probability"];

  useEffect(() => { fetchContacts(); }, []);

  async function fetchContacts() {
    setLoading(true);
    const { data: contactsData } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
    if (!contactsData) { setLoading(false); return; }

    // Count opportunities per contact
    const { data: opps } = await supabase.from("opportunities").select("contact_id");
    const countMap: Record<string, number> = {};
    opps?.forEach(o => { if (o.contact_id) countMap[o.contact_id] = (countMap[o.contact_id] || 0) + 1; });

    setContacts(contactsData.map(c => ({ ...c, opportunity_count: countMap[c.id] || 0 })));
    setLoading(false);
  }

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !search || [c.name, c.email, c.company].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const matchesSegment = segmentFilter === "all" || c.segment === segmentFilter;
    const matchesIcp = icpFilter === "all" || c.icp_level === Number(icpFilter);
    return matchesSearch && matchesSegment && matchesIcp;
  });

  const segments = [...new Set(contacts.map(c => c.segment).filter(Boolean))] as string[];

  function openCreate() {
    setEditingContact(null);
    setForm(emptyContact);
    setDialogOpen(true);
  }

  function openEdit(c: ContactRow) {
    setEditingContact(c);
    setForm({ name: c.name, email: c.email || "", phone: c.phone || "", company: c.company || "", segment: c.segment || "", icp_level: c.icp_level || 3 });
    setDialogOpen(true);
  }

  async function saveContact() {
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (editingContact) {
      const { error } = await supabase.from("contacts").update({ name: form.name, email: form.email || null, phone: form.phone || null, company: form.company || null, segment: form.segment || null, icp_level: form.icp_level }).eq("id", editingContact.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Contato atualizado!" });
    } else {
      const { error } = await supabase.from("contacts").insert({ name: form.name, email: form.email || null, phone: form.phone || null, company: form.company || null, segment: form.segment || null, icp_level: form.icp_level, created_by: user?.id });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Contato criado!" });
    }
    setDialogOpen(false);
    fetchContacts();
  }

  async function deleteContact(id: string) {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Contato excluído!" });
    fetchContacts();
  }

  async function exportContacts() {
    const { data } = await supabase.from("contacts").select("*");
    if (!data?.length) { toast({ title: "Sem dados" }); return; }
    const hdrs = ["name", "email", "phone", "company", "segment", "icp_level"];
    const csv = [hdrs.join(","), ...data.map(r => hdrs.map(h => `"${(r as any)[h] ?? ""}"`).join(","))].join("\n");
    downloadCsv(csv, "contacts_export.csv");
  }

  async function exportOpportunities() {
    const { data } = await supabase.from("opportunities").select("*");
    if (!data?.length) { toast({ title: "Sem dados" }); return; }
    const hdrs = Object.keys(data[0]);
    const csv = [hdrs.join(","), ...data.map(r => hdrs.map(h => `"${(r as any)[h] ?? ""}"`).join(","))].join("\n");
    downloadCsv(csv, "opportunities_export.csv");
  }

  function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text: string) {
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    const hdrs = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
      const row: Record<string, string> = {};
      hdrs.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    });
    return { headers: hdrs, rows };
  }

  function autoMap(headers: string[], targetFields: string[]) {
    const map: Record<string, string> = {};
    headers.forEach(h => {
      const lower = h.toLowerCase();
      if ((lower.includes("nome") || lower === "name") && targetFields.includes("name")) map[h] = "name";
      else if ((lower.includes("email") || lower === "email") && targetFields.includes("email")) map[h] = "email";
      else if ((lower.includes("telefone") || lower === "phone") && targetFields.includes("phone")) map[h] = "phone";
      else if ((lower.includes("empresa") || lower === "company") && targetFields.includes("company")) map[h] = "company";
      else if ((lower.includes("segmento") || lower === "segment") && targetFields.includes("segment")) map[h] = "segment";
      else if ((lower.includes("icp") || lower === "icp_level") && targetFields.includes("icp_level")) map[h] = "icp_level";
      else if ((lower.includes("origem") || lower === "origin") && targetFields.includes("origin")) map[h] = "origin";
      else if (lower.includes("mrr") && targetFields.includes("estimated_mrr")) map[h] = "estimated_mrr";
      else if ((lower.includes("tpv") || lower.includes("arpa")) && targetFields.includes("estimated_tpv")) map[h] = "estimated_tpv";
      else if (lower.includes("take") && targetFields.includes("take_rate")) map[h] = "take_rate";
      else if ((lower.includes("nota") || lower === "notes") && targetFields.includes("notes")) map[h] = "notes";
      else if ((lower.includes("stage") || lower.includes("etapa")) && targetFields.includes("stage")) map[h] = "stage";
      else if ((lower.includes("titulo") || lower === "title") && targetFields.includes("title")) map[h] = "title";
      else if (lower.includes("probabili") && targetFields.includes("probability")) map[h] = "probability";
    });
    return map;
  }

  function handleContactFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCsv(ev.target?.result as string);
      setContactHeaders(headers);
      setContactCsvData(rows);
      setContactMapping(autoMap(headers, contactTargetFields));
    };
    reader.readAsText(file);
  }

  function handleOppFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCsv(ev.target?.result as string);
      setOppHeaders(headers);
      setOppCsvData(rows);
      setOppMapping(autoMap(headers, oppTargetFields));
    };
    reader.readAsText(file);
  }

  async function doImportContacts() {
    if (!user) return;
    setImportingContacts(true);
    const nameCol = Object.entries(contactMapping).find(([_, v]) => v === "name")?.[0];
    if (!nameCol) { toast({ title: "Erro", description: "Mapeie pelo menos o campo Nome", variant: "destructive" }); setImportingContacts(false); return; }

    const rows = contactCsvData.map(row => {
      const contact: any = { created_by: user.id };
      Object.entries(contactMapping).forEach(([csvCol, field]) => {
        if (field === "skip") return;
        if (field === "icp_level") contact[field] = parseInt(row[csvCol]) || null;
        else contact[field] = row[csvCol] || null;
      });
      return contact;
    }).filter(r => r.name);

    const { error } = await supabase.from("contacts").insert(rows);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Importado!", description: `${rows.length} contatos importados.` }); setContactCsvData([]); setContactHeaders([]); fetchContacts(); }
    setImportingContacts(false);
  }

  async function doImportOpps() {
    if (!user) return;
    setImportingOpps(true);
    const nameCol = Object.entries(oppMapping).find(([_, v]) => v === "name")?.[0];
    if (!nameCol) { toast({ title: "Erro", description: "Mapeie pelo menos o campo Nome", variant: "destructive" }); setImportingOpps(false); return; }

    const rows = oppCsvData.map(row => {
      const opp: any = { consultant_id: user.id };
      Object.entries(oppMapping).forEach(([csvCol, field]) => {
        if (field === "skip") return;
        if (["estimated_mrr", "estimated_tpv", "take_rate", "probability"].includes(field)) {
          opp[field] = parseFloat(row[csvCol]) || 0;
        } else {
          opp[field] = row[csvCol] || null;
        }
      });
      return opp;
    }).filter(r => r.name);

    const { error } = await supabase.from("opportunities").insert(rows);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Importado!", description: `${rows.length} oportunidades importadas.` }); setOppCsvData([]); setOppHeaders([]); }
    setImportingOpps(false);
  }

  function renderCsvMapping(headers: string[], mapping: Record<string, string>, setMapping: (fn: (m: Record<string, string>) => Record<string, string>) => void, targetFields: string[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {headers.map(h => (
          <div key={h} className="flex items-center gap-2">
            <span className="text-sm w-32 truncate">{h}</span>
            <Select value={mapping[h] || "skip"} onValueChange={v => setMapping(m => ({ ...m, [h]: v }))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Pular</SelectItem>
                {targetFields.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    );
  }

  function renderPreviewTable(headers: string[], data: Record<string, string>[]) {
    if (!data.length) return null;
    return (
      <div className="overflow-x-auto max-h-48">
        <Table>
          <TableHeader>
            <TableRow>{headers.slice(0, 5).map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(0, 5).map((row, i) => (
              <TableRow key={i}>{headers.slice(0, 5).map(h => <TableCell key={h}>{row[h]}</TableCell>)}</TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-heading font-bold">Contatos</h1>
        </div>

        <Tabs defaultValue="listing" className="space-y-4">
          <TabsList>
            <TabsTrigger value="listing">Listagem</TabsTrigger>
            <TabsTrigger value="import-contacts">Importar Contatos</TabsTrigger>
            <TabsTrigger value="import-opps">Importar Oportunidades</TabsTrigger>
          </TabsList>

          {/* TAB: Listagem */}
          <TabsContent value="listing" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex gap-2 items-center flex-1 w-full sm:w-auto">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar nome, email, empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Segmento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={icpFilter} onValueChange={setIcpFilter}>
                  <SelectTrigger className="w-28"><SelectValue placeholder="ICP" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>ICP {n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportContacts}><Download className="h-4 w-4 mr-1" />Exportar</Button>
                <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Novo Contato</Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Segmento</TableHead>
                      <TableHead>ICP</TableHead>
                      <TableHead>Oportunidades</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                    ) : filteredContacts.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum contato encontrado</TableCell></TableRow>
                    ) : (
                      filteredContacts.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{c.email || "—"}</TableCell>
                          <TableCell>{c.phone || "—"}</TableCell>
                          <TableCell>{c.company || "—"}</TableCell>
                          <TableCell>{c.segment || "—"}</TableCell>
                          <TableCell>{c.icp_level ? <Badge variant="outline">{c.icp_level}</Badge> : "—"}</TableCell>
                          <TableCell><Badge variant="secondary">{c.opportunity_count || 0}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteContact(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Importar Contatos */}
          <TabsContent value="import-contacts">
            <Card>
              <CardHeader><CardTitle className="text-lg">Importar Contatos via CSV</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors" onClick={() => contactFileRef.current?.click()}>
                  <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo CSV de contatos</p>
                  <input ref={contactFileRef} type="file" accept=".csv" className="hidden" onChange={handleContactFile} />
                </div>

                {contactHeaders.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Mapeamento de colunas:</p>
                      {renderCsvMapping(contactHeaders, contactMapping, setContactMapping, contactTargetFields)}
                    </div>
                    <p className="text-sm text-muted-foreground">Preview: {contactCsvData.length} registros</p>
                    {renderPreviewTable(contactHeaders, contactCsvData)}
                    <Button onClick={doImportContacts} disabled={importingContacts} className="w-full">
                      <Upload className="h-4 w-4 mr-1" /> {importingContacts ? "Importando..." : `Importar ${contactCsvData.length} contatos`}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Importar Oportunidades */}
          <TabsContent value="import-opps">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Importar Oportunidades via CSV</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportOpportunities}><Download className="h-4 w-4 mr-1" />Exportar Oportunidades</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors" onClick={() => oppFileRef.current?.click()}>
                  <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo CSV de oportunidades</p>
                  <input ref={oppFileRef} type="file" accept=".csv" className="hidden" onChange={handleOppFile} />
                </div>

                {oppHeaders.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Mapeamento de colunas:</p>
                      {renderCsvMapping(oppHeaders, oppMapping, setOppMapping, oppTargetFields)}
                    </div>
                    <p className="text-sm text-muted-foreground">Preview: {oppCsvData.length} registros</p>
                    {renderPreviewTable(oppHeaders, oppCsvData)}
                    <Button onClick={doImportOpps} disabled={importingOpps} className="w-full">
                      <Upload className="h-4 w-4 mr-1" /> {importingOpps ? "Importando..." : `Importar ${oppCsvData.length} oportunidades`}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog Criar/Editar Contato */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingContact ? "Editar Contato" : "Novo Contato"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Empresa</Label>
                  <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Segmento</Label>
                  <Input value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Nível ICP (1-5)</Label>
                <Select value={String(form.icp_level)} onValueChange={v => setForm(f => ({ ...f, icp_level: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n} — {["Muito baixo","Baixo","Médio","Alto","Muito alto"][n-1]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={saveContact}>{editingContact ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
