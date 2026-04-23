import { Layout } from "@/components/Layout";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINK_BUILDER_URL = "https://product-links.lovable.app";

export default function LinkBuilder() {
  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-4rem)] gap-4 p-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-2xl">Gerador de Links de Ofertas YampaFin</h1>
            <p className="text-sm text-muted-foreground">
              Formate links com SCK e UTM para suas ofertas.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={LINK_BUILDER_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir em nova aba
            </a>
          </Button>
        </header>
        <div className="flex-1 rounded-lg border border-border overflow-hidden bg-background">
          <iframe
            src={LINK_BUILDER_URL}
            title="Gerador de Links de Ofertas YampaFin"
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </Layout>
  );
}
