import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, Search, X, Upload, Plus, Trash2, GripVertical, Image as ImageIcon, Save, Layers, History, GitBranch, Check } from 'lucide-react';
import { PrecificacaoHook, getEffectivePrice } from '@/hooks/usePrecificacao';
import { PropostaForm } from '@/types/precificacao';
import { usePrecificacaoProposals, SavedProposal } from '@/hooks/usePrecificacaoProposals';
import SavedProposalsList from './SavedProposalsList';
import { useProposalTemplates, ProposalTemplate } from '@/hooks/useProposalTemplates';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge as UiBadge } from '@/components/ui/badge';

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const today = new Date().toLocaleDateString('pt-BR');

const PAYMENT_OPTIONS = [
  'Cartão de crédito (12x)',
  'Boleto mensal',
  'Pix mensal',
  'À vista',
];

interface CustomBlock {
  id: string;
  title: string;
  content: string;
}

const DEFAULT_BLOCKS: CustomBlock[] = [
  {
    id: 'sobre',
    title: 'Sobre o Yampa',
    content:
      'Somos uma empresa focada em simplificar o financeiro do seu negócio. Nosso propósito é construir um futuro de finanças simples e empresas fortes e acreditamos que através de tecnologia, processos e acompanhamento sua empresa pode ser tornar altamente lucrativa!',
  },
  {
    id: 'condicoes',
    title: 'Condições Gerais',
    content:
      '• Início dos trabalhos em até 5 dias úteis após aprovação.\n• Reajuste anual pelo IPCA.\n• Cancelamento mediante aviso prévio de 30 dias.',
  },
];

const LOGO_KEY = 'yampa_proposta_logo';
const BLOCKS_KEY = 'yampa_proposta_blocks';

