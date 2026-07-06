import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type SupabaseOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const oauth = (supabase.auth as unknown as { oauth: SupabaseOAuth }).oauth;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Requisição inválida: authorization_id ausente.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve full consent URL so the user returns here after signing in.
        // Auth screen renders in-place when there is no session, so URL is preserved automatically.
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        if (active) setError(e?.message ?? "Erro inesperado.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("O servidor de autorização não retornou uma URL de redirecionamento.");
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      setError(e?.message ?? "Erro ao processar autorização.");
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Não foi possível carregar</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando autorização…
        </div>
      </div>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "um aplicativo";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-heading font-bold text-lg">Y</span>
            </div>
            <span className="font-heading font-bold text-2xl text-foreground">Yampa</span>
          </div>
          <CardTitle className="text-xl">Conectar {clientName}</CardTitle>
          <CardDescription>
            Isso permitirá que {clientName} use as ferramentas do Yampa em seu nome, com os mesmos
            dados que você acessa aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button className="w-full" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Aprovar
          </Button>
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => decide(false)}>
            Recusar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
