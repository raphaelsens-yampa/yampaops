# Melhorias na Integração Stripe

A tela atual (`/integrations/stripe`) já mostra contadores básicos (pendentes, não casados, conciliados, total) e um botão de "Testar conexão". Falta visibilidade sobre **saúde da integração ao longo do tempo** e **frescor dos dados**, que é justamente o que você pediu.

## O que dá para melhorar

### 1. Painel "Saúde da integração" (no topo)
Um card único com semáforo verde/amarelo/vermelho consolidando:
- Conexão com a API Stripe (chave válida)
- Webhook secret configurado
- Último evento recebido há menos de X horas
- Modo (LIVE / TESTE) com destaque

Abrir a tela já dispara o teste de conexão automaticamente (hoje só roda quando clica no botão).

### 2. Indicadores de "última atualização"
Cards/linhas mostrando **quando** as coisas aconteceram pela última vez:
- **Último evento Stripe recebido** — `max(processed_at)` em `stripe_events` + tempo relativo ("há 12 min")
- **Última conversão registrada** — `max(converted_at)` em `stripe_conversions`
- **Último sync manual** — `last_full_sync_at` em `integration_settings`
- **Última pendência aprovada** — última oportunidade que saiu de `pendencias_stripe`

Cada um com badge verde se recente, amarelo se antigo, vermelho se nunca.

### 3. Atividade recente (últimos 7 dias)
- Mini gráfico de barras: eventos recebidos por dia
- Breakdown por tipo: `checkout.session.completed`, `customer.subscription.created`, `invoice.paid`, com contagem
- Taxa de match (% de eventos que casaram com deal vs sem match)

### 4. Últimos 10 eventos (tabela)
Lista cronológica dos últimos eventos brutos, com:
- Data/hora
- Tipo de evento
- Email do cliente
- Resultado (matched / matched_pending / no_match / error)
- Link para abrir no Stripe Dashboard

Hoje esses dados existem em `stripe_events` mas não são exibidos.

### 5. Erros não resolvidos
Painel destacado dos `integration_sync_errors` com `entity_type='stripe_no_match'` e `resolved=false`, mostrando email + data, com botão para marcar como resolvido ou criar contato manualmente.

### 6. Ação "Sincronizar agora"
Botão que invoca a edge function `stripe-sync-recent` (já existe) para puxar eventos recentes manualmente, útil quando o webhook ficou fora do ar. Mostra toast com quantos eventos foram trazidos.

### 7. Histórico de webhook
Pequena seção mostrando se houve eventos com erro de assinatura nas últimas 24h (sinal de que o `STRIPE_WEBHOOK_SECRET` está errado).

## Layout proposto

```text
┌──────────────────────────────────────────────────────────┐
│ Integração Stripe                  [Sincronizar][Testar] │
├──────────────────────────────────────────────────────────┤
│ ● Saúde: OK    Modo LIVE    Último evento há 12 min      │
├──────────────────────────────────────────────────────────┤
│ [Pendentes] [Não casados] [Conciliados] [Total eventos]  │
├──────────────────────────────────────────────────────────┤
│ Última atualização                                       │
│  • Último evento recebido:   há 12 min                   │
│  • Última conversão:         há 2 h                      │
│  • Último sync manual:       ontem 18:30                 │
├──────────────────────────────────────────────────────────┤
│ Atividade últimos 7 dias  [gráfico de barras]            │
│  checkout.session.completed: 42                          │
│  customer.subscription.created: 38                       │
│  invoice.paid: 120                                       │
├──────────────────────────────────────────────────────────┤
│ Últimos 10 eventos [tabela]                              │
├──────────────────────────────────────────────────────────┤
│ Erros não resolvidos (3) [lista expansível]              │
├──────────────────────────────────────────────────────────┤
│ Configuração do webhook (URL + eventos)                  │
└──────────────────────────────────────────────────────────┘
```

## Detalhes técnicos

- Tudo client-side, sem alteração de schema nem de edge functions
- Queries adicionais em `stripe_events`, `stripe_conversions`, `integration_sync_errors`, `opportunities` e `integration_settings`
- `stripe-test-connection` chamada automaticamente no mount (já lida com erro 401 graciosamente)
- Função utilitária `formatRelativeTime(date)` para "há X min/horas/dias"
- Helper `getHealthStatus()` que combina os 4 sinais e retorna `'ok' | 'warning' | 'error'`
- Reutiliza componentes existentes (`Card`, `Badge`, `Button`) — sem novas libs

## Fora do escopo (sugestões para depois)

- Reprocessar evento individual (precisa nova edge function)
- Configurar webhook secret pela UI (hoje é via secret manager, mais seguro assim)
- Alertas por email quando webhook falha
