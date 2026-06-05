import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';
import { PrecificacaoHook, calcMarkup } from '@/hooks/usePrecificacao';
import { AppConfig } from '@/types/precificacao';
import { recordPricingVersion } from '@/lib/pricingVersions';

const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

const MARKUP_LINES = [
  { key: 'premium' as const, label: 'Premium', colorClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'gold'    as const, label: 'Gold',    colorClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'prata'  as const, label: 'Prata',   colorClass: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const DEDUCTIONS = [
  { key: 'impostos' as const, label: 'Impostos sobre faturamento', hint: 'Simples Nacional, IRPJ, etc.' },
  { key: 'comissao' as const, label: 'Comissão de vendas',        hint: 'Comissão do representante' },
  { key: 'gateway'  as const, label: 'Gateway / Cartão',          hint: 'Taxa de cartão de crédito' },
  { key: 'churn'    as const, label: 'Churn (provisão)',           hint: 'Provisão para cancelamentos' },
];

const BASE_DEDUCTIONS = [
  { key: 'impostos'          as const, label: 'Impostos' },
  { key: 'comissao'          as const, label: 'Comissão' },
  { key: 'gateway'           as const, label: 'Gateway' },
  { key: 'investimento'      as const, label: 'Investimento (mkt)' },
  { key: 'comissao_comercial'as const, label: 'Comissão comercial' },
  { key: 'despesa_fixa'      as const, label: 'Despesa fixa (% fat.)' },
  { key: 'churn'             as const, label: 'Churn' },
];

export default function ConfiguracoesTab({ config, updateConfig, products }: PrecificacaoHook) {
  const [draft, setDraft] = useState<AppConfig>(() => JSON.parse(JSON.stringify(config)));
  const [saved, setSaved] = useState(false);

  const setMarkupMargin = (key: 'premium' | 'gold' | 'prata', pct: number) => {
    setDraft((prev) => ({
      ...prev,
      markup: { ...prev.markup, [key]: { ...prev.markup[key], target_margin: pct / 100 } },
    }));
  };

  const setDeduction = (key: keyof typeof draft.deductions, pct: number) => {
    setDraft((prev) => ({
      ...prev,
      deductions: { ...prev.deductions, [key]: pct / 100 },
    }));
  };

  const setBaseDeduction = (key: keyof typeof draft.base_deductions_for_markup, pct: number) => {
    setDraft((prev) => ({
      ...prev,
      base_deductions_for_markup: { ...prev.base_deductions_for_markup, [key]: pct / 100 },
    }));
  };

  const handleSave = () => {
    updateConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    recordPricingVersion({
      source: 'edit',
      change_type: 'config_update',
      name: 'Configurações atualizadas',
      description: 'Margens de markup e/ou deduções alteradas.',
      snapshot: { products, config: draft },
      setActive: true,
    }).then(() => window.dispatchEvent(new Event('pricing-version-changed')));
  };

  const totalDedMC = Object.values(draft.deductions).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6 max-w-4xl">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Markup targets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Lucro Líquido Desejado por Linha</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Define o markup aplicado ao custo para calcular o Preço Ideal Sugerido.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {MARKUP_LINES.map((l) => {
              const mk = calcMarkup(l.key, draft);
              return (
                <div key={l.key} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${l.colorClass} mb-1`}>{l.label}</span>
                    <p className="text-xs text-gray-400">Markup calculado: <strong className="text-blue-700">{mk.toFixed(4)}×</strong></p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Input
                      type="number"
                      className="w-20 h-8 text-right text-sm"
                      value={(draft.markup[l.key].target_margin * 100).toFixed(1)}
                      step={0.5}
                      min={0}
                      max={90}
                      onChange={(e) => setMarkupMargin(l.key, parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Deductions for MC */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Deduções sobre Faturamento (M.C.)</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Usadas para calcular a Margem de Contribuição. Total atual: <strong>{fmtPct(totalDedMC)}</strong></p>
          </CardHeader>
          <CardContent className="space-y-3">
            {DEDUCTIONS.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm">{d.label}</p>
                  <p className="text-xs text-gray-400">{d.hint}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Input
                    type="number"
                    className="w-20 h-8 text-right text-sm"
                    value={(draft.deductions[d.key] * 100).toFixed(2)}
                    step={0.01}
                    min={0}
                    max={50}
                    onChange={(e) => setDeduction(d.key, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Base deductions for markup calculation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Deduções Base para Cálculo do Markup</CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Estas taxas entram na fórmula do markup: <code className="bg-gray-100 px-1 rounded text-xs">Markup = 1 / (1 − total_deduções − lucro_desejado)</code>
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {BASE_DEDUCTIONS.map((d) => (
              <div key={d.key}>
                <p className="text-xs text-gray-500 mb-1">{d.label}</p>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right text-sm"
                    value={(draft.base_deductions_for_markup[d.key] * 100).toFixed(2)}
                    step={0.01}
                    min={0}
                    max={100}
                    onChange={(e) => setBaseDeduction(d.key, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Markup summary table */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Resumo do Markup Calculado</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-2 text-xs font-semibold text-gray-500">Linha</th>
                <th className="text-right p-2 text-xs font-semibold text-gray-500">Lucro Desejado</th>
                <th className="text-right p-2 text-xs font-semibold text-gray-500">Total Deduções Base</th>
                <th className="text-right p-2 text-xs font-semibold text-gray-500">Markup</th>
              </tr>
            </thead>
            <tbody>
              {MARKUP_LINES.map((l) => {
                const mk = calcMarkup(l.key, draft);
                const totalBase = Object.values(draft.base_deductions_for_markup).reduce((s, v) => s + v, 0);
                return (
                  <tr key={l.key} className="border-t">
                    <td className="p-2 font-medium">{l.label}</td>
                    <td className="p-2 text-right">{fmtPct(draft.markup[l.key].target_margin)}</td>
                    <td className="p-2 text-right text-gray-500">{fmtPct(totalBase)}</td>
                    <td className="p-2 text-right font-bold text-blue-700">{mk.toFixed(4)}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} className={saved ? 'bg-green-600 hover:bg-green-700' : ''}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {saved ? '✓ Configurações salvas!' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
