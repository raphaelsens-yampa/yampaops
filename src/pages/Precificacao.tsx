import { BarChart2, FileText, Settings, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePrecificacao } from '@/hooks/usePrecificacao';
import AnalisePrecosTab from '@/components/precificacao/AnalisePrecosTab';
import PropostaTab from '@/components/precificacao/PropostaTab';
import ConfiguracoesTab from '@/components/precificacao/ConfiguracoesTab';
import ImportarTab from '@/components/precificacao/ImportarTab';

export default function Precificacao() {
  const hook = usePrecificacao();

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Precificação</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie preços, margens de contribuição e gere propostas comerciais.
        </p>
      </div>

      <Tabs defaultValue="analise" className="space-y-0">
        <TabsList className="mb-6 h-10">
          <TabsTrigger value="analise" className="gap-2 text-sm">
            <BarChart2 className="h-4 w-4" />
            Análise de Preços
          </TabsTrigger>
          <TabsTrigger value="proposta" className="gap-2 text-sm">
            <FileText className="h-4 w-4" />
            Gerar Proposta
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2 text-sm">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-2 text-sm">
            <Upload className="h-4 w-4" />
            Importar Planilha
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analise">
          <AnalisePrecosTab {...hook} />
        </TabsContent>
        <TabsContent value="proposta">
          <PropostaTab {...hook} />
        </TabsContent>
        <TabsContent value="config">
          <ConfiguracoesTab {...hook} />
        </TabsContent>
        <TabsContent value="importar">
          <ImportarTab {...hook} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
