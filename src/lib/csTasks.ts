export type TaskStatus = "pendente" | "em_andamento" | "concluida" | "cancelada";
export type TaskPriority = "baixa" | "media" | "alta";
export interface CsTask {
  id: string; client_email: string; client_name: string | null; portfolio_id: string | null;
  title: string; description: string | null; task_type: string; priority: TaskPriority; status: TaskStatus;
  due_at: string; completed_at: string | null; assigned_to: string; created_by: string; created_at: string;
}
export const TASK_TYPES = [
  { key: "ligacao", label: "Ligação" }, { key: "whatsapp", label: "WhatsApp" }, { key: "email", label: "E-mail" },
  { key: "reuniao", label: "Reunião" }, { key: "follow_up", label: "Follow-up" }, { key: "outro", label: "Outro" },
];
export const STATUS_LABEL: Record<TaskStatus, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
export type Bucket = "atrasada" | "hoje" | "semana" | "futura" | "fechada";

/** YYYY-MM-DD in São Paulo. */
export function spDay(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(d));
}
function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const isOpen = (t: Pick<CsTask, "status">) => t.status === "pendente" || t.status === "em_andamento";

export function taskBucket(t: Pick<CsTask, "status" | "due_at">, now: Date = new Date()): Bucket {
  if (!isOpen(t)) return "fechada";
  if (new Date(t.due_at) < now) return "atrasada";
  const today = spDay(now), due = spDay(t.due_at);
  if (due === today) return "hoje";
  if (due <= addDays(today, 7)) return "semana";
  return "futura";
}
export function taskCounters(tasks: CsTask[], now: Date = new Date()) {
  const month = spDay(now).slice(0, 7);
  let atrasadas = 0, hoje = 0, semana = 0, concluidasMes = 0;
  for (const t of tasks) {
    const b = taskBucket(t, now);
    if (b === "atrasada") atrasadas++;
    else if (b === "hoje") hoje++;
    if (b === "hoje" || b === "semana") semana++;
    if (t.status === "concluida" && t.completed_at && spDay(t.completed_at).slice(0, 7) === month) concluidasMes++;
  }
  return { atrasadas, hoje, semana, concluidasMes };
}
export type PeriodFilter = "todas" | "atrasadas" | "hoje" | "semana";
export interface TaskFilters { mine: boolean; status: TaskStatus | "abertas" | "todas"; period: PeriodFilter; priority: TaskPriority | "todas"; search: string }
export function filterTasks(tasks: CsTask[], f: TaskFilters, userId: string | undefined, now: Date = new Date()) {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.mine && t.assigned_to !== userId) return false;
    if (f.status === "abertas" ? !isOpen(t) : f.status !== "todas" && t.status !== f.status) return false;
    if (f.priority !== "todas" && t.priority !== f.priority) return false;
    const b = taskBucket(t, now);
    if (f.period === "atrasadas" && b !== "atrasada") return false;
    if (f.period === "hoje" && b !== "hoje") return false;
    if (f.period === "semana" && b !== "hoje" && b !== "semana") return false;
    if (q && !`${t.title} ${t.client_email} ${t.client_name || ""}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => a.due_at.localeCompare(b.due_at));
}
