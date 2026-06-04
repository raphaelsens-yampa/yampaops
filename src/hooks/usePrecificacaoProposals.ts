import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SavedProposalItem {
  nome: string;
  meses: number;
  linha: string;
  preco_mensal: number;
  preco_total: number;
}

export interface SavedProposalBlock {
  id: string;
  title: string;
  content: string;
}

export interface SavedProposal {
  id: string;
  parent_id: string | null;
  version: number;
  proposal_number: string | null;
  client_name: string;
  client_company: string | null;
  consultant: string | null;
  proposal_date: string | null;
  validity: number;
  discount_pct: number;
  payment: string | null;
  notes: string | null;
  custom_blocks: SavedProposalBlock[];
  items: SavedProposalItem[];
  total_annual: number;
  total_monthly: number;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

export function usePrecificacaoProposals() {
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('precificacao_proposals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar propostas', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as any[];
    const ids = Array.from(new Set(list.map((p) => p.created_by).filter(Boolean)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', ids);
      (profs ?? []).forEach((p: any) => nameMap.set(p.user_id, p.full_name));
    }
    setProposals(
      list.map((p) => ({
        ...p,
        custom_blocks: p.custom_blocks ?? [],
        items: p.items ?? [],
        author_name: p.created_by ? nameMap.get(p.created_by) ?? null : null,
      })) as SavedProposal[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = useCallback(async (payload: Omit<SavedProposal, 'id' | 'created_at' | 'author_name' | 'created_by'>) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      toast({ title: 'Faça login para salvar', variant: 'destructive' });
      return null;
    }
    const { data, error } = await supabase
      .from('precificacao_proposals')
      .insert({ ...payload, created_by: uid } as any)
      .select()
      .single();
    if (error) {
      toast({ title: 'Erro ao salvar proposta', description: error.message, variant: 'destructive' });
      return null;
    }
    const saved = data as unknown as SavedProposal;
    toast({ title: 'Proposta salva', description: `${payload.client_name} · v${payload.version}` });
    await fetchAll();
    return data as SavedProposal;
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('precificacao_proposals').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Proposta excluída' });
    await fetchAll();
    return true;
  }, [fetchAll]);

  return { proposals, loading, fetchAll, save, remove };
}
