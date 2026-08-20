import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão padrão de recolher/expandir usado nos painéis e tabelas do módulo tático. */
export function CollapseToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      aria-label={open ? "Recolher seção" : "Expandir seção"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
    </Button>
  );
}
