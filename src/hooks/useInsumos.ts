import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Insumo {
  id: string;
  nome: string;
  tipo: 'item' | 'subproduto';
  custo_minuto: number | null;
  custo_acao: number | null;
  qntde_minutos: number | null;
  valor_insumo: number | null;
  source_file: string | null;
  updated_at: string;
}

export function insumoCusto(i: Insumo): number {
  if (i.tipo === 'subproduto') return Number(i.valor_insumo ?? 0);
  return Number(i.custo_acao ?? 0);
}

export function useInsumos() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInsumos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('precificacao_insumos')
      .select('*')
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true });
    if (!error && data) setInsumos(data as Insumo[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInsumos();
    const handler = () => fetchInsumos();
    window.addEventListener('insumos-changed', handler);
    return () => window.removeEventListener('insumos-changed', handler);
  }, [fetchInsumos]);

  return { insumos, loading, refresh: fetchInsumos };
}

export interface InsumoUpsert {
  nome: string;
  tipo: 'item' | 'subproduto';
  custo_minuto?: number | null;
  custo_acao?: number | null;
  qntde_minutos?: number | null;
  valor_insumo?: number | null;
  source_file?: string | null;
}

/**
 * Replace all insumos with the provided list (full refresh on each xlsx upload).
 */
export async function syncInsumos(rows: InsumoUpsert[]): Promise<{ ok: boolean; count: number; error?: string }> {
  // Wipe and reinsert keeps the backend table in sync with the latest spreadsheet.
  const { error: delErr } = await supabase.from('precificacao_insumos').delete().not('id', 'is', null);
  if (delErr) return { ok: false, count: 0, error: delErr.message };

  if (rows.length === 0) return { ok: true, count: 0 };

  const { error } = await supabase.from('precificacao_insumos').insert(rows);
  if (error) return { ok: false, count: 0, error: error.message };

  window.dispatchEvent(new Event('insumos-changed'));
  return { ok: true, count: rows.length };
}
