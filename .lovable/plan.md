

# Painel de Contatos — Substituir "Importar" por "Contatos"

## Visão Geral
Transformar a rota `/import` em `/contacts` — um painel completo de gestão de contatos com listagem, busca, criação, edição, e importação/exportação de **Contatos** e **Oportunidades** via CSV.

## Mudanças

### 1. Sidebar e Rotas
- Renomear "Importar" → "Contatos", ícone `Contact`, URL `/contacts`
- Atualizar `App.tsx` com nova rota

### 2. Nova página `src/pages/Contacts.tsx` (substitui `Import.tsx`)

**Layout com 3 Tabs**: "Listagem" | "Importar Contatos" | "Importar Oportunidades"

**Tab Listagem**:
- Busca por nome/email/empresa
- Filtros: Segmento, Nível ICP (1-5)
- Tabela: Nome, Email, Telefone, Empresa, Segmento, ICP, Oportunidades vinculadas, Data criação
- Botão "Novo Contato" — Dialog com formulário completo
- Ações por linha: Editar, Excluir
- Exportar contatos em CSV

**Tab Importar Contatos**:
- Upload CSV com mapeamento de colunas para campos da tabela `contacts` (name, email, phone, company, segment, icp_level)
- Preview e importação em lote

**Tab Importar Oportunidades**:
- Upload CSV com mapeamento para campos da tabela `opportunities` (name, company, origin, estimated_mrr, estimated_tpv, take_rate, stage, title, sub_origin, probability, etc.)
- Lógica atual do `Import.tsx` reaproveitada aqui
- Exportar oportunidades em CSV

### 3. Arquivos afetados
- Criar `src/pages/Contacts.tsx`
- Remover `src/pages/Import.tsx`
- Editar `src/components/AppSidebar.tsx` (renomear item)
- Editar `src/App.tsx` (trocar rota)

