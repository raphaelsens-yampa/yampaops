import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
}

export function CommissionMonthFilter({ currentMonth, onMonthChange }: Props) {
  const prev = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() - 1);
    onMonthChange(d);
  };
  const next = () => {
    const d = new Date(currentMonth);
    d.setMonth(d.getMonth() + 1);
    onMonthChange(d);
  };

  const longLabel = currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const shortLabel = currentMonth.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={prev} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-center text-sm font-medium capitalize tabular-nums whitespace-nowrap min-w-[88px] sm:min-w-[160px]">
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{longLabel}</span>
      </span>
      <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={next} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
