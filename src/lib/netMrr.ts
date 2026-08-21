/**
 * Net MRR consolidado durante a migração do Yampa 2.0 para o yampaFin.
 *
 * O estoque atual inclui as duas bases, mas a referência anterior permanece
 * no yampaFin. Assim, a redução natural da base legada não é tratada como
 * perda e a inclusão do 2.0 sempre acrescenta seu estoque atual ao indicador.
 */
export function netMrrIncludingYampa20(
  currentYampaFinMrr: number,
  currentYampa20Mrr: number,
  previousYampaFinMrr: number,
): number {
  return currentYampaFinMrr + currentYampa20Mrr - previousYampaFinMrr;
}