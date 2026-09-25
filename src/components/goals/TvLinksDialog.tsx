import { useEffect, useState } from "react";
import { Copy, RefreshCw, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Area = "sales" | "cs";
const AREAS: Array<{ area: Area; label: string }> = [
  { area: "sales", label: "Sales" },
  { area: "cs", label: "CS" },
];

function newToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function TvLinksDialog() {
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<Partial<Record<Area, string>>>({});
  const [busy, setBusy] = useState<Area | null>(null);

  useEffect(() => {
    if (!open) return;
    (supabase as any)
      .from("tv_display_links")
      .select("area, token")
      .eq("is_active", true)
      .then(({ data }: { data: Array<{ area: Area; token: string }> | null }) => {
        const next: Partial<Record<Area, string>> = {};
        (data || []).forEach((row) => (next[row.area] = row.token));
        setTokens(next);
      });
  }, [open]);

  const linkFor = (area: Area) => (tokens[area] ? `${window.location.origin}/tv/${area}/${tokens[area]}` : "");

  const generate = async (area: Area) => {
    if (tokens[area] && !window.confirm("Gerar um novo link desativa o atual. A TV precisará abrir o novo endereço. Continuar?")) return;
    setBusy(area);
    const token = newToken();
    const { error } = await (supabase as any)
      .from("tv_display_links")
      .upsert({ area, token, is_active: true }, { onConflict: "area" });
    setBusy(null);
    if (error) return toast.error("Não foi possível gerar o link");
    setTokens((prev) => ({ ...prev, [area]: token }));
    toast.success("Link gerado");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5"><Tv className="h-4 w-4" />Links para TV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Links para TV</DialogTitle>
          <DialogDescription>
            Cada link abre só o placar da equipe, sem login e sem dados de clientes. Quem tiver o link consegue ver o placar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {AREAS.map(({ area, label }) => (
            <div key={area} className="space-y-2">
              <p className="text-sm font-semibold">{label}</p>
              <div className="flex gap-2">
                <Input readOnly value={linkFor(area)} placeholder="Nenhum link gerado" className="text-xs" />
                <Button variant="outline" size="icon" aria-label={`Copiar link ${label}`} disabled={!tokens[area]} onClick={() => { navigator.clipboard.writeText(linkFor(area)); toast.success("Link copiado"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === area} onClick={() => generate(area)}>
                  <RefreshCw className="h-4 w-4" />{tokens[area] ? "Trocar" : "Gerar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
