# Revisão da Gestão de Níveis de Acesso

Auditoria comparando as rotas reais (`src/App.tsx`), o menu (`AppSidebar` / `MobileBottomNav`) e as chaves da tela de Níveis de Acesso (`CRM_SECTIONS` em `AccessLevelManager.tsx`).

## O que está obsoleto

| Chave | Situação |
|---|---|
| `pipeline` ("Pipeline", em Operações) | A página Pipeline foi arquivada e a rota não existe mais. A chave não controla nada — o Kanban do vendedor fica na rota `/` sem checagem de área. |
| `contacts` ("Contatos", em Gestão) | Página e rota arquivadas. Chave sem efeito. |
| `commissions` ("Comissões", em Sales) | As rotas `/commissions` e `/commissions/settings` existem e estão protegidas, mas não há nenhum link no sidebar nem no menu mobile — tela órfã, hoje substituída por "Comissionamento". |

## O que está faltando

1. **Rotas sem controle de acesso** (qualquer usuário logado acessa digitando a URL):
   - `/reports` (Relatórios) — não tem chave de permissão nem item de menu.
   - `/one-page-diretoria` e `/relatorio` — atalhos duplicados do OnePage sem o guard `one_page_diretoria`, então um vendedor consegue abrir a OnePage por essas URLs.
2. **Telas sem chave própria** (hoje herdam a permissão de outra área, sem granularidade):
   - `Chatwoot → ActiveCampaign` usa `integration_chatwoot`.
   - Subtelas da Auditoria IA (Fila de Revisão, Insights, Golden Set, Configurações) usam todas `auditoria_ia`.
3. **Divergência de rótulo**: em Operações não existe mais "Pipeline"; o que existe é "Meu Pipeline" (visão do vendedor na home).

## Mudanças propostas

**1. Limpar chaves obsoletas** (`AccessLevelManager.tsx`)
- Remover `pipeline` e `contacts` das seções (mantendo compatibilidade: níveis salvos com essas chaves simplesmente deixam de ser exibidos).
- Ajustar os defaults por papel em `useAuth.tsx` (remover `pipeline`/`contacts`).

**2. Resolver "Comissões"**
- Manter a chave, mas mover para o final da seção Sales com rótulo "Comissões (legado)" e adicionar o item no sidebar apenas para quem tiver a permissão, para deixar de ser tela órfã.

**3. Fechar as rotas sem guard** (`App.tsx`)
- `/reports` → nova chave `reports` ("Relatórios") na seção Visão Geral, com `RequireArea`.
- `/one-page-diretoria` e `/relatorio` → envolver em `RequireArea area="one_page_diretoria"`.

**4. Novas chaves de granularidade**
- `integration_chatwoot_ac` ("Chatwoot → ActiveCampaign") na seção Integrações, aplicada na rota e no item de sidebar.
- `auditoria_ia_admin` ("Auditoria IA — Revisão/Insights/Golden Set/Config") na seção Operações, aplicada nas 4 rotas administrativas da auditoria.
- Defaults: admin = tudo; tático = leitura; vendedor = sem acesso (ajustável por nível).

**5. Rótulos**
- Renomear a exibição de itens para casar com o sidebar atual (ex.: "Precificação Serviços", "Gerador de Ofertas" já batem; ajustar textos residuais).

## Detalhes técnicos

- As chaves vivem em `CRM_SECTIONS` (`src/components/AccessLevelManager.tsx`); `useAuth.tsx` deriva tipos e defaults por papel a partir dela, então cada chave nova/removida exige ajuste em `defaultsForRole`.
- `mergePermissions` já garante retrocompatibilidade: chaves ausentes no nível salvo herdam o default do papel, portanto nenhuma migração de banco é necessária.
- Nenhuma alteração de tabela ou política é necessária — `access_levels.permissions` é JSON.
