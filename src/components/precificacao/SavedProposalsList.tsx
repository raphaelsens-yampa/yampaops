import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, GitBranch, FileText } from 'lucide-react';
import { SavedProposal } from '@/hooks/usePrecificacaoProposals';
import { useAuth } from '@/hooks/useAuth';

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  proposals: SavedProposal[];
  loading: boolean;
  onNewVersion: (p: SavedProposal) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export default function SavedProposalsList({ proposals, loading, onNewVersion, onDelete }: Props) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [viewing, setViewing] = useState<SavedProposal | null>(null);
  const [deleting, setDeleting] = useState<SavedProposal | null>(null);

  return (
    <>
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> Propostas Salvas
            </CardTitle>
            <Badge variant="secondary">{proposals.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-6">Carregando...</p>
          ) : proposals.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Nenhuma proposta salva ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Criado por</TableHead>
                  <TableHead className="text-xs">Versão</TableHead>
                  <TableHead className="text-xs">Serviços</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setViewing(p)}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('pt-BR')}
                      <div className="text-gray-400">{new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{p.client_name}</div>
                      {p.client_company && <div className="text-gray-500">{p.client_company}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{p.author_name ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">v{p.version}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px]">
                      <div className="truncate text-gray-600">
                        {p.items.length === 0 ? '—' : p.items.map((i) => i.nome).join(', ')}
                      </div>
                      <div className="text-gray-400">{p.items.length} item{p.items.length !== 1 ? 's' : ''}</div>
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold whitespace-nowrap">
                      {fmtBRL(p.total_annual)}
                    </TableCell>
                    <TableCell className="text-xs text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(p)} title="Visualizar">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onNewVersion(p)} title="Criar nova versão">
                          <GitBranch className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} className="text-red-600 hover:text-red-700 hover:bg-red-50" title="Excluir (admin)">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View dialog (read-only) */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proposta · {viewing?.client_name} <Badge variant="outline" className="ml-2">v{viewing?.version}</Badge></DialogTitle>
            <DialogDescription>
              Criada em {viewing && new Date(viewing.created_at).toLocaleString('pt-BR')} por {viewing?.author_name ?? '—'} · Somente leitura
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-400">Empresa:</span> {viewing.client_company || '—'}</div>
                <div><span className="text-gray-400">Consultor:</span> {viewing.consultant || '—'}</div>
                <div><span className="text-gray-400">Data:</span> {viewing.proposal_date || '—'}</div>
                <div><span className="text-gray-400">Validade:</span> {viewing.validity} dias</div>
                <div><span className="text-gray-400">Pagamento:</span> {viewing.payment || '—'}</div>
                <div><span className="text-gray-400">Desconto:</span> {viewing.discount_pct}%</div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Serviços</p>
                <table className="w-full text-xs border rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">Serviço</th>
                      <th className="text-center p-2">Período</th>
                      <th className="text-right p-2">Mensal</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.items.map((i, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{i.nome}</td>
                        <td className="p-2 text-center">{i.meses}x</td>
                        <td className="p-2 text-right">{fmtBRL(i.preco_mensal)}</td>
                        <td className="p-2 text-right font-semibold">{fmtBRL(i.preco_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-gray-900 text-white rounded p-3 flex justify-between items-center">
                <span className="text-xs uppercase tracking-wider text-gray-300">Total Anual</span>
                <span className="font-bold text-lg">{fmtBRL(viewing.total_annual)}</span>
              </div>

              {viewing.notes && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Observações</p>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{viewing.notes}</p>
                </div>
              )}

              {viewing.custom_blocks?.length > 0 && viewing.custom_blocks.map((b) => (
                <div key={b.id}>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-1">{b.title}</p>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{b.content}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Fechar</Button>
            <Button onClick={() => { if (viewing) { onNewVersion(viewing); setViewing(null); } }}>
              <GitBranch className="h-3.5 w-3.5 mr-1.5" /> Criar nova versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (admin only) */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá a proposta de <strong>{deleting?.client_name}</strong> (v{deleting?.version}).
              A exclusão é registrada no log de auditoria com seu usuário e o conteúdo completo da proposta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (deleting) await onDelete(deleting.id);
                setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
