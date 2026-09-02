import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Layout } from "@/components/Layout";
import { ExternalLink, RefreshCw, Info } from "lucide-react";

const APP_URL =
  "https://script.google.com/a/macros/yampa.com.br/s/AKfycbzmOvhYEgYPDb2RUMzqyRzSNPPVxEAKHoOimzF6DH6p1qlBkdlxERrDXPwUHjTbqvmRnw/exec";

export default function CsEngagement() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  return (
    <div className="p-4 md:p-6 space-y-4">
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

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Requer conta Google @yampa.com.br</AlertTitle>
        <AlertDescription>
          Se o painel abaixo aparecer em branco ou pedir login, faça login com sua conta Google
          corporativa neste navegador ou use "Abrir em nova aba".
        </AlertDescription>
      </Alert>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <iframe
            key={key}
            ref={iframeRef}
            src={APP_URL}
            title="Engajamento CS"
            className="w-full border-0 bg-background"
            style={{ height: "calc(100vh - 260px)", minHeight: 520 }}
            referrerPolicy="no-referrer-when-downgrade"
allow="clipboard-read; clipboard-write; fullscreen"
          />
        </CardContent>
      </Card>
    </div>
  );
}
