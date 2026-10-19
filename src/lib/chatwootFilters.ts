/**
 * Regras de filtro da tela de Atendimentos (Chatwoot).
 * Mantidas puras para poderem ser testadas sem renderizar a tela.
 */

/** Chave usada para conversas que não têm caixa de entrada identificada. */
export const EMPTY_INBOX = "__empty__";

/**
 * Filtro de caixas de entrada com multisseleção:
 * - nenhuma caixa selecionada = todas as conversas passam;
 * - várias caixas selecionadas = união (a conversa pertence a uma única caixa);
 * - a opção "(sem caixa)" corresponde às conversas sem caixa identificada.
 */
export function matchesInbox(inboxName: string | null | undefined, selected: ReadonlySet<string>): boolean {
  if (selected.size === 0) return true;
  const key = inboxName && inboxName.trim() ? inboxName : EMPTY_INBOX;
  return selected.has(key);
}
