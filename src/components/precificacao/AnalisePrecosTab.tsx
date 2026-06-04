import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RotateCcw, Save, Search, TrendingUp, AlertTriangle, Package, Pencil, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NewProductDialog from './NewProductDialog';
import { recordPricingVersion } from '@/lib/pricingVersions';
import { Produto } from '@/types/precificacao';
import { PrecificacaoHook, calcMC, calcIdealMensal, calcMinMensal, getEffectivePrice, getLinhaKey, statusCheck, calcLucroProjetado } from '@/hooks/usePrecificacao';
import { FilterMode, LinhaMarkup } from '@/types/precificacao';

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
  products, config, priceOverrides, updatePrice, updateLinha, addProduct, saveChanges, resetChanges,
}: PrecificacaoHook) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('todos');
  const [editingPrice, setEditingPrice] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const changedCount = Object.keys(priceOverrides).length;

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
    return matchSearch && matchFilter;
  });

  // Stats
  const goodCount = products.filter((p) => statusCheck(p, priceOverrides, config) === 'Preço bom').length;
  const avgMC = products.reduce((sum, p) => {
    const eff = getEffectivePrice(p, priceOverrides);
    return sum + calcMC(eff.preco_total, p.custo, config).pct;
  }, 0) / (products.length || 1);

  const handleSave = () => {
    const changedNames = Object.keys(priceOverrides);
    const updatedProducts = products.map((p) => {
      if (priceOverrides[p.nome] !== undefined) {
        const newMonthly = priceOverrides[p.nome];
        return { ...p, preco_mensal: newMonthly, preco_total: newMonthly * p.meses };
      }
      return p;
    });
    saveChanges();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (changedNames.length > 0) {
      recordPricingVersion({
        source: 'edit',
        change_type: 'price_update',
        name: `Atualização de preços (${changedNames.length} ${changedNames.length === 1 ? 'item' : 'itens'})`,
        description: changedNames.slice(0, 5).join(', ') + (changedNames.length > 5 ? '...' : ''),
        snapshot: { products: updatedProducts, config },
        setActive: true,
      }).then(() => window.dispatchEvent(new Event('pricing-version-changed')));
    }
  };

  const handleAddProduct = (novo: Produto) => {
    addProduct(novo);
    recordPricingVersion({
      source: 'edit',
      change_type: 'new_service',
      name: `Novo serviço: ${novo.nome}`,
      description: `Linha ${novo.linha} · ${novo.meses}x · ${novo.preco_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`,
      snapshot: { products: [novo, ...products], config },
      setActive: true,
    }).then(() => window.dispatchEvent(new Event('pricing-version-changed')));
  };

  const handleLinhaChange = (nome: string, novaLinha: LinhaMarkup) => {
    updateLinha(nome, novaLinha);
    const updated = products.map((p) => p.nome === nome ? { ...p, linha: novaLinha } : p);
    recordPricingVersion({
      source: 'edit',
      change_type: 'line_update',
      name: `Linha alterada: ${nome}`,
      description: `Nova linha: ${novaLinha}`,
      snapshot: { products: updated, config },
      setActive: true,
    }).then(() => window.dispatchEvent(new Event('pricing-version-changed')));
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
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Serviços</p>
            <p className="text-2xl font-bold mt-1">{products.length}</p>
            <p className="text-xs text-gray-500 mt-1">{goodCount} com preço adequado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Abaixo do Ideal</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{products.length - goodCount}</p>
            <p className="text-xs text-gray-500 mt-1">{Math.round(((products.length - goodCount) / products.length) * 100)}% do portfólio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">M.C. Média</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{fmtPct(avgMC)}</p>
            <p className="text-xs text-gray-500 mt-1">Após deduções variáveis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alterações</p>
            <p className={`text-2xl font-bold mt-1 ${changedCount > 0 ? 'text-amber-600' : ''}`}>{changedCount}</p>
            <p className="text-xs text-gray-500 mt-1">{changedCount > 0 ? 'Pendentes de salvar' : 'Nenhuma alteração'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
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
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-36">Linha</TableHead>
                  <TableHead className="w-20 text-center">Contrato</TableHead>
                  <TableHead className="w-28 text-right">Custo</TableHead>
                  <TableHead className="w-28 text-right">Mín. (0%) /mês</TableHead>
                  <TableHead className="w-28 text-right">Mín. (0%) Total</TableHead>
                  <TableHead className="w-28 text-right">Preço Ideal/mês</TableHead>
                  <TableHead className="w-28 text-right">Preço Ideal Total</TableHead>
                  <TableHead className="w-32 text-right">Preço/mês</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-44">Margem</TableHead>
                  <TableHead className="w-36 text-right">Lucro Projetado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-10 text-gray-400">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => {
                    const eff = getEffectivePrice(p, priceOverrides);
                    const { mc, pct } = calcMC(eff.preco_total, p.custo, config);
                    const lucroProj = calcLucroProjetado(eff.preco_total, p.custo);
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
                        <TableCell>
                          {status === 'Preço bom' ? (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 gap-1 text-xs">
                              <TrendingUp className="h-3 w-3" /> Preço bom
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" /> Abaixo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="text-xs font-medium leading-snug max-w-xs">{p.nome}</p>
                          {changed && (
                            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                              <Pencil className="h-2.5 w-2.5" /> preço alterado
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={p.linha}
                            onValueChange={(v) => handleLinhaChange(p.nome, v as LinhaMarkup)}
                          >
                            <SelectTrigger className="h-7 text-xs w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Linha Premium">{config.markup.premium.label} ({(config.markup.premium.target_margin*100).toFixed(0)}%)</SelectItem>
                              <SelectItem value="Linha Gold">{config.markup.gold.label} ({(config.markup.gold.target_margin*100).toFixed(0)}%)</SelectItem>
                              <SelectItem value="Linha Prata">{config.markup.prata.label} ({(config.markup.prata.target_margin*100).toFixed(0)}%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center text-sm text-gray-500">{p.meses}x</TableCell>
                        <TableCell className="text-right text-sm text-gray-500">{fmtBRL(p.custo)}</TableCell>
                        <TableCell className="text-right text-sm text-red-500">{fmtBRL(minMensal)}</TableCell>
                        <TableCell className="text-right text-sm text-red-500">{fmtBRL(minTotal)}</TableCell>
                        <TableCell className="text-right text-sm text-gray-400">{fmtBRL(ideal)}</TableCell>
                        <TableCell className="text-right text-sm text-gray-400">{fmtBRL(idealTotal)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className={`h-7 w-24 text-right text-sm font-semibold ml-auto ${changed ? 'border-amber-400 bg-amber-50' : ''}`}
                            value={getDisplayPrice(p.nome, eff.preco_mensal)}
                            onChange={(e) => handlePriceChange(p.nome, e.target.value)}
                            onBlur={() => handlePriceBlur(p.nome)}
                            step={1}
                            min={0}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold">{fmtBRL(eff.preco_total)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[48px]">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barW}%` }} />
                            </div>
                            <span className={`text-xs font-bold w-12 text-right ${pctColor}`}>{fmtPct(pct)}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5 text-right">{fmtBRL(mc)}</p>
                        </TableCell>
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
    </div>
  );
}
