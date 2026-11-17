# Gestão de acesso: varredura, correções e amarras

## O que a varredura encontrou

Hoje o acesso é decidido em **três lugares diferentes**, que não conversam entre si:

1. **Nível de Acesso** (tela Usuários & Acessos): marca ver/criar/editar por área.
2. **Papel** (Admin / Tático / Seller): bloqueios escritos dentro das telas, em cerca de 35 telas e componentes.
3. **Menu lateral**: tem marcações próprias ("só gestores", "só admin"), separadas das duas acima.

Conflitos já confirmados:

- **Conversões por Área** e **Atendimentos**: o Nível de Acesso pode liberar, mas a tela manda um Seller de volta para o início.
- **Auditoria IA > Insights**: a área "Revisão/Insights/Golden Set/Config" libera, mas a tela também exige Admin ou Tático.
- **Atividade de Agentes, Campanhas, Funis CRM**: ficam escondidas no menu para Seller mesmo com o nível liberado. Mas quem digita o endereço consegue abrir a tela (o menu esconde, a página não bloqueia).
- **Stripe e Chatwoot (Integrações)**: o menu pede Admin; o nível "Integrações" não tem efeito para os demais.
- **Página inicial**: Admin/Tático vê OnePage; Seller vê "Meu Pipeline", e isso não depende de nível nenhum.
- **Funis ActiveCampaign**: a área continua liberável, mas a ferramenta foi descontinuada.
- **Sem área própria**: Tarefas CS, Fila do Dia, Resultado Projetado, Pacing New MRR/Churn, Potencial da Base, Importação de uso de produto e o link TV dependem só da área "mãe" ou do papel. Não dá para liberar ou bloquear separadamente.
- **"Criar" e "Editar"**: quase nenhuma tela lê essas marcações. A edição é decidida pelo papel, então marcar "criar/editar" no nível muitas vezes não muda nada.

## O que vou fazer

### 1. Uma lista oficial de funcionalidades
Um único cadastro com todas as telas e sub-funções (aba, painel ou ação sensível), com:
- a seção do menu;
- o endereço;
- se aceita ver, criar e editar;
- o papel mínimo, quando existe um motivo de negócio (ex.: Configurações da Auditoria só para Admin).

O menu, as rotas, a tela de Níveis de Acesso e os bloqueios das telas passam a ler essa lista.

### 2. Regra única de decisão
Acesso = **Nível de Acesso libera** E **Papel atende o mínimo** (quando houver). Admin continua vendo tudo.
- O menu esconde exatamente o que a página bloqueia. Não fica mais item escondido que abre pelo endereço, nem item visível que expulsa o usuário.
- Os bloqueios escritos dentro das telas são removidos e trocados por essa regra.
- Botões de criar e editar passam a respeitar as marcações do nível.

### 3. Novas áreas liberáveis
Entram como sub-itens na tela de Níveis de Acesso:
- Tarefas CS
- Fila do Dia
- Importar uso de produto
- Resultado Projetado
- Pacing (New MRR e Churn)
- Potencial da Base
- Metas Táticas
- Metas Estratégicas
- Cadastro de Metas
- Configurações de Metas

"Funis ActiveCampaign" passa a "Histórico ActiveCampaign", somente leitura.

**Migração sem perda:** cada nível existente herda nas sub-áreas novas o que já tinha na área mãe. Ninguém ganha ou perde acesso no dia da mudança.

### 4. Matriz de acesso visível
Na tela Usuários & Acessos entra uma aba **"Matriz"**: funcionalidades nas linhas, níveis e papéis nas colunas, mostrando quem vê, cria e edita. Inclui um alerta para funcionalidades que nenhum nível libera.

### 5. Amarras para funcionalidades futuras
- **Teste automático:** falha se existir rota, item de menu ou bloqueio de tela sem área na lista oficial, ou se houver área que nenhuma tela usa.
- **Bloqueio por papel escrito direto na tela** passa a ser pego pelo teste. Só é aceito pela regra central.
- **Regra registrada nas instruções do projeto:** toda nova tela, aba ou ação sensível precisa nascer na lista oficial, com área e papel mínimo definidos, e liberada só para Admin até alguém configurar os níveis.

## Fora do escopo
- Regras de segurança no banco: continuam como estão, liberando só a equipe interna. Esta etapa trata do que cada pessoa vê e faz nas telas.
- Mudar o papel de qualquer usuário, inclusive Emanuelle.

## Detalhes técnicos
- Novo `src/lib/accessRegistry.ts` com `FEATURES` e um `can(feature, action, {role, permissions})` puro e testado. `CRM_SECTIONS`, AppSidebar, MobileBottomNav, `RequireArea` e `ManagerOnly` passam a derivar dele.
- Os hardcodes `role !== "admin" && role !== "tatico"` (StripeConversions, ChatwootReports, ChatwootAuditInsights e cerca de 30 outros) são substituídos por `useCan(feature, action)`.
- A migração de dados atualiza `access_levels.permissions` (jsonb), copiando a permissão da área mãe para as sub-chaves novas.
- `src/lib/accessRegistry.test.ts` varre `App.tsx` e `src/` em busca de `area=` órfãos e de comparações literais de papel.
- Regra adicionada ao AGENTS.md.
