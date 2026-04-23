import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORIGIN_LABELS } from "@/lib/constants";
import { Plus, Search, UserPlus, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AREA_LABELS, type GoalCategory } from "@/lib/goalCategories";

interface NewOpportunityDialogProps {
  profiles: any[];
  stageOrder: string[];
  stageLabels: Record<string, string>;
  onCreated: () => void;
  pipelineId?: string;
}

export function NewOpportunityDialog({ profiles, stageOrder, stageLabels, onCreated, pipelineId }: NewOpportunityDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Contact search (server-side)
  const [contactSearch, setContactSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const [oppCategory, setOppCategory] = useState("");
  const [categories, setCategories] = useState<GoalCategory[]>([]);

  useEffect(() => {
    supabase.from("goal_categories").select("*").eq("is_active", true).order("area").order("name")
      .then(({ data }) => setCategories((data as GoalCategory[]) || []));
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    const term = `%${query}%`;
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, phone, company")
      .or(`name.ilike.${term},email.ilike.${term},company.ilike.${term}`)
      .order("name")
      .limit(15);
    setSearchResults(data || []);
    setShowResults(true);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (contactSearch.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(() => searchContacts(contactSearch), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [contactSearch, searchContacts]);

  function resetForm() {
    setSelectedContact(null);
    setContactSearch("");
    setSearchResults([]);
    setShowResults(false);
    setShowNewContact(false);
    setNewContactName(""); setNewContactEmail(""); setNewContactPhone(""); setNewContactCompany("");
    setOppTitle(""); setOppOrigin("freetrial"); setOppSubOrigin("");
    setOppMrr(""); setOppTpv(""); setOppProbability(""); setOppCloseDate("");
    setOppConsultant(""); setOppStage("");
  }

  function selectContact(contact: any) {
    setSelectedContact(contact);
    setContactSearch("");
    setShowResults(false);
  }

  function clearContact() {
    setSelectedContact(null);
    setContactSearch("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  async function handleCreate() {
    let contactId = selectedContact?.id || null;

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

    const contactName = showNewContact ? newContactName : selectedContact?.name || "";
    const contactCompany = showNewContact ? newContactCompany : selectedContact?.company || null;

    const { error } = await supabase.from("opportunities").insert({
      name: contactName,
      company: contactCompany,
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
      ...(pipelineId ? { pipeline_id: pipelineId } : {}),
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
          {/* Contact Selection — server-side search */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Contato *</Label>

            {!selectedContact && !showNewContact && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  {searching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground animate-spin" />}
                  <Input
                    ref={searchInputRef}
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Buscar contato por nome, email ou empresa..."
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {showResults && (
                  <div className="max-h-48 overflow-y-auto border rounded-lg shadow-sm bg-background">
                    {searchResults.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Nenhum contato encontrado para "{contactSearch}"</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1"
                          onClick={() => {
                            setShowNewContact(true);
                            setNewContactName(contactSearch);
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1" /> Criar "{contactSearch}" como novo contato
                        </Button>
                      </div>
                    ) : (
                      searchResults.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectContact(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-accent/50 border-b last:border-b-0 transition-colors flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {c.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{c.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[c.company, c.email].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {contactSearch.length < 2 && !showResults && (
                  <p className="text-xs text-muted-foreground">Digite pelo menos 2 caracteres para buscar</p>
                )}

                <Button variant="outline" size="sm" onClick={() => setShowNewContact(true)} className="w-full">
                  <UserPlus className="h-4 w-4 mr-1" /> Criar novo contato
                </Button>
              </div>
            )}

            {selectedContact && (
              <div className="flex items-center gap-3 bg-accent/30 rounded-lg px-3 py-2.5 border">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {selectedContact.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{selectedContact.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[selectedContact.company, selectedContact.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={clearContact}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {showNewContact && (
              <div className="space-y-2 border rounded-lg p-3 bg-accent/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Novo Contato</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setShowNewContact(false); setNewContactName(""); }}>
                    Cancelar
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Nome *</Label><Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Nome" autoFocus /></div>
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
          <Button onClick={handleCreate} className="w-full" disabled={!selectedContact && !showNewContact}>
            Criar Oportunidade
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
