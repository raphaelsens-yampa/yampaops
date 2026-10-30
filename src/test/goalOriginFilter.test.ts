import { describe, expect, it } from "vitest";
import {
  GOAL_ORIGIN_FILTER_OPTIONS,
  goalOriginFilterLabel,
  matchesGoalOrigin,
} from "@/lib/goalOriginFilter";

const general = { origem_cliente: null };
const yampa = { origem_cliente: "yampa" };
const fourBlue = { origem_cliente: "4Blue" };

describe("filtro de origem no cadastro de metas", () => {
  it("mostra todas as metas quando o filtro está em todas as origens", () => {
    expect(matchesGoalOrigin(general, "all")).toBe(true);
    expect(matchesGoalOrigin(yampa, "all")).toBe(true);
    expect(matchesGoalOrigin(fourBlue, "all")).toBe(true);
  });

  it("separa a meta geral (sem origem) das metas por origem", () => {
    expect(matchesGoalOrigin(general, "general")).toBe(true);
    expect(matchesGoalOrigin({ origem_cliente: "  " }, "general")).toBe(true);
    expect(matchesGoalOrigin(yampa, "general")).toBe(false);
    expect(matchesGoalOrigin(fourBlue, "general")).toBe(false);
  });

  it("filtra Yampa e 4blue ignorando maiúsculas e espaços da base", () => {
    expect(matchesGoalOrigin(yampa, "yampa")).toBe(true);
    expect(matchesGoalOrigin({ origem_cliente: " Yampa " }, "yampa")).toBe(true);
    expect(matchesGoalOrigin(yampa, "4blue")).toBe(false);
    expect(matchesGoalOrigin(fourBlue, "4blue")).toBe(true);
    expect(matchesGoalOrigin(fourBlue, "yampa")).toBe(false);
    expect(matchesGoalOrigin(general, "yampa")).toBe(false);
    expect(matchesGoalOrigin(general, "4blue")).toBe(false);
  });

  it("tem uma opção por filtro, com rótulos legíveis", () => {
    expect(GOAL_ORIGIN_FILTER_OPTIONS.map((o) => o.value)).toEqual(["all", "general", "yampa", "4blue"]);
    expect(goalOriginFilterLabel("all")).toBe("Todas as origens");
    expect(goalOriginFilterLabel("general")).toBe("Geral (sem origem)");
    expect(goalOriginFilterLabel("4blue")).toBe("4blue");
  });
});
