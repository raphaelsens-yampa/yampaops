import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface TemplateBlock {
  id: string;
  title: string;
  content: string;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  custom_blocks: TemplateBlock[];
  parent_id: string | null;
  version: number;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
}

export interface TemplatePayload {
  name: string;
  description?: string | null;
  logo: string | null;
  custom_blocks: TemplateBlock[];
}

export function useProposalTemplates() {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('proposal_templates' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar templates', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as any[];
    const ids = Array.from(new Set(list.map((t) => t.created_by).filter(Boolean)));
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', ids);
      (profs ?? []).forEach((p: any) => nameMap.set(p.user_id, p.full_name));
    }
    setTemplates(
      list.map((t) => ({
        ...t,
        custom_blocks: t.custom_blocks ?? [],
        author_name: t.created_by ? nameMap.get(t.created_by) ?? null : null,
      })) as ProposalTemplate[],
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const create = useCallback(async (payload: TemplatePayload, parent?: ProposalTemplate | null) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { toast({ title: 'Faça login', variant: 'destructive' }); return null; }
    const insertPayload: any = {
      ...payload,
      parent_id: parent?.id ?? null,
      version: parent ? parent.version + 1 : 1,
      created_by: uid,
    };
    const { data, error } = await (supabase.from('proposal_templates' as any) as any)
      .insert(insertPayload)
      .select()
      .single();
    if (error) {
      toast({ title: 'Erro ao salvar template', description: error.message, variant: 'destructive' });
      return null;
    }
    toast({ title: parent ? 'Nova versão salva' : 'Template salvo', description: `${payload.name} · v${insertPayload.version}` });
    await fetchAll();
    return data as ProposalTemplate;
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('proposal_templates' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Template excluído' });
    await fetchAll();
    return true;
  }, [fetchAll]);

  return { templates, loading, fetchAll, create, remove };
}
