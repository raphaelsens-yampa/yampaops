import { describe, expect, it } from "vitest";
import { EMPTY_INBOX, matchesInbox } from "@/lib/chatwootFilters";

describe("filtro de caixas de entrada (multisseleção)", () => {
  it("sem nenhuma caixa selecionada, todas as conversas passam", () => {
    expect(matchesInbox("Suporte - Chat", new Set())).toBe(true);
    expect(matchesInbox(null, new Set())).toBe(true);
  });

  it("uma caixa selecionada mantém só as conversas dela", () => {
    const sel = new Set(["Suporte - Chat"]);
    expect(matchesInbox("Suporte - Chat", sel)).toBe(true);
    expect(matchesInbox("Suporte Whatsapp", sel)).toBe(false);
    expect(matchesInbox(null, sel)).toBe(false);
  });

  it("duas caixas selecionadas somam as duas (união, sem repetição)", () => {
    const sel = new Set(["Suporte - Chat", "Suporte Whatsapp"]);
    expect(matchesInbox("Suporte - Chat", sel)).toBe(true);
    expect(matchesInbox("Suporte Whatsapp", sel)).toBe(true);
    expect(matchesInbox("cs@yampa", sel)).toBe(false);
  });

  it("a opção sem caixa pega só conversas sem caixa identificada", () => {
    const sel = new Set([EMPTY_INBOX]);
    expect(matchesInbox(null, sel)).toBe(true);
    expect(matchesInbox("", sel)).toBe(true);
    expect(matchesInbox("   ", sel)).toBe(true);
    expect(matchesInbox("Suporte - Chat", sel)).toBe(false);
  });
});
