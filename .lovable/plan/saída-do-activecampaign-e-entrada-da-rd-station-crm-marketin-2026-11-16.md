# Saída do ActiveCampaign e entrada da RD Station (CRM + Marketing)

## Avaliação de impacto

### Telas e recursos que usam o ActiveCampaign hoje

| Onde | O que faz | Decisão |
|---|---|---|
| Integrações > ActiveCampaign (conexão, teste, contatos, funis) | Configura e testa a conta AC | Substituir por "Integração RD Station" |
| Integrações > Funis AC (métricas de funil) | KPIs de etapas, conversão e tempo por funil | Manter a tela, trocando a fonte para funis do RD CRM |
| Planejamento Comercial > Cobertura de Pipeline | Escolhe um funil e calcula cobertura de meta | Manter, lendo funis do RD CRM |
| Metas Táticas > métricas de oportunidades e lançamento manual | Conta negociações/tarefas por etapa como métrica | Manter, apontando para etapas do RD CRM |
| Metas Operacionais > conversões do CRM | Conversões vindas das negociações | Manter, com RD CRM |
| Carteira de CS > ficha 360 do cliente | Mostra "Negócios no CRM (ActiveCampaign)" com link | Manter, com negócios e link do RD CRM |
| Campanhas de vendas > vínculo com negociação | Liga contatos da campanha a uma negociação AC | Manter, ligando à negociação do RD CRM |
| Chatwoot > aba AC (nota por conversa no contato) | 1.846 notas enviadas, ainda rodando hoje | Levar para o RD (nota/anotação no contato) |
| Jornada do Lead, Pipeline, Auditoria de Integrações | Mostram dados ou erros de sincronização AC | Manter, trocando os rótulos e a fonte |
| Mapa vendedor x responsável AC | Vazio (0 linhas) | Recriar como mapa vendedor x responsável RD |

### O que pode ser desligado e excluído
- As 9 rotinas automáticas do ActiveCampaign (webhooks, sincronização de funis, etapas, cancelamentos, carga inicial, lista de contatos/funis, teste de conexão) e o envio Chatwoot → AC. Serão removidas após a versão RD estar rodando.
- A chave de acesso do ActiveCampaign guardada no sistema.
- A tela de configuração do ActiveCampaign e as menções "AC" nos rótulos.

### O que fica como histórico (sem novas atualizações)
- 905 negociações, 1.692 mudanças de etapa, 804 tarefas, 30 funis e as 1.846 notas do Chatwoot já enviadas. Ficam marcados como "ActiveCampaign (histórico)" e continuam aparecendo nos períodos anteriores a novembro/2026.
- Os gráficos passam a juntar histórico AC + dados novos do RD, para não haver quebra na comparação mês a mês.

### Uso do RD Station Marketing
- Leads e conversões de formulário/landing page entram como origem de lead (Jornada do Lead e Campanhas).
- Envio da etiqueta de cliente (ativo, churn, plano) para segmentações no RD Marketing, se vocês quiserem usar automações para upsell e reconquista.

## Plano de execução (em fases)

1. **Conexão:** conectar RD Station CRM e RD Station Marketing pelo cartão de conexão (ou com chave de acesso, se não houver conector pronto) e testar com uma leitura simples.
2. **Leitura do RD CRM:** trazer funis, etapas, negociações, tarefas e responsáveis; atualizar por aviso automático do RD e por uma rotina diária de conferência. Gravar nas mesmas estruturas de hoje, marcando a fonte como "RD".
3. **Trocar as telas:** Funis, Cobertura de Pipeline, Metas Táticas, Metas Operacionais, ficha 360, Campanhas e Jornada do Lead passam a ler AC (histórico) + RD (novo).
4. **Chatwoot → RD:** a nota de cada conversa passa a ir para o contato no RD CRM; as notas antigas no AC ficam como estão.
5. **RD Marketing:** receber leads/conversões e (opcional) enviar etiquetas de clientes.
6. **Desligar o AC:** remover as rotinas do ActiveCampaign, a chave guardada e a tela antiga; renomear rótulos.

## Pontos a confirmar durante a execução
- Se existe conector pronto da RD Station no Lovable; se não, vou pedir o token do RD CRM e as credenciais do RD Marketing.
- Quais funis do RD CRM devem aparecer nas métricas (equivalente aos "funis conectados" de hoje).
- Correspondência entre usuários do RD e vendedores do painel.

## Detalhes técnicos
- Tabelas `ac_*` ganham coluna `source` ('activecampaign' | 'rdstation') via migração aditiva, ou são espelhadas em tabelas `crm_*` neutras com views de união; escolha final na fase 2 após ver o formato da API do RD (deals/deal_stages/pipelines/tasks/users).
- Novas funções: `rd-crm-sync`, `rd-crm-webhook`, `rd-test-connection`, `chatwoot-to-rd-sync`, `rd-marketing-webhook`.
- Funções a excluir no fim: `ac-funnel-sync`, `ac-funnel-webhook`, `ac-list-contacts`, `ac-list-pipelines`, `ac-sync-cancel`, `ac-sync-deal-stages`, `ac-sync-initial`, `ac-test-connection`, `ac-webhook`, `chatwoot-to-ac-sync`, `chatwoot-ac-backfill`, mais os agendamentos correspondentes.
- `opportunities.ac_id` e `sales_campaign_contacts.matched_ac_deal_id` mantidos (histórico) e marcados como descontinuados; novos campos para o id do RD.
