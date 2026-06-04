import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, RotateCcw, FileSpreadsheet, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  listPricingVersions, setActiveVersion, recordPricingVersion,
  PricingVersion,
} from '@/lib/pricingVersions';
import { PrecificacaoHook } from '@/hooks/usePrecificacao';
import { useAuth } from '@/hooks/useAuth';

const CHANGE_TYPE_LABEL: Record<string, string> = {
  import_xlsx: 'Importação de planilha',
  new_service: 'Novo serviço',
  price_update: 'Atualização de preços',
  line_update: 'Alteração de linha',
  config_update: 'Configurações',
  revert: 'Reversão de versão',
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  import: { label: 'Importação', cls: 'bg-green-50 text-green-700 border-green-200' },
  edit:   { label: 'Edição',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  revert: { label: 'Reversão',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export default function VersionHistory({ setProducts, updateConfig }: PrecificacaoHook) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [versions, setVersions] = useState<PricingVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<PricingVersion | null>(null);
  const [reverting, setReverting] = useState(false);

  const reload = async () => {
    setLoading(true);
    const list = await listPricingVersions();
    setVersions(list);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  // Allow external triggers to refresh after a new version is recorded
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('pricing-version-changed', handler);
    return () => window.removeEventListener('pricing-version-changed', handler);
  }, []);

  const current = versions.find((v) => v.is_active) ?? null;

  const doRevert = async () => {
    if (!confirmTarget) return;
    setReverting(true);
    try {
      const snap = confirmTarget.snapshot;
      if (!snap?.products || !snap?.config) {
        toast({ title: 'Snapshot inválido', variant: 'destructive' });
        return;
      }

      // 1. Aplica snapshot localmente
      setProducts(snap.products);
      updateConfig(snap.config);

      // 2. Marca a versão alvo como ativa
      const ok = await setActiveVersion(confirmTarget.id);
      if (!ok) {
        toast({ title: 'Falha ao marcar versão ativa', variant: 'destructive' });
        return;
      }

      // 3. Registra uma versão de "revert" para auditoria
      await recordPricingVersion({
        source: 'revert',
        change_type: 'revert',
        name: `Reversão para: ${confirmTarget.name}`,
        description: `Sistema revertido para versão de ${format(new Date(confirmTarget.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        snapshot: snap,
        setActive: false,
      });

      toast({ title: 'Versão revertida com sucesso', description: confirmTarget.name });
      setConfirmTarget(null);
      await reload();
    } finally {
      setReverting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Versão atual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Versão Atual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-gray-400">Carregando...</p>
          ) : current ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">{current.name}</p>
                {current.source && SOURCE_BADGE[current.source] && (
                  <Badge variant="outline" className={`text-xs ${SOURCE_BADGE[current.source].cls}`}>
                    {SOURCE_BADGE[current.source].label}
                  </Badge>
                )}
              </div>
              {current.file_name && (
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> {current.file_name}
                </p>
              )}
              <div className="text-xs text-gray-500 grid grid-cols-2 gap-2 max-w-md">
                <span>Importado em: <strong className="text-gray-700">{format(new Date(current.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</strong></span>
                <span>Por: <strong className="text-gray-700">{current.author_name || '—'}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Nenhuma versão ativa registrada. A primeira importação ou edição criará uma versão.</p>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <History className="h-4 w-4 text-gray-500" />
            Histórico de Versões
            <span className="text-xs font-normal text-gray-400">({versions.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-xs text-gray-400 px-6 pb-4">Carregando...</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-gray-500 px-6 pb-4">Nenhuma versão registrada ainda.</p>
          ) : (
            <div className="divide-y">
              {versions.map((v) => (
                <div key={v.id} className="px-6 py-3 flex items-start justify-between gap-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {v.source === 'import' ? (
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                      ) : v.source === 'revert' ? (
                        <RotateCcw className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium text-gray-800 truncate">{v.name}</p>
                      {v.is_active && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                          Ativa
                        </Badge>
                      )}
                      {v.change_type && CHANGE_TYPE_LABEL[v.change_type] && (
                        <Badge variant="secondary" className="text-xs">
                          {CHANGE_TYPE_LABEL[v.change_type]}
                        </Badge>
                      )}
                    </div>
                    {v.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.description}</p>
                    )}
                    {v.file_name && (
                      <p className="text-xs text-gray-400 mt-0.5">📄 {v.file_name}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(v.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {v.author_name && <> · por <strong className="text-gray-600">{v.author_name}</strong></>}
                    </p>
                  </div>
                  {!v.is_active && isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => setConfirmTarget(v)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverter
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!isAdmin && (
            <p className="text-xs text-gray-400 px-6 pb-4 pt-2 italic">
              Apenas administradores podem reverter para versões antigas.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Reverter para versão antiga?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta ação irá <strong>substituir toda a Tabela de Serviços e as Configurações atuais</strong> pelos
                  valores da versão selecionada.
                </p>
                {confirmTarget && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                    <p><strong>Versão:</strong> {confirmTarget.name}</p>
                    <p><strong>Data:</strong> {format(new Date(confirmTarget.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                    <p><strong>Autor:</strong> {confirmTarget.author_name || '—'}</p>
                  </div>
                )}
                <p className="text-xs text-gray-600">
                  Uma nova entrada de auditoria será criada registrando a reversão. As versões anteriores permanecem no histórico.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doRevert} disabled={reverting} className="bg-amber-600 hover:bg-amber-700">
              {reverting ? 'Revertendo...' : 'Confirmar reversão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
