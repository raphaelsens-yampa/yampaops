import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';
import { PrecificacaoHook } from '@/hooks/usePrecificacao';
import { Produto, LinhaMarkup } from '@/types/precificacao';
import { recordPricingVersion } from '@/lib/pricingVersions';
import VersionHistory from './VersionHistory';
import * as XLSX from 'xlsx';

type UploadStatus = 'idle' | 'processing' | 'success' | 'error';

export default function ImportarTab(hook: PrecificacaoHook) {
  const { setProducts, config } = hook;
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState('');
  const [count, setCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setStatus('processing');
    setMessage(`Processando ${file.name}...`);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });

        const sheetName = wb.SheetNames.find(
          (n) => n.includes('Análise') || n.includes('Analise') || n.includes('Preços')
        );
        if (!sheetName) throw new Error('Aba "Análise de Preços" não encontrada na planilha.');

        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' });

        // Find header row
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, data.length); i++) {
          if (data[i].some((c) => String(c).includes('STATUS') || String(c).includes('Nome do Produto'))) {
            headerRow = i;
            break;
          }
        }
        if (headerRow < 0) throw new Error('Cabeçalho não encontrado. Verifique a estrutura da planilha.');

        const headers = data[headerRow].map((h) => String(h).trim());
        const col = (name: string) => headers.findIndex((h) => h.includes(name));

        const colNome     = col('Nome do Produto');
        const colMeses    = col('Meses');
        const colLinha    = col('Tipo Mkp');
        const colCusto    = col('Custo das horas');
        const colPMensal  = col('praticado mensalizado');
        const colPTotal   = col('Praticado Total');
        const colIdeal    = col('Sugerido) Mensalizado');

        if (colNome < 0) throw new Error('Coluna "Nome do Produto" não encontrada.');

        const parseNum = (v: string | number) => {
          const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
          return isNaN(n) ? 0 : n;
        };

        const newProducts: Produto[] = [];
        for (let i = headerRow + 1; i < data.length; i++) {
          const row = data[i];
          const nome = String(row[colNome] || '').trim();
          if (!nome || nome === 'FIM' || nome === '') continue;

          const linhaRaw = colLinha >= 0 ? String(row[colLinha] || '') : 'Linha Gold';
          const linha: LinhaMarkup =
            linhaRaw.includes('Premium') ? 'Linha Premium' :
            linhaRaw.includes('Prata')   ? 'Linha Prata'   : 'Linha Gold';

          newProducts.push({
            nome,
            meses:        colMeses  >= 0 ? Math.max(1, parseInt(String(row[colMeses])) || 12) : 12,
            linha,
            custo:        colCusto  >= 0 ? parseNum(row[colCusto])  : 0,
            preco_mensal: colPMensal >= 0 ? parseNum(row[colPMensal]) : 0,
            preco_total:  colPTotal  >= 0 ? parseNum(row[colPTotal])  : 0,
            ideal_mensal: colIdeal   >= 0 ? parseNum(row[colIdeal])   : 0,
          });
        }

        if (newProducts.length === 0) throw new Error('Nenhum produto encontrado na planilha.');

        setProducts(newProducts);
        setCount(newProducts.length);
        setStatus('success');
        setMessage(`${newProducts.length} produtos importados da aba "${sheetName}".`);

        recordPricingVersion({
          source: 'import',
          change_type: 'import_xlsx',
          name: `Importação: ${file.name}`,
          description: `${newProducts.length} produtos importados da aba "${sheetName}".`,
          file_name: file.name,
          snapshot: { products: newProducts, config },
          setActive: true,
        }).then(() => window.dispatchEvent(new Event('pricing-version-changed')));
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Erro ao processar o arquivo.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.xlsx')) processFile(file);
    else { setStatus('error'); setMessage('Por favor, selecione um arquivo .xlsx'); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-600" />
            Upload da Planilha
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Carregue uma nova versão do arquivo Excel para atualizar todos os produtos e preços.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">
              <span className="text-blue-600">Clique para selecionar</span> ou arraste o arquivo aqui
            </p>
            <p className="text-xs text-gray-400 mt-1">Aceita arquivos .xlsx</p>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleChange} />

          {/* Status */}
          {status === 'processing' && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              {message}
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg text-sm text-green-700">
              <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Importação concluída!</p>
                <p>{message}</p>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-green-700 underline mt-1"
                  onClick={() => setStatus('idle')}
                >
                  Importar outro arquivo
                </Button>
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700">
              <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Erro na importação</p>
                <p>{message}</p>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">📋 Requisitos da planilha:</p>
            <ul className="space-y-0.5 text-blue-700">
              <li>• Aba chamada <strong>Análise de Preços</strong></li>
              <li>• Colunas: <strong>Nome do Produto, Meses de Contrato, Tipo Mkp, Custo das horas, Preço praticado mensalizado, Preço Praticado Total, Preço Ideal (Sugerido) Mensalizado</strong></li>
              <li>• Linha marcadora <strong>FIM</strong> no final dos dados</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* History placeholder */}
      {count > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500">Última importação: <strong className="text-gray-800">{count} produtos</strong> carregados com sucesso.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
