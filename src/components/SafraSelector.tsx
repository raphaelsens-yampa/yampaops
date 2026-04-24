import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: Date; // first day of month
  onChange: (d: Date) => void;
}

export function SafraSelector({ value, onChange }: Props) {
  const label = value.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const shift = (months: number) => {
    const d = new Date(value);
    d.setMonth(d.getMonth() + months);
    onChange(d);
  };
  return (
    <div className="flex items-center gap-1 border rounded-md px-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(-1)} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm capitalize px-2 min-w-[140px] text-center">{label}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shift(1)} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
