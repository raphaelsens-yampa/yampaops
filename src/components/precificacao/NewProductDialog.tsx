import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Plus, Trash2, TrendingUp, AlertTriangle, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { Produto, LinhaMarkup, CustoBreakdownItem, AppConfig } from '@/types/precificacao';
import { calcIdealMensal, calcMinMensal, calcMC, getLinhaKey } from '@/hooks/usePrecificacao';
import { useInsumos, insumoCusto, Insumo } from '@/hooks/useInsumos';

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const breakdownItemSchema = z.object({
  cargo: z.string().trim().min(1, 'Cargo obrigatório').max(80),
  horas: z.number().positive('Horas > 0'),
  valor_hora: z.number().positive('Valor/h > 0'),
});

const baseSchema = z.object({
  nome: z.string().trim().min(1, 'Nome obrigatório').max(200),
  meses: z.number().int().min(1).max(60),
  linha: z.enum(['Linha Premium', 'Linha Gold', 'Linha Prata']),
  preco_mensal: z.number().min(0, 'Preço deve ser ≥ 0'),
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AppConfig;
  existingNames: string[];
  onCreate: (p: Produto) => void;
};

export default function NewProductDialog({ open, onOpenChange, config, existingNames, onCreate }: Props) {
  const [nome, setNome] = useState('');
  const [meses, setMeses] = useState(12);
  const [linha, setLinha] = useState<LinhaMarkup>('Linha Gold');
  const [mode, setMode] = useState<'simples' | 'detalhado' | 'insumos'>('simples');
  const [custoSimples, setCustoSimples] = useState(0);
  const [breakdown, setBreakdown] = useState<CustoBreakdownItem[]>([
    { cargo: '', horas: 0, valor_hora: 0 },
  ]);
  const [selectedInsumos, setSelectedInsumos] = useState<Record<string, number>>({}); // id -> qty
  const [insumoFilter, setInsumoFilter] = useState('');
  const [preco, setPreco] = useState(0);
  const [precoTouched, setPrecoTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { insumos, loading: loadingInsumos } = useInsumos();

  // Reset on open
  useEffect(() => {
    if (open) {
      setNome(''); setMeses(12); setLinha('Linha Gold');
      setMode('simples'); setCustoSimples(0);
      setBreakdown([{ cargo: '', horas: 0, valor_hora: 0 }]);
      setSelectedInsumos({}); setInsumoFilter('');
      setPreco(0); setPrecoTouched(false); setErrors({});
    }
  }, [open]);

  const insumosCusto = useMemo(
    () => insumos.reduce((s, i) => s + (selectedInsumos[i.id] ? insumoCusto(i) * selectedInsumos[i.id] : 0), 0),
    [insumos, selectedInsumos]
  );

  const custo = useMemo(() => {
    if (mode === 'simples') return custoSimples;
    if (mode === 'insumos') return insumosCusto;
    return breakdown.reduce((s, b) => s + (b.horas || 0) * (b.valor_hora || 0), 0);
  }, [mode, custoSimples, breakdown, insumosCusto]);

  const linhaKey = getLinhaKey(linha);
  const ideal = useMemo(() => calcIdealMensal(custo, meses, linhaKey, config), [custo, meses, linhaKey, config]);
  const idealTotal = ideal * meses;
  const minMensal = useMemo(() => calcMinMensal(custo, meses, config), [custo, meses, config]);
  const minTotal = minMensal * meses;
  const precoTotal = preco * meses;
  const { mc, pct } = useMemo(() => calcMC(precoTotal, custo, config), [precoTotal, custo, config]);

  // Auto-fill preço com ideal sempre que ideal mudar e usuário não tiver editado
  useEffect(() => {
    if (!precoTouched && ideal > 0 && isFinite(ideal)) {
      setPreco(Number(ideal.toFixed(2)));
    }
  }, [ideal, precoTouched]);

  const updateBreakdown = (i: number, patch: Partial<CustoBreakdownItem>) => {
    setBreakdown((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };
  const addBreakdownRow = () => setBreakdown((p) => [...p, { cargo: '', horas: 0, valor_hora: 0 }]);
  const removeBreakdownRow = (i: number) =>
    setBreakdown((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

  const handleSubmit = () => {
    const errs: Record<string, string> = {};

    const parsed = baseSchema.safeParse({ nome, meses, linha, preco_mensal: preco });
    if (!parsed.success) {
      parsed.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
    }

    if (existingNames.some((n) => n.toLowerCase() === nome.trim().toLowerCase())) {
      errs.nome = 'Já existe um serviço com este nome';
    }

    if (mode === 'simples') {
      if (custoSimples <= 0) errs.custo = 'Custo deve ser > 0';
    } else if (mode === 'insumos') {
      if (Object.keys(selectedInsumos).length === 0) errs.custo = 'Selecione ao menos um insumo';
      else if (custo <= 0) errs.custo = 'Custo total dos insumos deve ser > 0';
    } else {
      const bErrs = breakdown.map((b) => breakdownItemSchema.safeParse(b));
      if (bErrs.some((r) => !r.success)) errs.custo = 'Verifique os itens da composição';
      if (custo <= 0) errs.custo = 'Custo total deve ser > 0';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast({ title: 'Verifique os campos', description: Object.values(errs)[0], variant: 'destructive' });
      return;
    }

    // Quando o usuário compõe via insumos, transformamos em breakdown para registro
    const insumoBreakdown: CustoBreakdownItem[] | undefined = mode === 'insumos'
      ? insumos
          .filter((i) => selectedInsumos[i.id])
          .map((i) => ({
            cargo: `${i.tipo === 'subproduto' ? '[Sub] ' : ''}${i.nome}`,
            horas: selectedInsumos[i.id],
            valor_hora: insumoCusto(i),
          }))
      : undefined;

    const novo: Produto = {
      nome: nome.trim(),
      meses,
      linha,
      custo,
      preco_mensal: preco,
      preco_total: precoTotal,
      ideal_mensal: ideal,
      ...(mode === 'detalhado' ? { custo_breakdown: breakdown } : {}),
      ...(insumoBreakdown ? { custo_breakdown: insumoBreakdown } : {}),
    };

    onCreate(novo);
    toast({ title: 'Serviço criado', description: novo.nome });
    onOpenChange(false);
  };

  const statusOk = preco >= ideal;
  const pctColor = pct < 0 ? 'text-red-600' : pct < 0.35 ? 'text-amber-600' : 'text-green-600';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Serviço</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
          {/* FORM */}
          <div className="space-y-5">
            {/* 1. Identificação */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identificação</h3>
              <div>
                <Label className="text-xs">Nome do Serviço</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder="Ex: BPO Financeiro Pleno" />
                {errors.nome && <p className="text-xs text-red-600 mt-1">{errors.nome}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Meses de Contrato</Label>
                  <Input type="number" min={1} max={60} value={meses}
                    onChange={(e) => setMeses(Math.max(1, parseInt(e.target.value) || 1))} />
                </div>
                <div>
                  <Label className="text-xs">Linha de Markup</Label>
                  <Select value={linha} onValueChange={(v) => setLinha(v as LinhaMarkup)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Linha Premium">
                        {config.markup.premium.label} ({(config.markup.premium.target_margin * 100).toFixed(0)}%)
                      </SelectItem>
                      <SelectItem value="Linha Gold">
                        {config.markup.gold.label} ({(config.markup.gold.target_margin * 100).toFixed(0)}%)
                      </SelectItem>
                      <SelectItem value="Linha Prata">
                        {config.markup.prata.label} ({(config.markup.prata.target_margin * 100).toFixed(0)}%)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <Separator />

            {/* 2. Custo */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custo das horas</h3>
              <Tabs value={mode} onValueChange={(v) => setMode(v as 'simples' | 'detalhado' | 'insumos')}>
                <TabsList className="h-8">
                  <TabsTrigger value="simples" className="text-xs">Custo único</TabsTrigger>
                  <TabsTrigger value="detalhado" className="text-xs">Composição por horas</TabsTrigger>
                  <TabsTrigger value="insumos" className="text-xs gap-1">
                    <Package className="h-3 w-3" /> Insumos
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="simples" className="pt-3">
                  <Label className="text-xs">Custo total (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={custoSimples}
                    onChange={(e) => setCustoSimples(parseFloat(e.target.value) || 0)} />
                </TabsContent>
                <TabsContent value="detalhado" className="pt-3 space-y-2">
                  <div className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 text-xs font-semibold text-gray-500 px-1">
                    <span>Cargo</span><span className="text-right">Horas</span>
                    <span className="text-right">Valor/h</span><span className="text-right">Subtotal</span><span />
                  </div>
                  {breakdown.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px_100px_32px] gap-2 items-center">
                      <Input className="h-8 text-xs" placeholder="Ex: Analista" value={b.cargo}
                        onChange={(e) => updateBreakdown(i, { cargo: e.target.value })} />
                      <Input className="h-8 text-xs text-right" type="number" min={0} step="0.5" value={b.horas}
                        onChange={(e) => updateBreakdown(i, { horas: parseFloat(e.target.value) || 0 })} />
                      <Input className="h-8 text-xs text-right" type="number" min={0} step="0.01" value={b.valor_hora}
                        onChange={(e) => updateBreakdown(i, { valor_hora: parseFloat(e.target.value) || 0 })} />
                      <div className="text-right text-xs font-medium pr-1">{fmtBRL(b.horas * b.valor_hora)}</div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => removeBreakdownRow(i)} disabled={breakdown.length === 1}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addBreakdownRow} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Adicionar item
                  </Button>
                  <div className="flex justify-end pt-2 text-sm">
                    <span className="text-gray-500 mr-2">Custo total:</span>
                    <span className="font-bold">{fmtBRL(custo)}</span>
                  </div>
                </TabsContent>
              </Tabs>
                </TabsContent>
                <TabsContent value="insumos" className="pt-3 space-y-2">
                  {loadingInsumos ? (
                    <p className="text-xs text-gray-500">Carregando insumos...</p>
                  ) : insumos.length === 0 ? (
                    <p className="text-xs text-amber-600">
                      Nenhum insumo cadastrado. Importe uma planilha com a aba "Custos dos Insumos".
                    </p>
                  ) : (
                    <>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Buscar insumo..."
                        value={insumoFilter}
                        onChange={(e) => setInsumoFilter(e.target.value)}
                      />
                      <ScrollArea className="h-64 border rounded-md">
                        <div className="p-2 space-y-1">
                          {(['item', 'subproduto'] as const).map((grupo) => {
                            const filtered = insumos.filter(
                              (i) =>
                                i.tipo === grupo &&
                                (insumoFilter === '' ||
                                  i.nome.toLowerCase().includes(insumoFilter.toLowerCase()))
                            );
                            if (filtered.length === 0) return null;
                            return (
                              <div key={grupo} className="space-y-1">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-1">
                                  {grupo === 'item' ? 'Itens (mão de obra / ações)' : 'Subprodutos'}
                                </p>
                                {filtered.map((i: Insumo) => {
                                  const qty = selectedInsumos[i.id] ?? 0;
                                  const checked = qty > 0;
                                  const unit = insumoCusto(i);
                                  return (
                                    <div
                                      key={i.id}
                                      className="grid grid-cols-[24px_1fr_70px_90px] gap-2 items-center px-1 py-1 hover:bg-gray-50 rounded"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(c) =>
                                          setSelectedInsumos((prev) => {
                                            const next = { ...prev };
                                            if (c) next[i.id] = next[i.id] || 1;
                                            else delete next[i.id];
                                            return next;
                                          })
                                        }
                                      />
                                      <div className="min-w-0">
                                        <p className="text-xs truncate" title={i.nome}>{i.nome}</p>
                                        <p className="text-[10px] text-gray-400">{fmtBRL(unit)} / un</p>
                                      </div>
                                      <Input
                                        className="h-7 text-xs text-right"
                                        type="number"
                                        min={0}
                                        step="1"
                                        value={qty}
                                        onChange={(e) => {
                                          const v = parseFloat(e.target.value) || 0;
                                          setSelectedInsumos((prev) => {
                                            const next = { ...prev };
                                            if (v > 0) next[i.id] = v;
                                            else delete next[i.id];
                                            return next;
                                          });
                                        }}
                                      />
                                      <div className="text-right text-xs font-medium pr-1">
                                        {fmtBRL(unit * qty)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <div className="flex justify-end pt-1 text-sm">
                        <span className="text-gray-500 mr-2">Custo total:</span>
                        <span className="font-bold">{fmtBRL(insumosCusto)}</span>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
              {errors.custo && <p className="text-xs text-red-600">{errors.custo}</p>}
            </section>

            <Separator />

            {/* 3. Preço */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Preço</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Preço /mês (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={preco}
                    onChange={(e) => { setPrecoTouched(true); setPreco(parseFloat(e.target.value) || 0); }} />
                  <button type="button" className="text-xs text-blue-600 mt-1 hover:underline"
                    onClick={() => { setPrecoTouched(false); setPreco(Number(ideal.toFixed(2))); }}>
                    Usar preço ideal sugerido
                  </button>
                </div>
                <div>
                  <Label className="text-xs">Preço Total (R$)</Label>
                  <Input value={fmtBRL(precoTotal)} readOnly className="bg-gray-50" />
                </div>
              </div>
              {errors.preco_mensal && <p className="text-xs text-red-600">{errors.preco_mensal}</p>}
            </section>
          </div>

          {/* PREVIEW */}
          <aside className="space-y-3 bg-gray-50 rounded-lg p-4 h-fit">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Indicadores</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Mín. (0%) /mês</span>
                <span className="text-red-600 font-medium text-xs">{fmtBRL(minMensal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Mín. (0%) Total</span>
                <span className="text-red-600 font-medium text-xs">{fmtBRL(minTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Ideal /mês</span>
                <span className="text-gray-800 font-semibold text-xs">{fmtBRL(ideal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Ideal Total</span>
                <span className="text-gray-800 font-semibold text-xs">{fmtBRL(idealTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Margem (R$)</span>
                <span className={`font-bold text-xs ${pctColor}`}>{fmtBRL(mc)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-xs">Margem (%)</span>
                <span className={`font-bold text-xs ${pctColor}`}>{fmtPct(pct)}</span>
              </div>
            </div>

            <div className="pt-2">
              {statusOk ? (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 gap-1 text-xs w-full justify-center py-1">
                  <TrendingUp className="h-3 w-3" /> Preço bom
                </Badge>
              ) : (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 gap-1 text-xs w-full justify-center py-1">
                  <AlertTriangle className="h-3 w-3" /> Abaixo do ideal
                </Badge>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit}>Criar Serviço</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
