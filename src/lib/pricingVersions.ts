import { supabase } from '@/integrations/supabase/client';
import { Produto, AppConfig } from '@/types/precificacao';

export type PricingVersionSource = 'import' | 'edit' | 'revert';
export type PricingVersionChangeType =
  | 'import_xlsx'
  | 'new_service'
  | 'price_update'
  | 'line_update'
  | 'config_update'
  | 'revert';

export interface PricingSnapshot {
  products: Produto[];
  config: AppConfig;
}

export interface PricingVersion {
  id: string;
  name: string;
  description: string | null;
  source: PricingVersionSource | string | null;
  change_type: string | null;
  file_name: string | null;
  is_active: boolean;
  snapshot: PricingSnapshot;
  created_by: string | null;
  created_at: string;
  author_name?: string | null;
}

interface RecordParams {
  source: PricingVersionSource;
  change_type: PricingVersionChangeType;
  name: string;
  description?: string;
  file_name?: string;
  snapshot: PricingSnapshot;
  setActive?: boolean;
}

export async function recordPricingVersion(params: RecordParams): Promise<PricingVersion | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;

  if (params.setActive) {
    await supabase
      .from('pricing_versions')
      .update({ is_active: false })
      .eq('is_active', true);
  }

  const { data, error } = await supabase
    .from('pricing_versions')
    .insert({
      name: params.name,
      description: params.description ?? null,
      source: params.source,
      change_type: params.change_type,
      file_name: params.file_name ?? null,
      snapshot: params.snapshot as unknown as Record<string, unknown>,
      is_active: !!params.setActive,
      status: 'committed',
      created_by: uid,
    })
    .select()
    .single();

  if (error) {
    console.error('recordPricingVersion error', error);
    return null;
  }
  return data as unknown as PricingVersion;
}

export async function listPricingVersions(): Promise<PricingVersion[]> {
  const { data, error } = await supabase
    .from('pricing_versions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('listPricingVersions error', error);
    return [];
  }
  const rows = (data ?? []) as unknown as PricingVersion[];

  const ids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean))) as string[];
  if (ids.length === 0) return rows;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', ids);

  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: { user_id: string; full_name: string | null }) => {
    if (p.user_id) nameMap.set(p.user_id, p.full_name ?? '');
  });

  return rows.map((r) => ({
    ...r,
    author_name: r.created_by ? nameMap.get(r.created_by) ?? null : null,
  }));
}

export async function setActiveVersion(id: string): Promise<boolean> {
  const { error: clearErr } = await supabase
    .from('pricing_versions')
    .update({ is_active: false })
    .eq('is_active', true);
  if (clearErr) {
    console.error(clearErr);
    return false;
  }
  const { error } = await supabase
    .from('pricing_versions')
    .update({ is_active: true })
    .eq('id', id);
  if (error) {
    console.error(error);
    return false;
  }
  return true;
}
