import { useState, useCallback, useEffect } from 'react';
import { Produto, AppConfig } from '@/types/precificacao';
import { DEFAULT_PRODUCTS, DEFAULT_CONFIG } from '@/data/precificacaoData';
import { supabase } from '@/integrations/supabase/client';
import { recordPricingVersion } from '@/lib/pricingVersions';

const STORAGE_KEYS = {
  products: 'yampa_products',
  config: 'yampa_config',
  overrides: 'yampa_overrides',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeConfig(config: AppConfig): AppConfig {
  const next = JSON.parse(JSON.stringify(config)) as AppConfig;
  (['premium', 'gold', 'prata'] as const).forEach((k) => {
    if (next?.markup?.[k]?.label) {
      next.markup[k].label = next.markup[k].label.replace(/^Linha\s+/, '');
    }
  });
  return next;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toLinhaLabel(line: unknown): Produto['linha'] {
  if (line === 'premium' || String(line).toLowerCase().includes('premium')) return 'Linha Premium';
  if (line === 'prata' || String(line).toLowerCase().includes('prata')) return 'Linha Prata';
  return 'Linha Gold';
}

function buildLegacyConfig(snapshot: any): AppConfig {
  const markupLines = snapshot?.markup_lines ?? {};
  const baseLine = markupLines.gold ?? markupLines.premium ?? markupLines.prata ?? {};

  return sanitizeConfig({
    deductions: {
      impostos: toFiniteNumber(baseLine.tax_pct, DEFAULT_CONFIG.deductions.impostos),
      comissao: toFiniteNumber(baseLine.commission_pct, DEFAULT_CONFIG.deductions.comissao),
      gateway: toFiniteNumber(baseLine.gateway_pct, DEFAULT_CONFIG.deductions.gateway),
      churn: toFiniteNumber(baseLine.churn_pct, DEFAULT_CONFIG.deductions.churn),
    },
    markup: {
      premium: {
        target_margin: toFiniteNumber(markupLines.premium?.profit_pct, DEFAULT_CONFIG.markup.premium.target_margin),
        label: 'Premium',
      },
      gold: {
        target_margin: toFiniteNumber(markupLines.gold?.profit_pct, DEFAULT_CONFIG.markup.gold.target_margin),
        label: 'Gold',
      },
      prata: {
        target_margin: toFiniteNumber(markupLines.prata?.profit_pct, DEFAULT_CONFIG.markup.prata.target_margin),
        label: 'Prata',
      },
    },
    base_deductions_for_markup: {
      impostos: toFiniteNumber(baseLine.tax_pct, DEFAULT_CONFIG.base_deductions_for_markup.impostos),
      comissao: toFiniteNumber(baseLine.commission_pct, DEFAULT_CONFIG.base_deductions_for_markup.comissao),
      gateway: toFiniteNumber(baseLine.gateway_pct, DEFAULT_CONFIG.base_deductions_for_markup.gateway),
      investimento: toFiniteNumber(baseLine.investment_pct, DEFAULT_CONFIG.base_deductions_for_markup.investimento),
      comissao_comercial: toFiniteNumber(baseLine.sales_commission_pct, DEFAULT_CONFIG.base_deductions_for_markup.comissao_comercial),
      despesa_fixa: toFiniteNumber(baseLine.fixed_expense_pct, DEFAULT_CONFIG.base_deductions_for_markup.despesa_fixa),
      churn: toFiniteNumber(baseLine.churn_pct, DEFAULT_CONFIG.base_deductions_for_markup.churn),
    },
  });
}

function normalizeSnapshot(snapshot: any): { products: Produto[]; config: AppConfig } | null {
  if (!snapshot) return null;

  if (Array.isArray(snapshot.products) && snapshot.config) {
    return {
      products: snapshot.products as Produto[],
      config: sanitizeConfig(snapshot.config as AppConfig),
    };
  }

  if (!Array.isArray(snapshot.services)) return null;

  const config = buildLegacyConfig(snapshot);
  const products = snapshot.services
    .filter((service: any) => service?.active !== false)
    .map((service: any) => {
      const meses = Math.max(1, toFiniteNumber(service.contract_months, 1));
      const lineKey = getLinhaKey(toLinhaLabel(service.line));
      const idealMensalFromSnapshot =
        toFiniteNumber(service.ideal_monthly_price, 0) ||
        toFiniteNumber(service.ideal_price, 0) / meses;
      const derivedCost = idealMensalFromSnapshot > 0
        ? (idealMensalFromSnapshot / calcMarkup(lineKey, config)) * meses
        : 0;
      const custo = toFiniteNumber(service.cost_total, derivedCost);
      const precoTotal = toFiniteNumber(service.practiced_price, 0);

      return {
        nome: String(service.name ?? 'Serviço sem nome'),
        meses,
        linha: toLinhaLabel(service.line),
        custo,
        preco_total: precoTotal,
        preco_mensal: precoTotal / meses,
        ideal_mensal: idealMensalFromSnapshot || calcIdealMensal(custo, meses, lineKey, config),
      } satisfies Produto;
    });

  return products.length > 0 ? { products, config } : null;
}

function getProductNameSet(products: Produto[]): Set<string> {
  return new Set(
    products
      .map((product) => String(product?.nome ?? '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function shouldPreferLocalSnapshot(
  localSnapshot: { products: Produto[]; config: AppConfig },
  sharedSnapshot: { products: Produto[]; config: AppConfig } | null,
): boolean {
  const localNames = getProductNameSet(localSnapshot.products);
  if (localNames.size === 0) return false;
  if (!sharedSnapshot) return true;

  const sharedNames = getProductNameSet(sharedSnapshot.products);
  if (localNames.size > sharedNames.size) return true;
  for (const name of localNames) {
    if (!sharedNames.has(name)) return true;
  }
  return false;
}

function applySharedSnapshot(snapshot: { products: Produto[]; config: AppConfig }) {
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(snapshot.products));
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(snapshot.config));
}

async function loadActiveVersion(): Promise<{
  snapshot: { products: Produto[]; config: AppConfig } | null;
  hasActiveVersion: boolean;
}> {
  const { data, error } = await supabase
    .from('pricing_versions')
    .select('snapshot, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data?.length) {
    return { snapshot: null, hasActiveVersion: false };
  }

  const hasActiveVersion = data.some((row) => !!row.is_active);

  for (const row of data) {
    const normalized = normalizeSnapshot(row.snapshot as any);
    if (normalized) {
      return { snapshot: normalized, hasActiveVersion };
    }
  }

  return { snapshot: null, hasActiveVersion };
}

// ── Calculation helpers ──────────────────────────────────────────────────────

export function getLinhaKey(linha: string): 'premium' | 'gold' | 'prata' {
  if (linha.includes('Premium')) return 'premium';
  if (linha.includes('Prata')) return 'prata';
  return 'gold';
}

export function calcMarkup(linhaKey: 'premium' | 'gold' | 'prata', config: AppConfig): number {
  const bd = config.base_deductions_for_markup;
  const totalDed =
    bd.impostos + bd.comissao + bd.gateway + bd.investimento +
    bd.comissao_comercial + bd.despesa_fixa + bd.churn;
  return 1 / (1 - totalDed - config.markup[linhaKey].target_margin);
}

export function calcIdealMensal(custo: number, meses: number, linhaKey: 'premium' | 'gold' | 'prata', config: AppConfig): number {
  const mk = calcMarkup(linhaKey, config);
  return (custo / Math.max(meses, 1)) * mk;
}

export function calcMinMensal(custo: number, meses: number, config: AppConfig): number {
  const bd = config.base_deductions_for_markup;
  const totalDed =
    bd.impostos + bd.comissao + bd.gateway + bd.investimento +
    bd.comissao_comercial + bd.despesa_fixa + bd.churn;
  const mk = 1 / (1 - totalDed);
  return (custo / Math.max(meses, 1)) * mk;
}

export function calcMC(preco_total: number, custo: number, config: AppConfig) {
  const { impostos, comissao, gateway, churn } = config.deductions;
  const dedRate = impostos + comissao + gateway + churn;
  const mc = preco_total * (1 - dedRate) - custo;
  const pct = preco_total > 0 ? mc / preco_total : 0;
  return { mc, pct };
}

/**
 * Lucro Projetado por Produto (coluna Y da planilha "Análise de Preços").
 *
 * Fórmula da planilha:
 *   Y = (Preço Praticado Total − CUSTO UNITÁRIO TOTAL) / Preço Praticado Total
 *
 * Onde:
 *   CUSTO UNITÁRIO TOTAL (M) = CVu TOTAL (K) + CF Unitário (L)
 *   CVu TOTAL (K)            = CV S/ Venda (J) + Custo das horas
 *   CV S/ Venda (J)          = (Impostos + Comissão + Gateway + Churn) × Preço Total
 *   CF Unitário (L)          = Despesa Fixa (Markup!C13) × Preço Total
 *
 * Importante: a planilha NÃO inclui Investimento nem Comissão Comercial Média
 * no cálculo de CV s/ Venda — apenas as 4 deduções acima + a despesa fixa.
 */
export function calcLucroProjetado(preco_total: number, custo: number, config: AppConfig) {
  if (preco_total <= 0) return 0;
  const bd = config.base_deductions_for_markup;
  const cvRate = bd.impostos + bd.comissao + bd.gateway + bd.churn;
  const cfRate = bd.despesa_fixa;
  const custoUnitarioTotal = (cvRate + cfRate) * preco_total + custo;
  return (preco_total - custoUnitarioTotal) / preco_total;
}

export function getEffectivePrice(p: Produto, overrides: Record<string, number>) {
  if (overrides[p.nome] !== undefined) {
    const newMonthly = overrides[p.nome];
    return { preco_mensal: newMonthly, preco_total: newMonthly * p.meses };
  }
  return { preco_mensal: p.preco_mensal, preco_total: p.preco_total };
}

export function statusCheck(p: Produto, overrides: Record<string, number>, config: AppConfig): 'Preço bom' | 'Abaixo do ideal' {
  const effective = getEffectivePrice(p, overrides);
  const ideal = calcIdealMensal(p.custo, p.meses, getLinhaKey(p.linha), config);
  return effective.preco_mensal >= ideal ? 'Preço bom' : 'Abaixo do ideal';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePrecificacao() {
  const [products, setProductsState] = useState<Produto[]>(() =>
    loadFromStorage(STORAGE_KEYS.products, DEFAULT_PRODUCTS)
  );
  const [config, setConfigState] = useState<AppConfig>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.config, DEFAULT_CONFIG);
    return sanitizeConfig(loaded);
  });
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>(() =>
    loadFromStorage(STORAGE_KEYS.overrides, {})
  );

  // Sync shared state from the active pricing version in the database so every user
  // sees the same catalog regardless of localStorage.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const snap = await loadActiveVersion();
      if (cancelled || !snap) return;
      setProductsState(snap.products);
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(snap.products));
      setConfigState(snap.config);
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(snap.config));
    };
    sync();
    const handler = () => sync();
    window.addEventListener('pricing-version-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('pricing-version-changed', handler);
    };
  }, []);



  const setProducts = useCallback((newProducts: Produto[]) => {
    setProductsState(newProducts);
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(newProducts));
  }, []);

  const updateConfig = useCallback((newConfig: AppConfig) => {
    setConfigState(newConfig);
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(newConfig));
  }, []);

  const updatePrice = useCallback((nome: string, newMonthly: number) => {
    const original = products.find((p) => p.nome === nome)?.preco_mensal ?? 0;
    setPriceOverrides((prev) => {
      const next = { ...prev };
      if (Math.abs(newMonthly - original) < 0.01) {
        delete next[nome];
      } else {
        next[nome] = newMonthly;
      }
      localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(next));
      return next;
    });
  }, [products]);

  const saveChanges = useCallback(() => {
    setProductsState((prev) => {
      const updated = prev.map((p) => {
        if (priceOverrides[p.nome] !== undefined) {
          const newMonthly = priceOverrides[p.nome];
          return { ...p, preco_mensal: newMonthly, preco_total: newMonthly * p.meses };
        }
        return p;
      });
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(updated));
      return updated;
    });
    setPriceOverrides({});
    localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify({}));
  }, [priceOverrides]);

  const resetChanges = useCallback(() => {
    setPriceOverrides({});
    localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify({}));
  }, []);

  const updateLinha = useCallback((nome: string, novaLinha: 'Linha Premium' | 'Linha Gold' | 'Linha Prata') => {
    setProductsState((prev) => {
      const updated = prev.map((p) => p.nome === nome ? { ...p, linha: novaLinha } : p);
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addProduct = useCallback((novo: Produto) => {
    setProductsState((prev) => {
      const updated = [novo, ...prev];
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateProduct = useCallback((originalName: string, atualizado: Produto) => {
    setProductsState((prev) => {
      const updated = prev.map((p) => (p.nome === originalName ? atualizado : p));
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(updated));
      return updated;
    });
    if (originalName !== atualizado.nome) {
      setPriceOverrides((prev) => {
        if (prev[originalName] === undefined) return prev;
        const next = { ...prev };
        delete next[originalName];
        localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const removeProduct = useCallback((nome: string) => {
    setProductsState((prev) => {
      const updated = prev.filter((p) => p.nome !== nome);
      localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(updated));
      return updated;
    });
    setPriceOverrides((prev) => {
      if (prev[nome] === undefined) return prev;
      const next = { ...prev };
      delete next[nome];
      localStorage.setItem(STORAGE_KEYS.overrides, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    products,
    config,
    priceOverrides,
    setProducts,
    updateConfig,
    updatePrice,
    updateLinha,
    addProduct,
    updateProduct,
    removeProduct,
    saveChanges,
    resetChanges,
  };
}

export type PrecificacaoHook = ReturnType<typeof usePrecificacao>;
