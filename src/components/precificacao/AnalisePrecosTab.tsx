import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RotateCcw, Save, Search, TrendingUp, AlertTriangle, Package, Pencil, Plus, ChevronDown, ChevronRight, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Columns3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { matchesColumnFilter } from '@/lib/pricingColumnFilter';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import NewProductDialog from './NewProductDialog';
import { recordPricingVersion } from '@/lib/pricingVersions';
import { toast } from '@/hooks/use-toast';
import { Produto } from '@/types/precificacao';
import { PrecificacaoHook, calcMC, calcIdealMensal, calcMinMensal, getEffectivePrice, getLinhaKey, statusCheck, calcLucroProjetado } from '@/hooks/usePrecificacao';
import { FilterMode, LinhaMarkup } from '@/types/precificacao';

const HIDDEN_KEY = 'precificacao.servicos.hiddenCols';
const DEFAULT_HIDDEN = ['custo_mes', 'custo_total', 'min_mes', 'min_total'];
const TOGGLE_COLS: { key: string; label: string }[] = [
  { key: 'status', label: 'Status' },
  { key: 'nome', label: 'Produto' },
  { key: 'linha', label: 'Linha' },
  { key: 'meses', label: 'Contrato' },
  { key: 'custo_mes', label: 'Custo/mês' },
  { key: 'custo_total', label: 'Custo Total' },
  { key: 'ideal_mes', label: 'Ideal/mês' },
  { key: 'ideal_total', label: 'Ideal Total' },
  { key: 'min_mes', label: 'Mínimo/mês' },
  { key: 'min_total', label: 'Mínimo Total' },
  { key: 'preco_mes', label: 'Preço/mês' },
  { key: 'preco_total', label: 'Total' },
  { key: 'margem', label: 'Margem' },
  { key: 'lucro_proj', label: 'Lucro Projetado' },
  { key: 'acoes', label: 'Ações' },
];

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const FILTERS: { key: FilterMode; label: string }[] = [
  { key: 'todos',  label: 'Todos' },
  { key: 'bom',    label: '✓ Preço bom' },
  { key: 'abaixo', label: '⚠ Abaixo do ideal' },
  { key: 'bpo',    label: 'BPO' },
  { key: 'time',   label: 'Time Financeiro' },
  { key: 'setup',  label: 'Setup' },
];

