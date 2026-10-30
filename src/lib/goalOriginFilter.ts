/**
 * Filtro de origem na lista de metas cadastradas.
 *
 * Diferente do filtro de acompanhamento (`OriginFilter`), aqui o usuário
 * precisa separar as metas gerais (sem origem) das metas de uma origem
 * específica, então "all" significa "todas as origens" e não "visão geral".
 */
import { matchesOrigin, type OriginFilter } from "./origins";

export type GoalOriginFilter = "all" | "general" | "4blue" | "yampa";

export const GOAL_ORIGIN_FILTER_OPTIONS: { value: GoalOriginFilter; label: string }[] = [
  { value: "all", label: "Todas as origens" },
  { value: "general", label: "Geral (sem origem)" },
  { value: "yampa", label: "Yampa" },
  { value: "4blue", label: "4blue" },
];

export function goalOriginFilterLabel(filter: GoalOriginFilter): string {
  return GOAL_ORIGIN_FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "Todas as origens";
}

/**
 * `origem_cliente` nulo/vazio = meta geral. Os valores da base chegam como
 * "yampa" / "4Blue", então a comparação de origem reusa `matchesOrigin`.
 */
export function matchesGoalOrigin(
  goal: { origem_cliente?: string | null },
  filter: GoalOriginFilter,
): boolean {
  const value = String(goal.origem_cliente ?? "").trim();
  if (filter === "all") return true;
  if (filter === "general") return value === "";
  return matchesOrigin(value, filter as OriginFilter);
}
