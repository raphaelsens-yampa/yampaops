import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function AccessDenied() {
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="font-heading font-bold text-xl">Acesso restrito</h2>
            <p className="text-muted-foreground text-sm">
              Você não possui nível de acesso para esta funcionalidade.
            </p>
            <p className="text-xs text-muted-foreground">
              Solicite ao administrador a liberação no seu Nível de Acesso.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

interface RequireAreaProps {
  area: import("@/hooks/useAuth").CrmAreaKey;
  children: React.ReactNode;
}

export function RequireArea({ area, children }: RequireAreaProps) {
  const { role, canView, loading } = require("@/hooks/useAuth").useAuth();
  if (loading) return null;
  if (role === "admin") return <>{children}</>;
  if (!canView(area)) return <AccessDenied />;
  return <>{children}</>;
}