export default function AnalisePrecosTab({
  products, config, priceOverrides, updatePrice, updateLinha, addProduct, updateProduct, removeProduct, saveChanges, resetChanges,
}: PrecificacaoHook) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('todos');
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Produto | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [hiddenCols, setHiddenCols] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '');
      return Array.isArray(stored) ? stored : DEFAULT_HIDDEN;
    } catch { return DEFAULT_HIDDEN; }
  });
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const setColFilter = (k: string, val: string) => setColFilters((prev) => ({ ...prev, [k]: val }));
  const activeColFilters = Object.values(colFilters).filter((x) => x.trim()).length;
  const v = (k: string) => !hiddenCols.includes(k);
  const toggleCol = (k: string) => {
    setHiddenCols((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k];
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  };
  const visibleColCount =
    TOGGLE_COLS.filter((c) => v(c.key)).length;

  const changedCount = Object.keys(priceOverrides).length;

  const colDisplay = (p: Produto, k: string): { text: string; num?: number } => {
    if (k === 'status') return { text: statusCheck(p, priceOverrides, config) === 'Preço bom' ? 'Bom' : 'Abaixo' };
    if (k === 'nome') return { text: p.nome };
    if (k === 'linha') return { text: p.linha };
    const num = getSortValue(p, k) as number;
    if (k === 'meses') return { text: `${p.meses}x`, num };
    if (k === 'margem' || k === 'lucro_proj') return { text: fmtPct(num), num: num * 100 };
    return { text: fmtBRL(num), num };
  };

  const filtered = products.filter((p) => {
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase());
    const nome = p.nome.toLowerCase();
    const matchFilter =
      filter === 'todos'  ? true :
      filter === 'bom'    ? statusCheck(p, priceOverrides, config) === 'Preço bom' :
      filter === 'abaixo' ? statusCheck(p, priceOverrides, config) === 'Abaixo do ideal' :
      filter === 'bpo'    ? nome.includes('bpo') :
      filter === 'time'   ? nome.includes('time financeiro') :
      filter === 'setup'  ? nome.includes('setup') : true;
    if (!matchSearch || !matchFilter) return false;
    return Object.entries(colFilters).every(([k, raw]) => {
      if (!raw.trim()) return true;
      if (k === 'status' || k === 'linha') return colDisplay(p, k).text === raw;
      const d = colDisplay(p, k);
      return matchesColumnFilter(raw, d.text, d.num);
    });
  });

  const sortHead = (k: string, label: string, className: string) => (
    <TableHead className={`${className} cursor-pointer select-none`} onClick={() => requestSort(k)}>
      <div className="flex items-center justify-center gap-1">
        {label}
        {sortConfig.key === k ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-gray-400" />}
      </div>
    </TableHead>
  );

  const filterCell = (k: string) => (
    <TableHead className="px-1 py-1">
      <Input
        value={colFilters[k] ?? ''}
        onChange={(e) => setColFilter(k, e.target.value)}
        placeholder="Filtrar"
        title={k === 'nome' ? 'Contém o texto' : 'Texto ou comparação: >500, <100, =3'}
        className="h-7 text-[11px] px-2 text-center"
      />
    </TableHead>
  );

  const requestSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  function getSortValue(p: Produto, key: string) {
    const eff = getEffectivePrice(p, priceOverrides);
    const linhaKey = getLinhaKey(p.linha);
    switch (key) {
      case 'nome': return p.nome.toLowerCase();
      case 'linha': return p.linha.toLowerCase();
      case 'status': return statusCheck(p, priceOverrides, config) === 'Preço bom' ? 0 : 1;
      case 'meses': return p.meses;
      case 'custo_mes': return p.custo / Math.max(p.meses, 1);
      case 'custo_total': return p.custo;
      case 'ideal_mes': return calcIdealMensal(p.custo, p.meses, linhaKey, config);
      case 'ideal_total': return calcIdealMensal(p.custo, p.meses, linhaKey, config) * p.meses;
      case 'min_mes': return calcMinMensal(p.custo, p.meses, config);
      case 'min_total': return calcMinMensal(p.custo, p.meses, config) * p.meses;
      case 'preco_mes': return eff.preco_mensal;
      case 'preco_total': return eff.preco_total;
      case 'margem': return calcMC(eff.preco_total, p.custo, config).pct;
      case 'lucro_proj': return calcLucroProjetado(eff.preco_total, p.custo, config);
      default: return 0;
    }
  };

  const sortedProducts = sortConfig.key
    ? [...filtered].sort((a, b) => {
        const aVal = getSortValue(a, sortConfig.key!);
        const bVal = getSortValue(b, sortConfig.key!);
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      })
    : filtered;

  // Stats
  const goodCount = products.filter((p) => statusCheck(p, priceOverrides, config) === 'Preço bom').length;
  const avgMC = products.reduce((sum, p) => {
    const eff = getEffectivePrice(p, priceOverrides);
    return sum + calcMC(eff.preco_total, p.custo, config).pct;
  }, 0) / (products.length || 1);

  const handleSave = async () => {
    const changedNames = Object.keys(priceOverrides);
    const updatedProducts = products.map((p) => {
      if (priceOverrides[p.nome] !== undefined) {
        const newMonthly = priceOverrides[p.nome];
        return { ...p, preco_mensal: newMonthly, preco_total: newMonthly * p.meses };
      }
      return p;
    });
    if (changedNames.length > 0) {
      const recorded = await recordPricingVersion({
        source: 'edit',
        change_type: 'price_update',
        name: `Atualização de preços (${changedNames.length} ${changedNames.length === 1 ? 'item' : 'itens'})`,
        description: changedNames.slice(0, 5).join(', ') + (changedNames.length > 5 ? '...' : ''),
        snapshot: { products: updatedProducts, config },
        setActive: true,
      });
      if (!recorded) { showSaveError(); return; }
      saveChanges();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      window.dispatchEvent(new Event('pricing-version-changed'));
    }
  };

  const showSaveError = () => toast({ title: 'Não foi possível salvar', description: 'A alteração não foi salva. Tente novamente.', variant: 'destructive' });

  const handleAddProduct = async (novo: Produto) => {
    const recorded = await recordPricingVersion({
      source: 'edit',
      change_type: 'new_service',
      name: `Novo serviço: ${novo.nome}`,
      description: `${novo.linha} · ${novo.meses}x · ${novo.preco_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`,
      snapshot: { products: [novo, ...products], config },
      setActive: true,
    });
    if (!recorded) { showSaveError(); return false; }
    addProduct(novo);
    window.dispatchEvent(new Event('pricing-version-changed'));
    return true;
  };

  const handleUpdateProduct = async (originalName: string, atualizado: Produto) => {
    const updated = products.map((p) => (p.nome === originalName ? atualizado : p));
    const recorded = await recordPricingVersion({
      source: 'edit',
      change_type: 'service_update',
      name: `Serviço editado: ${atualizado.nome}`,
      description: `${atualizado.linha} · ${atualizado.meses}x · ${atualizado.preco_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`,
      snapshot: { products: updated, config },
      setActive: true,
    });
    if (!recorded) { showSaveError(); return false; }
    updateProduct(originalName, atualizado);
    window.dispatchEvent(new Event('pricing-version-changed'));
    return true;
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const nome = deleteTarget.nome;
    const updated = products.filter((p) => p.nome !== nome);
    const recorded = await recordPricingVersion({
      source: 'edit',
      change_type: 'service_delete',
      name: `Serviço excluído: ${nome}`,
      description: `${deleteTarget.linha} · ${deleteTarget.meses}x`,
      snapshot: { products: updated, config },
      setActive: true,
    });
    if (!recorded) { showSaveError(); return; }
    removeProduct(nome);
    window.dispatchEvent(new Event('pricing-version-changed'));
    setDeleteTarget(null);
  };

  const handleLinhaChange = async (nome: string, novaLinha: LinhaMarkup) => {
    const updated = products.map((p) => p.nome === nome ? { ...p, linha: novaLinha } : p);
    const recorded = await recordPricingVersion({
      source: 'edit',
      change_type: 'line_update',
      name: `Linha alterada: ${nome}`,
      description: `Nova linha: ${novaLinha}`,
      snapshot: { products: updated, config },
      setActive: true,
    });
    if (!recorded) { showSaveError(); return; }
    updateLinha(nome, novaLinha);
    window.dispatchEvent(new Event('pricing-version-changed'));
  };

  const handlePriceChange = (nome: string, val: string) => {
    setEditingPrice((prev) => ({ ...prev, [nome]: val }));
  };

  const handlePriceBlur = (nome: string) => {
    const val = editingPrice[nome];
    if (val !== undefined) {
      const num = parseFloat(val.replace(',', '.'));
      if (!isNaN(num) && num >= 0) updatePrice(nome, num);
      setEditingPrice((prev) => {
        const next = { ...prev };
        delete next[nome];
        return next;
      });
    }
  };

  const getDisplayPrice = (nome: string, effectiveMonthly: number) => {
    return editingPrice[nome] !== undefined
      ? editingPrice[nome]
      : effectiveMonthly.toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Serviços</p>
            <p className="text-2xl font-bold mt-1">{products.length}</p>
            <p className="text-xs text-gray-500 mt-1">{goodCount} com preço adequado</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Abaixo do Ideal</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{products.length - goodCount}</p>
            <p className="text-xs text-gray-500 mt-1">{Math.round(((products.length - goodCount) / products.length) * 100)}% do portfólio</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">M.C. Média</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{fmtPct(avgMC)}</p>
            <p className="text-xs text-gray-500 mt-1">Após deduções variáveis</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alterações</p>
            <p className={`text-2xl font-bold mt-1 ${changedCount > 0 ? 'text-amber-600' : ''}`}>{changedCount}</p>
            <p className="text-xs text-gray-500 mt-1">{changedCount > 0 ? 'Pendentes de salvar' : 'Nenhuma alteração'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card className="text-center">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Tabela de Serviços</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo Serviço
              </Button>
              <Button variant="outline" size="sm" onClick={resetChanges} disabled={changedCount === 0}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reverter
              </Button>
              <Button size="sm" variant="outline" onClick={handleSave} disabled={changedCount === 0}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {saved ? 'Salvo ✓' : 'Salvar alterações'}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Buscar produto..."
                className="pl-8 h-8 w-56 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filter === f.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 ml-auto">
                  <Columns3 className="h-3.5 w-3.5 mr-1.5" /> Colunas
                  {hiddenCols.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({hiddenCols.length} ocultas)</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="text-xs font-semibold px-1 pb-1">Mostrar colunas</p>
                {TOGGLE_COLS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer rounded hover:bg-muted">
                    <Checkbox checked={v(c.key)} onCheckedChange={() => toggleCol(c.key)} /> {c.label}
                  </label>
                ))}
                {(hiddenCols.length > 0 || activeColFilters > 0) && (
                  <Button variant="ghost" size="sm" className="w-full h-7 mt-1 text-xs" onClick={() => { setHiddenCols([]); localStorage.removeItem(HIDDEN_KEY); setColFilters({}); }}>
                    Mostrar tudo e limpar filtros
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className={v('custo_mes') || v('custo_total') || v('min_mes') || v('min_total') ? 'overflow-x-auto' : ''}>
            <Table className="table-fixed w-full text-xs">
              <TableHeader>
                <TableRow>
                  {v('status') && sortHead("status", "Status", "w-[88px] text-center px-2")}
                  {v('nome') && sortHead("nome", "Produto", "text-center px-2")}
                  {v('linha') && sortHead("linha", "Linha", "w-[110px] text-center px-1")}
                  {v('meses') && sortHead("meses", "Contr.", "w-[60px] text-center px-1")}
                  {v('custo_mes') && sortHead("custo_mes", "Custo/mês", "w-[90px] text-center px-1")}
                  {v('custo_total') && sortHead("custo_total", "Custo Tot.", "w-[90px] text-center px-1")}
                  {v('ideal_mes') && sortHead("ideal_mes", "Ideal/mês", "w-[90px] text-center px-1")}
                  {v('ideal_total') && sortHead("ideal_total", "Ideal Tot.", "w-[90px] text-center px-1")}
                  {v('min_mes') && sortHead("min_mes", "Mín./mês", "w-[90px] text-center px-1")}
                  {v('min_total') && sortHead("min_total", "Mín. Tot.", "w-[90px] text-center px-1")}
                  {v('preco_mes') && sortHead("preco_mes", "Preço/mês", "w-[100px] text-center px-1")}
                  {v('preco_total') && sortHead("preco_total", "Total", "w-[90px] text-center px-1")}
                  {v('margem') && sortHead("margem", "Margem", "w-[140px] text-center px-1")}
                  {v('lucro_proj') && sortHead("lucro_proj", "Lucro Proj.", "w-[90px] text-center px-1")}
                  {v('acoes') && <TableHead className="w-[70px] text-center px-1">Ações</TableHead>}
                </TableRow>
                <TableRow className="hover:bg-transparent">
                  {v('status') && (
                    <TableHead className="px-1 py-1">
                      <Select value={colFilters.status || 'all'} onValueChange={(x) => setColFilter('status', x === 'all' ? '' : x)}>
                        <SelectTrigger className="h-7 text-[11px] px-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="Bom">Bom</SelectItem>
                          <SelectItem value="Abaixo">Abaixo</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                  )}
                  {v('nome') && filterCell("nome")}
                  {v('linha') && (
                    <TableHead className="px-1 py-1">
                      <Select value={colFilters.linha || 'all'} onValueChange={(x) => setColFilter('linha', x === 'all' ? '' : x)}>
                        <SelectTrigger className="h-7 text-[11px] px-2"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="Linha Premium">{config.markup.premium.label}</SelectItem>
                          <SelectItem value="Linha Gold">{config.markup.gold.label}</SelectItem>
                          <SelectItem value="Linha Prata">{config.markup.prata.label}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableHead>
                  )}
                  {v('meses') && filterCell("meses")}
                  {v('custo_mes') && filterCell("custo_mes")}
                  {v('custo_total') && filterCell("custo_total")}
                  {v('ideal_mes') && filterCell("ideal_mes")}
                  {v('ideal_total') && filterCell("ideal_total")}
                  {v('min_mes') && filterCell("min_mes")}
                  {v('min_total') && filterCell("min_total")}
                  {v('preco_mes') && filterCell("preco_mes")}
                  {v('preco_total') && filterCell("preco_total")}
                  {v('margem') && filterCell("margem")}
                  {v('lucro_proj') && filterCell("lucro_proj")}
                  {v('acoes') && (
                    <TableHead className="px-1 py-1 text-center">
                      {activeColFilters > 0 && (
                        <button onClick={() => setColFilters({})} className="text-[10px] text-blue-600 hover:underline" title="Limpar filtros das colunas">
                          Limpar
                        </button>
                      )}
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColCount} className="text-center py-10 text-gray-400">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedProducts.map((p) => {
                    const eff = getEffectivePrice(p, priceOverrides);
                    const { mc, pct } = calcMC(eff.preco_total, p.custo, config);
                    const lucroProj = calcLucroProjetado(eff.preco_total, p.custo, config);
                    const linhaKey = getLinhaKey(p.linha);
                    const ideal = calcIdealMensal(p.custo, p.meses, linhaKey, config);
                    const idealTotal = ideal * p.meses;
                    const minMensal = calcMinMensal(p.custo, p.meses, config);
                    const minTotal = minMensal * p.meses;
                    const status = statusCheck(p, priceOverrides, config);
                    const changed = priceOverrides[p.nome] !== undefined;

                    const barColor = pct < 0 ? 'bg-red-500' : pct < 0.35 ? 'bg-amber-500' : 'bg-green-500';
                    const pctColor = pct < 0 ? 'text-red-600' : pct < 0.35 ? 'text-amber-600' : 'text-green-600';
                    const barW = Math.max(0, Math.min(100, pct * 100));

                    return (
                      <TableRow key={p.nome} className={changed ? 'bg-amber-50/50' : ''}>
                        {v('status') && (
                        <TableCell className="px-2 py-2">
                          {status === 'Preço bom' ? (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 gap-1 text-[10px] px-1.5">
                              <TrendingUp className="h-3 w-3" /> Bom
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 gap-1 text-[10px] px-1.5">
                              <AlertTriangle className="h-3 w-3" /> Abaixo
                            </Badge>
                          )}
                        </TableCell>
                        )}
                        {v('nome') && (
                        <TableCell className="px-2 py-2">
                          <p className="text-xs font-medium leading-snug break-words">{p.nome}</p>
                          {changed && (
                            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                              <Pencil className="h-2.5 w-2.5" /> alterado
                            </p>
                          )}
                        </TableCell>
                        )}
                        {v('linha') && (
                        <TableCell className="px-1 py-2">
                          <Select
                            value={p.linha}
                            onValueChange={(v) => handleLinhaChange(p.nome, v as LinhaMarkup)}
                          >
                            <SelectTrigger className="h-7 text-xs w-full px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Linha Premium">{config.markup.premium.label} ({(config.markup.premium.target_margin*100).toFixed(0)}%)</SelectItem>
                              <SelectItem value="Linha Gold">{config.markup.gold.label} ({(config.markup.gold.target_margin*100).toFixed(0)}%)</SelectItem>
                              <SelectItem value="Linha Prata">{config.markup.prata.label} ({(config.markup.prata.target_margin*100).toFixed(0)}%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        )}
                        {v('meses') && (
                        <TableCell className="text-center text-xs text-gray-500 px-1 py-2">{p.meses}x</TableCell>
                        )}
                        {v('custo_mes') && <TableCell className="text-center text-xs text-gray-600 px-1 py-2">{fmtBRL(p.custo / Math.max(p.meses, 1))}</TableCell>}
                        {v('custo_total') && <TableCell className="text-center text-xs text-gray-600 px-1 py-2">{fmtBRL(p.custo)}</TableCell>}
                        {v('ideal_mes') && (
                        <TableCell className="text-center text-xs text-gray-400 px-1 py-2">{fmtBRL(ideal)}</TableCell>
                        )}
                        {v('ideal_total') && (
                        <TableCell className="text-center text-xs text-gray-400 px-1 py-2">{fmtBRL(idealTotal)}</TableCell>
                        )}
                        {v('min_mes') && <TableCell className="text-center text-xs text-red-500 px-1 py-2">{fmtBRL(minMensal)}</TableCell>}
                        {v('min_total') && <TableCell className="text-center text-xs text-red-500 px-1 py-2">{fmtBRL(minTotal)}</TableCell>}
                        {v('preco_mes') && (
                        <TableCell className="text-center px-1 py-2">
                          <Input
                            type="number"
                            className={`h-7 w-full text-right text-xs font-semibold px-2 ${changed ? 'border-amber-400 bg-amber-50' : ''}`}
                            value={getDisplayPrice(p.nome, eff.preco_mensal)}
                            onChange={(e) => handlePriceChange(p.nome, e.target.value)}
                            onBlur={() => handlePriceBlur(p.nome)}
                            step={1}
                            min={0}
                          />
                        </TableCell>
                        )}
                        {v('preco_total') && (
                        <TableCell className="text-center text-xs font-bold px-1 py-2">{fmtBRL(eff.preco_total)}</TableCell>
                        )}
                        {v('margem') && (
                        <TableCell className="px-1 py-2">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[70px]">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barW}%` }} />
                            </div>
                            <span className={`text-[11px] font-bold w-10 text-right ${pctColor}`}>{fmtPct(pct)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5 text-center">{fmtBRL(mc)}</p>
                        </TableCell>
                        )}
                        {v('lucro_proj') && (
                        <TableCell className="text-center px-1 py-2">
                          <span className={`text-xs font-bold ${lucroProj < 0 ? 'text-red-600' : lucroProj < 0.35 ? 'text-amber-600' : 'text-green-600'}`}>
                            {fmtPct(lucroProj)}
                          </span>
                        </TableCell>
                        )}
                        {v('acoes') && (
                        <TableCell className="text-center px-1 py-2">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setEditingProduct(p)}
                              title="Editar serviço"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(p)}
                              title="Excluir serviço"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <NewProductDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        config={config}
        existingNames={products.map((p) => p.nome)}
        onCreate={handleAddProduct}
      />

      <NewProductDialog
        open={!!editingProduct}
        onOpenChange={(o) => { if (!o) setEditingProduct(null); }}
        config={config}
        existingNames={products.map((p) => p.nome)}
        onCreate={handleAddProduct}
        editing={editingProduct}
        onUpdate={handleUpdateProduct}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá <strong>{deleteTarget?.nome}</strong> da tabela de precificação.
              Você pode reverter restaurando uma versão anterior no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
