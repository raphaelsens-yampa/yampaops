## Objetivo

Desativar a integração com ActiveCampaign (AC): tirar do menu, bloquear as rotas das páginas dependentes e parar de receber/enviar dados via edge functions — sem deletar código nem dados históricos, para permitir reativação futura se necessário.

## O que será feito

### 1. Sidebar e rotas (ocultar do usuário)
Em `src/components/AppSidebar.tsx`, `src/App.tsx` e `src/components/AccessLevelManager.tsx`:

- Remover do sidebar os itens:
  - **ActiveCampaign** (`/integrations/active-campaign`)
  - **Auditoria de Integrações** (`/integrations/audit` — IntegrationAudit é centrado em AC)
  - **Jornada do Lead** (`/insights/lead-journey` — depende de AC→Chatwoot→Stripe)
- Remover as `<Route>` correspondentes em `App.tsx` (acessos passam a cair em `NotFound`).
- Remover a área `integration_ac` do `AccessLevelManager` (e o label "ActiveCampaign").
- Manter os arquivos `.tsx` em disco (sem deletar) para possível reativação.

### 2. Limpeza pontual em páginas que continuam ativas
Remover apenas as referências a AC, mantendo o restante da página:

- `src/pages/Pipeline.tsx` — remover botão/fluxo "Sincronizar ActiveCampaign" e estados de cancelamento associados.
- `src/pages/SalesCampaignDetail.tsx` — remover botão "Sincronizar com ActiveCampaign" e função `runAcSync`.
- `src/pages/AgentActivity.tsx` — remover card "Cruzar lista do ActiveCampaign com conversas Chatwoot" e chamadas a `ac-list-contacts`.
- `supabase/functions/sales-campaign-match/index.ts` — remover o trecho que dispara `ac-sync-deal-stages` (mantém match por email/telefone).

### 3. Desabilitar edge functions de AC (parar de receber/enviar)
As funções continuam no repositório, mas passam a responder **HTTP 410 Gone** imediatamente, sem executar lógica nem tocar no banco:

- `ac-webhook` — para de aceitar eventos de AC.
- `ac-sync-initial`, `ac-sync-cancel`, `ac-sync-deal-stages` — param de sincronizar.
- `ac-test-connection`, `ac-list-contacts`, `ac-list-pipelines` — desativadas.

Cada `index.ts` vira um stub curto:
```ts
return new Response(
  JSON.stringify({ error: "ActiveCampaign integration archived" }),
  { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### 4. O que NÃO será mexido
- Dados históricos no banco (oportunidades, contatos, `integration_sync_errors`, etc.) — preservados.
- Secrets `AC_API_KEY`, `AC_API_URL`, `AC_WEBHOOK_SECRET` — preservados (caso queira reativar).
- Schema do banco — sem migrações.
- Outras integrações (Chatwoot, Stripe) — intactas.

## Reativação futura
Para religar a integração basta reverter os stubs das edge functions e re-adicionar as rotas/itens no sidebar — todo o código de UI continua presente nos arquivos.

## Arquivos afetados
- `src/App.tsx`
- `src/components/AppSidebar.tsx`
- `src/components/AccessLevelManager.tsx`
- `src/pages/Pipeline.tsx`
- `src/pages/SalesCampaignDetail.tsx`
- `src/pages/AgentActivity.tsx`
- `supabase/functions/sales-campaign-match/index.ts`
- `supabase/functions/ac-webhook/index.ts`
- `supabase/functions/ac-sync-initial/index.ts`
- `supabase/functions/ac-sync-cancel/index.ts`
- `supabase/functions/ac-sync-deal-stages/index.ts`
- `supabase/functions/ac-test-connection/index.ts`
- `supabase/functions/ac-list-contacts/index.ts`
- `supabase/functions/ac-list-pipelines/index.ts`