export default function PropostaTab({ products, priceOverrides }: PrecificacaoHook) {
  const [form, setForm] = useState<PropostaForm>({
    clientName: '', clientCompany: '', date: today, validity: 15,
    consultant: '', discount: 0, payment: PAYMENT_OPTIONS[0], notes: '',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [logo, setLogo] = useState<string | null>(() => {
    try { return localStorage.getItem(LOGO_KEY); } catch { return null; }
  });
  const [blocks, setBlocks] = useState<CustomBlock[]>(() => {
    try {
      const saved = localStorage.getItem(BLOCKS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_BLOCKS;
    } catch { return DEFAULT_BLOCKS; }
  });
  const [parent, setParent] = useState<SavedProposal | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const proposalsHook = usePrecificacaoProposals();
  const templatesHook = useProposalTemplates();
  const [activeTemplate, setActiveTemplate] = useState<ProposalTemplate | null>(null);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [saveAsNew, setSaveAsNew] = useState(true);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingTpl, setDeletingTpl] = useState<ProposalTemplate | null>(null);

  useEffect(() => {
    try {
      if (logo) localStorage.setItem(LOGO_KEY, logo);
      else localStorage.removeItem(LOGO_KEY);
    } catch {}
  }, [logo]);

  useEffect(() => {
    try { localStorage.setItem(BLOCKS_KEY, JSON.stringify(blocks)); } catch {}
  }, [blocks]);

  const setField = <K extends keyof PropostaForm>(k: K, v: PropostaForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const toggleProduct = (nome: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(nome) ? next.delete(nome) : next.add(nome);
      return next;
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo deve ter menos de 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addBlock = () => {
    setBlocks((prev) => [...prev, { id: String(Date.now()), title: 'Novo bloco', content: '' }]);
  };
  const updateBlock = (id: string, patch: Partial<CustomBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  const selectedItems = products.filter((p) => selected.has(p.nome));

  const totalAnual = selectedItems.reduce((s, p) => {
    return s + getEffectivePrice(p, priceOverrides).preco_total;
  }, 0);
  const discountAmt = totalAnual * (form.discount / 100);
  const finalTotal = totalAnual - discountAmt;
  const avgMonths = selectedItems.length > 0
    ? selectedItems.reduce((s, p) => s + p.meses, 0) / selectedItems.length : 12;
  const monthlyEst = finalTotal / avgMonths;

  const propId = String(Date.now()).slice(-6);

  const handlePrint = () => window.print();

  const handleSave = async () => {
    if (!form.clientName.trim()) {
      alert('Informe o nome do cliente antes de salvar.');
      return;
    }
    if (selectedItems.length === 0) {
      alert('Selecione ao menos um serviço.');
      return;
    }
    const items = selectedItems.map((p) => {
      const eff = getEffectivePrice(p, priceOverrides);
      return {
        nome: p.nome, meses: p.meses, linha: p.linha,
        preco_mensal: eff.preco_mensal, preco_total: eff.preco_total,
      };
    });
    await proposalsHook.save({
      parent_id: parent?.id ?? null,
      version: parent ? parent.version + 1 : 1,
      proposal_number: propId,
      client_name: form.clientName,
      client_company: form.clientCompany || null,
      consultant: form.consultant || null,
      proposal_date: form.date,
      validity: form.validity,
      discount_pct: form.discount,
      payment: form.payment,
      notes: form.notes || null,
      custom_blocks: blocks,
      items,
      total_annual: finalTotal,
      total_monthly: monthlyEst,
    });
    setParent(null);
  };

  const loadAsNewVersion = (p: SavedProposal) => {
    setParent(p);
    setForm({
      clientName: p.client_name,
      clientCompany: p.client_company ?? '',
      date: today,
      validity: p.validity,
      consultant: p.consultant ?? '',
      discount: Number(p.discount_pct) || 0,
      payment: p.payment ?? PAYMENT_OPTIONS[0],
      notes: p.notes ?? '',
    });
    setBlocks(p.custom_blocks ?? []);
    setSelected(new Set(p.items.map((i) => i.nome)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredProducts = products.filter((p) =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
      {/* Form column */}
      <div className="space-y-4 no-print">
        {/* Branding / Logo + Templates */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Identidade Visual</CardTitle>
              <div className="flex items-center gap-1.5">
                {activeTemplate && (
                  <UiBadge variant="outline" className="text-[10px]">
                    {activeTemplate.name} · v{activeTemplate.version}
                  </UiBadge>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setHistoryOpen(true)}>
                  <History className="h-3.5 w-3.5 mr-1" /> Histórico
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template picker */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Template</Label>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={activeTemplate?.id ?? ''}
                  onValueChange={(id) => {
                    const t = templatesHook.templates.find((x) => x.id === id);
                    if (!t) return;
                    setActiveTemplate(t);
                    setLogo(t.logo ?? null);
                    setBlocks(t.custom_blocks ?? []);
                  }}
                >
                  <SelectTrigger className="h-9 flex-1 min-w-[200px]">
                    <SelectValue placeholder={templatesHook.loading ? 'Carregando...' : 'Selecionar template salvo'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templatesHook.templates.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-gray-400">Nenhum template salvo</div>
                    ) : (
                      templatesHook.templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} · v{t.version}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSaveAsNew(true);
                    setTplName('');
                    setTplDesc('');
                    setSaveTplOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo template
                </Button>
                {activeTemplate && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSaveAsNew(false);
                      setTplName(activeTemplate.name);
                      setTplDesc(activeTemplate.description ?? '');
                      setSaveTplOpen(true);
                    }}
                  >
                    <GitBranch className="h-3.5 w-3.5 mr-1.5" /> Salvar nova versão
                  </Button>
                )}
                {activeTemplate && (
                  <Button size="sm" variant="ghost" onClick={() => setActiveTemplate(null)}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Desvincular
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-gray-500">
                Templates reúnem logo + blocos customizáveis. Edite e salve uma nova versão para manter o histórico.
              </p>
            </div>

            {/* Logo */}
            <div className="flex items-center gap-4 pt-2 border-t">
              <div className="w-24 h-24 rounded-md border border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden flex-shrink-0">
                {logo ? (
                  <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-gray-300" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-xs text-gray-500">Faça upload da logo que aparecerá no topo da proposta (PNG ou JPG, até 2MB).</p>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {logo ? 'Trocar logo' : 'Carregar logo'}
                  </Button>
                  {logo && (
                    <Button size="sm" variant="ghost" onClick={() => setLogo(null)}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client info */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Dados do Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Responsável</Label>
                <Input placeholder="João Silva" value={form.clientName} onChange={(e) => setField('clientName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Input placeholder="Restaurante Bella Vista" value={form.clientCompany} onChange={(e) => setField('clientCompany', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Data</Label>
                <Input value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Validade (dias)</Label>
                <Input type="number" value={form.validity} onChange={(e) => setField('validity', parseInt(e.target.value) || 15)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Consultor</Label>
                <Input placeholder="Seu nome" value={form.consultant} onChange={(e) => setField('consultant', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product picker */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Selecionar Serviços</CardTitle>
              {selected.size > 0 && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Buscar serviço..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {filteredProducts.map((p) => {
                const eff = getEffectivePrice(p, priceOverrides);
                const isSelected = selected.has(p.nome);
                return (
                  <div
                    key={p.nome}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    onClick={() => toggleProduct(p.nome)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {isSelected && <svg viewBox="0 0 10 10" className="w-2.5 h-2.5"><polyline points="1.5,5 4,7.5 8.5,2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{p.nome}</p>
                        <p className="text-xs text-gray-400">{p.meses}x · {p.linha}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-blue-700 ml-2 flex-shrink-0">{fmtBRL(eff.preco_mensal)}/mês</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Discount & notes */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Desconto e Observações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Desconto (%)</Label>
                <Input type="number" min={0} max={100} value={form.discount} onChange={(e) => setField('discount', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Forma de Pagamento</Label>
                <Select value={form.payment} onValueChange={(v) => setField('payment', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea
                placeholder="Ex: Inclui onboarding gratuito nos primeiros 30 dias..."
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Custom blocks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Blocos Customizáveis</CardTitle>
              <Button size="sm" variant="outline" onClick={addBlock}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar bloco
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {blocks.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum bloco. Clique em "Adicionar bloco" para criar.</p>
            )}
            {blocks.map((b, idx) => (
              <div key={b.id} className="border rounded-md p-3 space-y-2 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => moveBlock(b.id, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-xs">▲</button>
                    <button onClick={() => moveBlock(b.id, 1)} disabled={idx === blocks.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 leading-none text-xs">▼</button>
                  </div>
                  <Input
                    value={b.title}
                    onChange={(e) => updateBlock(b.id, { title: e.target.value })}
                    placeholder="Título do bloco"
                    className="h-8 text-sm font-medium"
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeBlock(b.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={b.content}
                  onChange={(e) => updateBlock(b.id, { content: e.target.value })}
                  placeholder="Conteúdo do bloco (suporta quebras de linha)"
                  className="min-h-[70px] text-sm"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {parent && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-center justify-between">
            <span>Criando <strong>nova versão</strong> da proposta de {parent.client_name} (v{parent.version} → v{parent.version + 1})</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setParent(null)}>Cancelar</Button>
          </div>
        )}

        <div className="flex justify-end gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setParent(null); setSelected(new Set()); setForm((f) => ({ ...f, clientName: '', clientCompany: '', discount: 0, notes: '' })); }}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Limpar
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Imprimir / PDF
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
            <Save className="h-3.5 w-3.5 mr-1.5" /> {parent ? 'Salvar Nova Versão' : 'Salvar Proposta'}
          </Button>
        </div>
      </div>



      {/* Preview column */}
      <div>
        <Card className="sticky top-6">
          <CardHeader className="pb-2 no-print">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview da Proposta</p>
          </CardHeader>
          <div ref={printRef} id="proposta-print" className="text-sm">
            {!form.clientName && !form.clientCompany && selected.size === 0 ? (
              <div className="text-center py-10 text-gray-400 px-6">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p className="text-xs">Preencha os dados para visualizar a proposta</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex justify-between items-start pb-4 border-b-2 border-gray-800 gap-4">
                  <div className="min-w-0">
                    {logo ? (
                      <img src={logo} alt="Logo" className="max-h-14 max-w-[180px] object-contain" />
                    ) : (
                      <>
                        <div className="text-2xl font-extrabold text-gray-900 tracking-tight">yampa<span className="text-blue-600">.</span></div>
                        <p className="text-xs text-gray-500 mt-0.5">Consultoria Financeira</p>
                      </>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500 space-y-0.5 flex-shrink-0">
                    <div className="font-bold text-gray-800 uppercase tracking-wide text-xs">Proposta Comercial</div>
                    <div>Data: {form.date}</div>
                    {form.consultant && <div>Consultor: {form.consultant}</div>}
                    <div className="text-gray-400">N° {propId}</div>
                  </div>
                </div>

                {/* Client */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Para</p>
                  <p className="font-bold text-base">{form.clientName || '—'}</p>
                  {form.clientCompany && <p className="text-xs text-gray-500">{form.clientCompany}</p>}
                </div>

                {/* Validity */}
                {form.validity > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
                    ⏱ Proposta válida por <strong>{form.validity} dias</strong> a partir da data de emissão.
                  </div>
                )}

                {/* Items */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Serviços</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left p-2 font-semibold text-gray-500">Serviço</th>
                        <th className="text-center p-2 font-semibold text-gray-500">Período</th>
                        <th className="text-right p-2 font-semibold text-gray-500">Mensal</th>
                        <th className="text-right p-2 font-semibold text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-4 text-gray-400">Selecione serviços ao lado</td></tr>
                      ) : (
                        <>
                          {selectedItems.map((p) => {
                            const eff = getEffectivePrice(p, priceOverrides);
                            return (
                              <tr key={p.nome} className="border-t">
                                <td className="p-2 font-medium leading-snug">{p.nome}</td>
                                <td className="p-2 text-center text-gray-500">{p.meses}x</td>
                                <td className="p-2 text-right text-gray-600">{fmtBRL(eff.preco_mensal)}</td>
                                <td className="p-2 text-right font-bold">{fmtBRL(eff.preco_total)}</td>
                              </tr>
                            );
                          })}
                          {form.discount > 0 && (
                            <tr className="border-t text-green-700">
                              <td colSpan={3} className="p-2 text-right font-semibold">Desconto ({form.discount}%)</td>
                              <td className="p-2 text-right font-bold">- {fmtBRL(discountAmt)}</td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total */}
                <div className="bg-gray-900 text-white rounded-lg p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider">Investimento Total</p>
                    <p className="text-xs text-gray-400 mt-0.5">{form.payment}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold">{fmtBRL(finalTotal)}</p>
                    <p className="text-xs text-gray-400">≈ {fmtBRL(monthlyEst)}/mês</p>
                  </div>
                </div>

                {/* Notes */}
                {form.notes && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Observações</p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap">{form.notes}</p>
                  </div>
                )}

                {/* Custom blocks */}
                {blocks.filter((b) => b.title.trim() || b.content.trim()).map((b) => (
                  <div key={b.id}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{b.title}</p>
                    <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{b.content}</p>
                  </div>
                ))}

                {/* Footer */}
                <div className="pt-3 border-t flex justify-between text-xs text-gray-400">
                  <span>Yampa · Ecossistema de Inteligência Financeira</span>
                  <span>raphael@yampa.com.br</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #proposta-print, #proposta-print * { visibility: visible; }
          #proposta-print { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>

    <SavedProposalsList
      proposals={proposalsHook.proposals}
      loading={proposalsHook.loading}
      onNewVersion={loadAsNewVersion}
      onDelete={proposalsHook.remove}
    />

    <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{saveAsNew ? 'Novo template' : `Nova versão · ${activeTemplate?.name}`}</DialogTitle>
          <DialogDescription>
            {saveAsNew
              ? 'Salve a logo e os blocos atuais como um template reutilizável.'
              : `Salva como v${(activeTemplate?.version ?? 0) + 1}. A versão atual (v${activeTemplate?.version}) fica preservada no histórico.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do template</Label>
            <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Ex: Yampa Padrão" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} placeholder="O que mudou nesta versão..." className="min-h-[70px]" />
          </div>
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Inclui: logo {logo ? '✓' : '—'} · {blocks.length} bloco{blocks.length !== 1 ? 's' : ''} customizável{blocks.length !== 1 ? 'is' : ''}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaveTplOpen(false)}>Cancelar</Button>
          <Button
            onClick={async () => {
              if (!tplName.trim()) { alert('Informe um nome'); return; }
              const created = await templatesHook.create(
                { name: tplName.trim(), description: tplDesc.trim() || null, logo, custom_blocks: blocks },
                saveAsNew ? null : activeTemplate,
              );
              if (created) {
                setActiveTemplate(created);
                setSaveTplOpen(false);
              }
            }}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Templates</DialogTitle>
          <DialogDescription>
            Aplique uma versão para carregar logo e blocos. Edite e salve uma nova versão para preservar o histórico.
          </DialogDescription>
        </DialogHeader>
        {templatesHook.loading ? (
          <p className="text-xs text-gray-400 text-center py-6">Carregando...</p>
        ) : templatesHook.templates.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Nenhum template salvo ainda.</p>
        ) : (
          <div className="space-y-2">
            {templatesHook.templates.map((t) => {
              const isActive = activeTemplate?.id === t.id;
              return (
                <div key={t.id} className={`border rounded-md p-3 flex items-start gap-3 ${isActive ? 'border-blue-400 bg-blue-50/40' : ''}`}>
                  <div className="w-12 h-12 rounded border bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    {t.logo ? <img src={t.logo} alt="" className="w-full h-full object-contain" /> : <ImageIcon className="h-5 w-5 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{t.name}</span>
                      <UiBadge variant="outline" className="text-[10px]">v{t.version}</UiBadge>
                      {isActive && <UiBadge className="text-[10px] bg-blue-600">Em uso</UiBadge>}
                    </div>
                    {t.description && <p className="text-xs text-gray-600 mt-0.5">{t.description}</p>}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {new Date(t.created_at).toLocaleString('pt-BR')} · {t.author_name ?? '—'} · {(t.custom_blocks ?? []).length} bloco{(t.custom_blocks ?? []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant={isActive ? 'secondary' : 'default'}
                      className="h-7 text-xs"
                      onClick={() => {
                        setActiveTemplate(t);
                        setLogo(t.logo ?? null);
                        setBlocks(t.custom_blocks ?? []);
                        setHistoryOpen(false);
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" /> Aplicar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeletingTpl(t)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setHistoryOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deletingTpl} onOpenChange={(o) => !o && setDeletingTpl(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir template?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove <strong>{deletingTpl?.name} (v{deletingTpl?.version})</strong>. Outras versões não são afetadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (deletingTpl) {
                await templatesHook.remove(deletingTpl.id);
                if (activeTemplate?.id === deletingTpl.id) setActiveTemplate(null);
              }
              setDeletingTpl(null);
            }}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>
  );
}
