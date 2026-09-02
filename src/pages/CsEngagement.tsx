import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Layout } from "@/components/Layout";
import { ExternalLink, RefreshCw } from "lucide-react";

const APP_URL =
  "https://script.google.com/a/macros/yampa.com.br/s/AKfycbzmOvhYEgYPDb2RUMzqyRzSNPPVxEAKHoOimzF6DH6p1qlBkdlxERrDXPwUHjTbqvmRnw/exec";

export default function CsEngagement() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  return (
    <Layout>
      <div className="p-4 md:p-6 flex flex-col h-full gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Engajamento CS</h1>
            <p className="text-sm text-muted-foreground">
              Painel de engajamento de CS incorporado do Google Apps Script.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recarregar
            </Button>
            <Button variant="default" size="sm" asChild>
              <a href={APP_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir em nova aba
              </a>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden flex-1 flex flex-col min-h-0">
          <CardContent className="p-0 flex-1 min-h-0">
            <iframe
              key={key}
              ref={iframeRef}
              src={APP_URL}
              title="Engajamento CS"
              className="w-full h-full border-0 bg-background"
              referrerPolicy="no-referrer-when-downgrade"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
