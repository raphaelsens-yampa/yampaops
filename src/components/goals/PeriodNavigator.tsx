import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format, addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export type Granularity = "day" | "week" | "month";

interface Props {
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  anchorDate: Date;
  onAnchorChange: (d: Date) => void;
}

export function PeriodNavigator({ granularity, onGranularityChange, anchorDate, onAnchorChange }: Props) {
  const shift = (dir: 1 | -1) => {
    if (granularity === "day") onAnchorChange(addDays(anchorDate, dir));
    else if (granularity === "week") onAnchorChange(addWeeks(anchorDate, dir));
    else onAnchorChange(addMonths(anchorDate, dir));
  };

  const label = (() => {
    if (granularity === "day") return format(anchorDate, "dd 'de' MMMM yyyy", { locale: ptBR });
    if (granularity === "week") {
      const s = startOfWeek(anchorDate, { weekStartsOn: 1 });
      const e = endOfWeek(anchorDate, { weekStartsOn: 1 });
      return `${format(s, "dd MMM", { locale: ptBR })} → ${format(e, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return format(anchorDate, "MMMM 'de' yyyy", { locale: ptBR });
  })();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <Tabs value={granularity} onValueChange={(v) => onGranularityChange(v as Granularity)}>
        <TabsList>
          <TabsTrigger value="day">Diário</TabsTrigger>
          <TabsTrigger value="week">Semanal</TabsTrigger>
          <TabsTrigger value="month">Mensal</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card text-sm font-medium min-w-[200px] justify-center">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="capitalize">{label}</span>
        </div>
        <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => onAnchorChange(new Date())} disabled={isSameDay(anchorDate, new Date()) && granularity === "day"}>
          Hoje
        </Button>
      </div>
    </div>
  );
}

export function getPeriodRange(granularity: Granularity, anchor: Date): { start: Date; end: Date } {
  if (granularity === "day") {
    const start = new Date(anchor); start.setHours(0, 0, 0, 0);
    const end = new Date(anchor); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (granularity === "week") {
    return { start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) };
  }
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}
