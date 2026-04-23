import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { eachDayOfInterval, format, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Won {
  date: Date;
  mrr: number;
}

interface Props {
  start: Date;
  end: Date;
  target: number;
  won: Won[];
}

export function GoalProgressChart({ start, end, target, won }: Props) {
  const days = eachDayOfInterval({ start, end });
  const today = startOfDay(new Date());
  const totalDays = days.length;

  // accumulated realized per day
  const sortedWon = [...won].sort((a, b) => a.date.getTime() - b.date.getTime());
  let acc = 0;
  const data = days.map((d, i) => {
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    while (sortedWon.length && sortedWon[0].date.getTime() <= dayEnd.getTime()) {
      acc += sortedWon.shift()!.mrr;
    }
    const isFuture = isAfter(d, today);
    const linearTarget = (target / totalDays) * (i + 1);
    return {
      day: format(d, "dd/MM", { locale: ptBR }),
      realizado: isFuture ? null : acc,
      meta: linearTarget,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Realizado vs. Meta (acumulado)</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: any) => v === null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            />
            <Legend />
            <ReferenceLine y={target} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Meta total", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "right" }} />
            <Line type="monotone" dataKey="meta" name="Meta linear" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            <Line type="monotone" dataKey="realizado" name="Realizado" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
