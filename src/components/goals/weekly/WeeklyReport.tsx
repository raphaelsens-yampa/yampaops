import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayKeySP } from "@/lib/stripeConversions";
import { ORIGIN_OPTIONS, originLabel, type OriginFilter } from "@/lib/origins";
import { lastClosedWeek, shiftWeek, type WeekRange } from "@/lib/weeklyReport";
import { useWeeklyReport } from "./useWeeklyReport";
import { brl, dBR, exportExcel, exportPdf, reportSections, reportSubtitle, reportTitle } from "./weeklyExport";

export function WeeklyReport() {
  const { canEdit } = useAuth();
  const [week, setWeek] = useState<WeekRange>(() => lastClosedWeek(dayKeySP(new Date())));
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const { data: r, isLoading, error, refetch } = useWeeklyReport(week, origin);
  const [notes, setNotes] = useState({ highlights: "", risks: "", actions: "" });
  const [saving, setSaving] = useState(false);
  const [slidesBusy, setSlidesBusy] = useState(false);
  const editable = canEdit("goals_weekly_report");
  const today = dayKeySP(new Date());

  useEffect(() => { setNotes({ highlights: r?.notes?.highlights || "", risks: r?.notes?.risks || "", actions: r?.notes?.actions || "" }); }, [r?.notes, week.start]);

  const sections = useMemo(() => (r ? reportSections(r, notes) : []), [r, notes]);
  const oLabel = originLabel(origin);

  async function saveNotes() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("weekly_report_notes").upsert({ week_start: week.start, ...notes, updated_by: u.user?.id, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(`Não foi possível salvar: ${error.message}`);
    toast.success("Comentários salvos"); refetch();
  }

  async function toSlides() {
    if (!r) return;
    setSlidesBusy(true);
    const win = window.open("", "_blank");
    const { data, error } = await supabase.functions.invoke("weekly-report-slides", { body: { title: reportTitle(r), subtitle: reportSubtitle(r, oLabel), sections } });
    setSlidesBusy(false);
    if (error || !data?.url) {
      win?.close();
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error?.message || "sem link";
      return toast.error(`Não foi possível gerar a apresentação: ${details}`);
    }
    if (win) win.location.href = data.url; else window.open(data.url, "_blank");
    toast.success("Apresentação criada no Google Apresentações");
  }

  const m = r?.monthly;
  const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-lg border bg-card p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-heading font-bold">{value}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setWeek((w) => shiftWeek(w, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="min-w-[190px] text-center text-sm font-medium">Semana {dBR(week.start)} a {dBR(week.end)}</div>
            <Button variant="outline" size="icon" aria-label="Próxima semana" disabled={shiftWeek(week, 1).start > today} onClick={() => setWeek((w) => shiftWeek(w, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <ToggleGroup type="single" size="sm" value={origin} onValueChange={(v) => v && setOrigin(v as OriginFilter)}>
            {ORIGIN_OPTIONS.map((o) => <ToggleGroupItem key={o.value} value={o.value}>{o.value === "all" ? "Geral" : o.label}</ToggleGroupItem>)}
          </ToggleGroup>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" onClick={toSlides} disabled={!r || slidesBusy}>{slidesBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Presentation className="mr-1 h-4 w-4" />}Gerar no Google Apresentações</Button>
            <Button size="sm" variant="outline" disabled={!r} onClick={() => r && exportPdf(r, notes, oLabel)}><FileText className="mr-1 h-4 w-4" />PDF</Button>
            <Button size="sm" variant="outline" disabled={!r} onClick={() => r && exportExcel(r, notes, oLabel)}><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
          </div>
          {r && <div className="w-full text-xs text-muted-foreground">{reportSubtitle(r, oLabel)}</div>}
        </CardContent>
      </Card>

      {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando report…</div>}
      {error && <div className="text-sm text-destructive">Erro ao carregar: {(error as Error).message}</div>}

      {r && m && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="MRR total" value={brl(m.totalMrr.realized)} sub={`Meta ${brl(m.totalMrr.goal)}`} />
            <Kpi label="New MRR no mês" value={brl(m.newMrr.realized)} sub={`Meta ${brl(m.newMrr.goal)} · tendência ${brl(m.newMrr.trend)}`} />
            <Kpi label="Churn MRR no mês" value={brl(m.churn.realized)} sub={`Teto ${brl(m.churn.goal)} · tendência ${brl(m.churn.trend)}`} />
            <Kpi label="Usuários ativos" value={String(m.ativos.realized)} sub={`Meta ${m.ativos.goal}`} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Dia a dia da semana — New MRR</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={r.weekly.days.map((d) => ({ ...d, label: dBR(d.day).slice(0, 5) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="realized" name="Realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Line dataKey="goal" name="Meta" stroke="hsl(var(--destructive))" strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {sections.filter((s) => s.title !== "Comentários da semana" && s.title !== "Dia a dia da semana").map((s) => (
            <Card key={s.title}>
              <CardHeader><CardTitle className="text-base">{s.title}</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>{s.head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{s.rows.map((row, i) => <TableRow key={i}>{row.map((c, j) => <TableCell key={j} className={j === 0 ? "font-medium" : ""}>{c}</TableCell>)}</TableRow>)}
                    {!s.rows.length && <TableRow><TableCell colSpan={s.head.length} className="text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader><CardTitle className="text-base">Comentários da semana</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(["highlights", "risks", "actions"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <div className="text-sm font-medium">{{ highlights: "Destaques", risks: "Riscos", actions: "Ações" }[k]}</div>
                  <Textarea value={notes[k]} disabled={!editable} onChange={(e) => setNotes((n) => ({ ...n, [k]: e.target.value }))} rows={3} />
                </div>
              ))}
              {editable && <Button size="sm" onClick={saveNotes} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar comentários</Button>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
