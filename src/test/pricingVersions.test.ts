import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '@/data/precificacaoData';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from, auth: { getUser: mocks.getUser } } }));
import { recordPricingVersion } from '@/lib/pricingVersions';

describe('shared service pricing persistence', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: 'keila-user' } } }); });

  it('publishes a new service atomically with its complete snapshot and authenticated author', async () => {
    const product = { nome: 'Teste', meses: 12, linha: 'Linha Prata' as const, custo: 0.2, preco_mensal: 544, preco_total: 6528, ideal_mensal: 0.05 };
    const snapshot = { products: [product], config: DEFAULT_CONFIG };
    mocks.rpc.mockResolvedValue({ data: { id: 'saved', snapshot, is_active: true }, error: null });
    const saved = await recordPricingVersion({ source: 'edit', change_type: 'new_service', name: 'Novo serviço: Teste', snapshot, setActive: true });
    expect(saved?.id).toBe('saved');
    expect(mocks.rpc).toHaveBeenCalledWith('publish_service_pricing', { p_version: expect.objectContaining({ snapshot, created_by: 'keila-user', is_active: true, change_type: 'new_service' }) });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not report a refused save as successful or deactivate the catalog separately', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Sem permissão' } });
    const saved = await recordPricingVersion({ source: 'edit', change_type: 'new_service', name: 'Teste', snapshot: { products: [], config: DEFAULT_CONFIG }, setActive: true });
    expect(saved).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not publish without a signed-in author', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await recordPricingVersion({ source: 'edit', change_type: 'new_service', name: 'Teste', snapshot: { products: [], config: DEFAULT_CONFIG }, setActive: true })).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});