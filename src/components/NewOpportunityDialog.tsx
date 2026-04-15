import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Plus, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NewOpportunityDialogProps {
  profiles: any[];
  stageOrder: string[];
  stageLabels: Record<string, string>;
  onCreated: () => void;
}

export function NewOpportunityDialog({ profiles, stageOrder, stageLabels, onCreated }: NewOpportunityDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Contact selection
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);

  // New contact form
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCompany, setNewContactCompany] = useState("");

  // Opportunity form
  const [oppTitle, setOppTitle] = useState("");
  const [oppOrigin, setOppOrigin] = useState("freetrial");
  const [oppSubOrigin, setOppSubOrigin] = useState("");
  const [oppMrr, setOppMrr] = useState("");
  const [oppTpv, setOppTpv] = useState("");
  const [oppProbability, setOppProbability] = useState("");
  const [oppCloseDate, setOppCloseDate] = useState("");
  const [oppConsultant, setOppConsultant] = useState("");
  const [oppStage, setOppStage] = useState("");

  useEffect(() => {
    if (open) {
      supabase.from("contacts").select("*").order("name").then(({ data }) => setContacts(data || []));
    }
  }, [open]);

  const filteredContacts = contacts.filter(c =>
    !contactSearch || c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.company?.toLowerCase().includes(contactSearch.toLowerCase())
  );

  const selectedContact = contacts.find(c => c.id === selectedContactId);

  function resetForm() {
    setSelectedContactId(null);
    setContactSearch("");
    setShowNewContact(false);
    setNewContactName(""); setNewContactEmail(""); setNewContactPhone(""); setNewContactCompany("");
    setOppTitle(""); setOppOrigin("freetrial"); setOppSubOrigin("");
    setOppMrr(""); setOppTpv(""); setOppProbability(""); setOppCloseDate("");
    setOppConsultant(""); setOppStage("");
  }

  async function handleCreate() {
    let contactId = selectedContactId;

    // If creating a new contact
    if (showNewContact) {
      if (!newContactName.trim()) {
        toast({ title: "Erro", description: "Nome do contato é obrigatório", variant: "destructive" });
        return;
      }
      const { data: newContact, error: contactError } = await supabase.from("contacts").insert({
        name: newContactName,
        email: newContactEmail || null,
        phone: newContactPhone || null,
        company: newContactCompany || null,
      }).select().single();

      if (contactError) {
        toast({ title: "Erro ao criar contato", description: contactError.message, variant: "destructive" });
        return;
      }
      contactId = newContact.id;
    }

    if (!contactId) {
      toast({ title: "Erro", description: "Selecione ou crie um contato", variant: "destructive" });
      return;
    }

    const contact = showNewContact
      ? { name: newContactName, company: newContactCompany }
      : selectedContact;

    const { error } = await supabase.from("opportunities").insert({
      name: contact?.name || "",
      company: contact?.company || null,
      contact_id: contactId,
      title: oppTitle || null,
      origin: oppOrigin as any,
      sub_origin: oppSubOrigin || null,
      estimated_mrr: parseFloat(oppMrr) || 0,
      estimated_tpv: parseFloat(oppTpv) || 0,
      probability: parseFloat(oppProbability) || 0,
      estimated_close_date: oppCloseDate || null,
      consultant_id: oppConsultant || null,
      stage: oppStage || stageOrder[0] || "novo_lead",
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Oportunidade criada" });
    setOpen(false);
    resetForm();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Oportunidade</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Oportunidade</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Contact Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Contato *</Label>

            {!selectedContactId && !showNewContact && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Buscar contato por nome, email ou empresa..."
                    className="pl-9"
                  />
                </div>
                <div className="max-h-32 overflow-y-auto border rounded-md">
                  {filteredContacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">Nenhum contato encontrado</p>
                  ) : (
                    filteredContacts.slice(0, 20).map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedContactId(c.id)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b last:border-b-0 transition-colors"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.company && <span className="text-muted-foreground ml-2">· {c.company}</span>}
                        {c.email && <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>}
                      </button>
                    ))
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowNewContact(true)} className="w-full">
                  <UserPlus className="h-4 w-4 mr-1" /> Criar novo contato
                </Button>
              </div>
            )}

            {selectedContactId && selectedContact && (
              <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                <div>
                  <span className="font-medium text-sm">{selectedContact.name}</span>
                  {selectedContact.company && <span className="text-muted-foreground text-sm ml-2">· {selectedContact.company}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedContactId(null)}>Trocar</Button>
              </div>
            )}

            {showNewContact && (
              <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Novo Contato</span>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewContact(false)}>Cancelar</Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Nome *</Label><Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Nome" /></div>
                  <div><Label className="text-xs">Empresa</Label><Input value={newContactCompany} onChange={e => setNewContactCompany(e.target.value)} /></div>
                  <div><Label className="text-xs">Email</Label><Input value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} type="email" /></div>
                  <div><Label className="text-xs">Telefone</Label><Input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>

          {/* Opportunity fields */}
          <div><Label>Título da Oportunidade</Label><Input value={oppTitle} onChange={e => setOppTitle(e.target.value)} placeholder="Ex: Upsell Premium" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Canal</Label>
              <Select value={oppOrigin} onValueChange={setOppOrigin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIGIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Sub-origem</Label><Input value={oppSubOrigin} onChange={e => setOppSubOrigin(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>MRR Estimado</Label><Input type="number" value={oppMrr} onChange={e => setOppMrr(e.target.value)} /></div>
            <div><Label>TPV Estimado</Label><Input type="number" value={oppTpv} onChange={e => setOppTpv(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Probabilidade (%)</Label><Input type="number" value={oppProbability} onChange={e => setOppProbability(e.target.value)} /></div>
            <div><Label>Data Fechamento Est.</Label><Input type="date" value={oppCloseDate} onChange={e => setOppCloseDate(e.target.value)} /></div>
          </div>
          <div>
            <Label>Vendedor Responsável</Label>
            <Select value={oppConsultant} onValueChange={setOppConsultant}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etapa Inicial</Label>
            <Select value={oppStage || stageOrder[0]} onValueChange={setOppStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stageOrder.map(s => <SelectItem key={s} value={s}>{stageLabels[s] || s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} className="w-full" disabled={!selectedContactId && !showNewContact}>
            Criar Oportunidade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
