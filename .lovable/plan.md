# Recuperados/Retidos por canal (Cobrança x CS) com motivo parametrizável

## Objetivo
No painel de Metas Táticas, distinguir se cada cliente recuperado/retido voltou a pagar por **Cobrança** (retentativa/forçar cobrança no Stripe) ou por **ação de CS**, e registrar o **motivo** da recuperação/retenção a partir de uma lista parametrizável mantida pelo próprio usuário.

## O que será entregue

### 1. Canal de recuperação
Cada registro passa a ter um canal:
- **Cobrança** — a cobrança forçada/retentativa no Stripe resultou em recuperação de MRR.
- **CS** — ação humana do time de CS (contato, negociação, desconto, suporte).

Regras de preenchimento:
- Reativações identificadas automaticamente no Stripe entram como **Cobrança** por padrão (podem ser reclassificadas manualmente).
- Lançamentos manuais e importados exigem a escolha do canal (padrão CS).

### 2. Motivo parametrizável
- Nova lista de motivos administrável (nome, canal aplicável, ativo/inativo, ordem), com motivos iniciais sugeridos: "Cartão atualizado", "Cobrança recuperada na retentativa", "Renegociação de valor", "Desconto concedido", "Problema técnico resolvido", "Onboarding/uso retomado", "Mudança de plano", "Outro".
- Gestão da lista em um painel de configuração dentro de Metas Táticas (criar, renomear, ativar/desativar, remover se não usado).
- Campo de motivo (Select) nos diálogos de lançamento manual, importação de planilha e edição de registro. Obrigatório para canal CS, opcional para Cobrança.

### 3. Visões na tabela "Clientes recuperados e retidos"
- Nova coluna **Canal** (badge Cobrança/CS) e coluna **Motivo**.
- Filtros por canal e por motivo, somados aos filtros existentes de tipo e período.
- Resumo no topo do bloco: quantidade e MRR por canal, quebrado em Recuperados x Retidos (ex.: "Cobrança: 8 clientes · R$ 3.120" / "CS: 5 clientes · R$ 2.480").
- Mini-ranking de motivos no período (motivo, qtd, MRR) para leitura rápida do "por que voltaram a pagar".
- Coluna Canal/Motivo também nos cards da versão mobile.

### 4. Importação de planilha
- Colunas aceitas adicionais: "Canal" (Cobrança/CS) e "Motivo" (casado por nome com a lista, criando pendência de "Outro" quando não reconhecido). Modelo de planilha atualizado.

## Detalhes técnicos
- Migração:
  - `tactical_recovery_reasons` (id, name, channel `cobranca|cs|ambos`, active, sort_order, created_at) com GRANTs e RLS (leitura autenticada; escrita para tático/admin via `is_tatico_or_admin`).
  - `tactical_recoveries`: novas colunas `recovery_channel text` (check `cobranca|cs`, default `cs`) e `reason_id uuid` → `tactical_recovery_reasons`.
  - `tactical_manual_entries`: mesmas duas colunas, para os lançamentos agregados de recuperados/retidos.
  - Seed dos motivos iniciais.
- Componentes afetados: `TeamRecoveriesTable.tsx` (colunas, filtros, resumo, ranking), `RecoveryEntryDialog.tsx` (manual + import + modelo), `RecoveryEditDialog.tsx` (edição), `ManualEntryDialog.tsx` (canal/motivo quando a métrica é recuperados/retidos), novo `RecoveryReasonsConfig.tsx` e ponto de acesso em `TacticalTracking.tsx`.
- Linhas vindas de `stripe_conversions` (reativações) são exibidas como canal Cobrança de forma derivada, sem gravação, até que o usuário edite/reclassifique.
- Nenhuma alteração nos totais de Realizado: `useTacticalData.ts` continua somando quantidade e MRR igual, apenas ganha os campos para eventual recorte por canal.
