# Divergência de negócios por etapa (Funis ActiveCampaign)

## O que eu verifiquei agora

Comparando o painel com o print do ActiveCampaign:

| Etapa | Painel (banco) | ActiveCampaign |
|---|---|---|
| Backlog | 66 | 58 |
| Em contato | 37 | 50 |
| Respondido | 9 | 9 |
| Diagnóstico | 8 | 8 |
| Proposta | 1 | 1 |

Fatos confirmados no banco:

- A última sincronização rodou hoje 11:17 (SP) e o negócio mais novo importado é de hoje 08:08 — ou seja, **não é só atraso de horário**: as etapas Backlog e Em contato divergem em direções opostas (+8 e -13), o que atraso não explica.
- A tela não filtra o funil em aberto por período; ela usa direto o snapshot `ac_funnel_deals` (status 0/3). Então a divergência está no snapshot, não no cálculo da tela.
- A sincronização só faz *upsert*: nunca remove nem reclassifica negócios que saíram do funil (excluídos no AC, movidos para outro funil/pipeline). Isso é compatível com Backlog inflado.
- Há sinal de dado inconsistente na carga: 65 dos 66 negócios de Backlog estão gravados com moeda `USD` e o campo `currency` aparece em três variações (`brl`, `BRL`, `USD`), o que sugere que a paginação da API está trazendo/gravando um conjunto diferente do esperado.

Diagnóstico provável (ainda não comprovado): a sincronização perde parte dos negócios na paginação do endpoint `deals` e mantém no snapshot negócios que já não pertencem ao funil. A primeira etapa do plano é comprovar isso comparando negócio a negócio com o AC, e só então corrigir.

## Plano

### 1. Auditoria (comprovar a causa)
Adicionar a ação `audit_stages` na função `ac-funnel-sync`, somente leitura, que:
- Lê todos os negócios do funil na API do AC paginando até o fim (com detecção de página vazia/repetida, não só `meta.total`).
- Compara com `ac_funnel_deals` e devolve: contagem por etapa nos dois lados, negócios existentes no AC e ausentes no banco, negócios no banco e ausentes no AC, e negócios com etapa/status divergentes.
- Nada é gravado nessa ação; o resultado é exibido na aba "Conexão".

### 2. Correção da sincronização
Com o resultado da auditoria:
- Paginação robusta (avançar por páginas até vir vazio; ordenar por `id` em vez de `cdate`, que muda quando o negócio é editado).
- Reconciliação: negócios que não vêm mais na listagem do funil são marcados como fora do funil (removidos do snapshot do grupo), em vez de continuarem contando como abertos.
- Normalizar `currency` para maiúsculas na gravação.

### 3. Frescor e transparência na tela
- Exibir no topo do painel a hora da última sincronização e um botão "Sincronizar agora".
- Reduzir o intervalo do cron do funil de 1 hora para 15 minutos.
- Após a correção, rodar uma sincronização completa do funil 103 e reconferir as contagens contra o AC.

## Detalhes técnicos

- Arquivos: `supabase/functions/ac-funnel-sync/index.ts` (ação `audit_stages`, paginação, reconciliação), `src/pages/AcFunnelMetrics.tsx` (bloco de auditoria + botão sincronizar + selo de última sincronização), migração apenas para ajustar o agendamento do cron.
- Nenhuma alteração de escrita no ActiveCampaign: o fluxo continua somente leitura.
- Os cálculos da tela (KPIs, matriz de transição, rankings) não mudam.
