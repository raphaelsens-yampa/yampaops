import { useState, useCallback } from 'react';
import { Produto, AppConfig } from '@/types/precificacao';
import { DEFAULT_PRODUCTS, DEFAULT_CONFIG } from '@/data/precificacaoData';

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
  const [config, setConfigState] = useState<AppConfig>(() =>
    loadFromStorage(STORAGE_KEYS.config, DEFAULT_CONFIG)
  );
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>(() =>
    loadFromStorage(STORAGE_KEYS.overrides, {})
  );

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

  return {
    products,
    config,
    priceOverrides,
    setProducts,
    updateConfig,
    updatePrice,
    saveChanges,
    resetChanges,
  };
}

export type PrecificacaoHook = ReturnType<typeof usePrecificacao>;
