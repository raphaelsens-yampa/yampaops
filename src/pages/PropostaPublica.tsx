import { usePrecificacao } from "@/hooks/usePrecificacao";
import PropostaTab from "@/components/precificacao/PropostaTab";

export default function PropostaPublica() {
  const hook = usePrecificacao();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b no-print">
        <div className="max-w-screen-xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-heading font-bold text-sm">Y</span>
          </div>
          <div>
            <h1 className="font-heading font-bold text-lg leading-tight">Gerador de Propostas Yampa</h1>
            <p className="text-xs text-gray-500">Monte, visualize e imprima propostas comerciais.</p>
          </div>
        </div>
      </header>
      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <PropostaTab {...hook} />
      </main>
    </div>
  );
}
