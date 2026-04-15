

# Plano de Reestruturação do CRM Yampa

## Visão Geral
Reestruturação completa do modelo de dados e UI do CRM, separando Contatos de Oportunidades, adicionando Equipes, Perfil do usuário e tornando Metas mais robustas.

---

## 1. Migrações de Banco de Dados

### 1A. Estender tabela `profiles`
- Adicionar colunas: `phone text`, `birth_date date`, `email text`
- Criar storage bucket `avatars` (público) para fotos de perfil

### 1B. Criar tabela `teams` e `team_members`
```text
teams: id, name, description, created_at, updated_at
team_members: id, team_id (FK teams), user_id, role_in_team (text: 'leader'|'member'), created_at
```
- RLS: admins gerenciam tudo, membros veem seus próprios times

### 1C. Criar tabela `contacts`
```text
contacts: id, name, email, phone, company, segment, icp_level (integer 1-5),
          created_by (uuid), created_at, updated_at
```
- RLS: admins veem todos, sellers veem os que criaram

### 1D. Reestruturar `leads` → `opportunities`
- Renomear tabela `leads` para `opportunities` (ou criar nova e migrar dados)
- Adicionar/ajustar colunas:
  - `contact_id` (FK contacts) — vínculo com contato
  - `title` (text) — título da oportunidade
  - `sub_origin` (text) — sub-origem
  - `estimated_close_date` (date) — data estimada de fechamento
  - `probability` (numeric) — probabilidade %
  - `loss_reason` (text, nullable) — motivo de perda (condicional para etapa "perdido")
- Manter colunas existentes: estimated_mrr, estimated_tpv, consultant_id, stage, origin, etc.
- Migrar dados existentes (leads atuais viram oportunidades, criar contatos a partir dos nomes)

### 1E. Atualizar tabela `activities`
- Renomear `lead_id` → `opportunity_id` (ou adicionar e migrar)
- Adicionar: `scheduled_at` (timestamptz), `result` (text)
- Atualizar enum `activity_type`: adicionar 'whatsapp', 'proposta' (ou mapear os existentes)

### 1F. Estender tabela `goals`
- Adicionar colunas: `team_id` (FK teams, nullable), `campaign` (text, nullable), `scope` (text: 'company'|'team'|'user'|'channel'|'campaign')
- Permite metas por empresa (user_id=null, team_id=null), por equipe, por vendedor, por canal ou por campanha

### 1G. Atualizar `lead_origin` enum
- Adicionar valor 'campanhas_marketing' e 'campanhas_base' (ou manter flexível com sub_origin)

---

## 2. Novas Páginas e Componentes

### 2A. Página de Perfil (`/profile`)
- Formulário editável: Nome, Telefone, Email, Data de Nascimento
- Upload de foto de perfil (storage bucket avatars)
- Seção "Minhas Equipes" — lista os times associados
- Acessível por todos os usuários (admin e seller)
- Link na sidebar + ícone de perfil no footer da sidebar

### 2B. Reestruturar Página de Equipe (`/team`)
- Tab "Equipes": listar equipes, criar/editar/excluir equipe
- Tab "Membros": associar/remover usuários de equipes, definir líder
- Um usuário pode pertencer a múltiplas equipes
- Manter gráfico de velocidade de venda existente

### 2C. Reestruturar Página de Metas (`/goals`)
- Filtros por escopo: Empresa, Equipe, Vendedor, Canal, Campanha
- Ao criar meta, selecionar escopo e entidade correspondente
- Cards de resumo por tipo de meta
- Manter campos existentes de volume e conversão por etapa

### 2D. Pipeline — Adicionar card manual (admin)
- Botão "Nova Oportunidade" na página Pipeline (admin)
- Dialog com campos: Contato (busca/cria), Título, Canal, Sub-origem, MRR, TPV, Probabilidade, Data estimada de fechamento, Vendedor responsável, Etapa inicial
- Campo "Motivo de Perda" aparece apenas quando etapa = perdido

### 2E. Atualizar SellerKanban
- Ajustar para usar `opportunities` em vez de `leads`
- Formulário de novo card com campos da nova estrutura

---

## 3. Ajustes em Componentes Existentes

- Atualizar todas as queries de `leads` → `opportunities` em: AdminDashboard, Forecast, Import, RevenueProjection, GoalsProgress, PipelineFunnel, BottleneckAlerts, Leaderboard
- Atualizar constants.ts com novos tipos de atividade
- Atualizar sidebar com link para Perfil

---

## Detalhes Técnicos

- **Migração de dados**: Script SQL para criar contatos a partir dos leads existentes e vincular oportunidades
- **Storage**: Bucket `avatars` com RLS para upload autenticado
- **Ordem de execução**: Migrações primeiro (1A-1G), depois UI (2A-2E), depois ajustes (3)
- **Estimativa**: ~15 arquivos modificados, ~5 novos arquivos, 3-4 migrações SQL

