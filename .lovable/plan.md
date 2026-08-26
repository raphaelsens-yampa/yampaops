# Funis ActiveCampaign — por que aparecem Keila Suelen (perdidos) e Emanuelle Santos (tarefas)

## O que eu verifiquei nos dados do funil 103 "[Sales] Time Financeiro (Novo)"

**1) Keila Suelen em Perdidos — não é erro de leitura, é 1 negócio real que o ActiveCampaign esconde do quadro.**
Existe exatamente 1 negócio perdido com proprietária Keila no funil 103:

```text
negócio 232115 · contato np_gas@hotmail.com · etapa "Triagem Backlog"
proprietário id 49 (Keila Suelen) · status perdido · fechado em 26/08/2026 18:00
```

Ele foi capturado na sincronização de hoje, ou seja é o estado atual no ActiveCampaign. A diferença é de visualização: no quadro do ActiveCampaign os negócios perdidos não aparecem nas colunas (só os abertos), e o filtro de proprietário só oferece os usuários vinculados ao funil — então esse registro fica invisível por lá. Nosso painel lê o retrato completo, inclusive perdidos, por isso a proprietária aparece na lista.

**2) Emanuelle Santos em Tarefas — a tela está agrupando pelo responsável da tarefa, não pelo dono do negócio.**
São 15 tarefas ("Mandar mensagem para cliente desengajado"), todas com responsável id 69 (Emanuelle), em negócios cujos donos são Leticia Calor e Ferramentas yampa. No ActiveCampaign, quando você filtra o funil por proprietário, ele filtra o **negócio** — e Emanuelle não é dona de nenhum negócio do 103, então ela não aparece. No painel, o agrupamento de tarefas usa o responsável da tarefa e cai para o dono do negócio só quando a tarefa não tem responsável.

Conclusão: não há dado inventado; são duas diferenças de critério (perdidos ocultos no quadro do AC, e tarefa por responsável vs. negócio por proprietário).

## O que eu proponho ajustar

1. **Tarefas — escolher o critério de proprietário.** Adicionar um seletor na visão de Tarefas: "Responsável da tarefa" (comportamento atual) ou "Proprietário do negócio" (igual ao ActiveCampaign), com o segundo como padrão para bater com o que você vê lá. O rótulo da coluna passa a dizer qual critério está ativo.
2. **Filtro de proprietário coerente.** Quando o critério for "Proprietário do negócio", o filtro de proprietário do topo deixa de listar pessoas que só têm tarefas, evitando nomes que não existem no funil do AC.
3. **Perdidos — deixar explícito o que o AC esconde.** No bloco de Perdidos, mostrar a etapa em que o negócio foi perdido e um aviso curto de que o quadro do ActiveCampaign não exibe perdidos, para que a divergência fique auto-explicada. Nenhuma mudança de cálculo.
4. **Sem alteração de sincronização nem de banco.** Os dados estão corretos; o ajuste é de apresentação e de critério de agrupamento.

## Detalhes técnicos

- `src/pages/AcFunnelMetrics.tsx`: hoje a dimensão de tarefas resolve `t.owner_name ?? d.owner_name`; passa a respeitar um estado novo (`taskOwnerBasis: "task" | "deal"`), aplicado tanto no agrupamento quanto no filtro `matchOwner` das tarefas.
- A lista de proprietários (`ownerOptions`) passa a considerar tarefas apenas no modo "Responsável da tarefa".
- Bloco de perdidos: incluir `stageMap[d.ac_stage_id]` na tabela e uma nota de rodapé.
- `supabase/functions/ac-funnel-sync/index.ts` fica intacto.
