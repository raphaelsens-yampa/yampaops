## Objetivo

Adicionar um botão **"Novo Serviço"** no header da Tabela de Serviços (aba Análise de Preços) que abre um Dialog modal com formulário completo, refletindo todas as variáveis que compõem a precificação na planilha.

## Localização e fluxo

- Botão `+ Novo Serviço` ao lado de Reverter/Salvar, no `CardHeader` de `AnalisePrecosTab.tsx`.
- Ao clicar, abre `<Dialog>` com o componente novo `NewProductDialog.tsx`.
- Ao confirmar, o produto é adicionado via `setProducts([novo, ...products])` (já existente no hook), persistindo em `localStorage`.

## Estrutura do formulário

Organizado em 4 blocos visuais, com cálculos em tempo real à direita (preview):

### 1. Identificação
- **Nome do Serviço** (text, obrigatório, max 200) — validado com zod
- **Meses de Contrato** (number, 1–60, default 12)
- **Linha de Markup** (Select com Premium/Gold/Prata vindo de `config.markup`, mostrando a margem alvo de cada uma)

### 2. Custo das horas — Toggle entre dois modos

**Modo Simples (default):**
- Campo único `Custo total (R$)`

**Modo Detalhado (composição por equipe):**
- Tabela dinâmica de linhas: `Cargo` (text) · `Horas` (number) · `Valor/hora` (R$) · `Subtotal` (calculado) · botão remover
- Botão `+ Adicionar item`
- Total = soma dos subtotais, exibido em destaque e usado como `custo` final
- A composição detalhada é salva em um novo campo opcional `custo_breakdown` no `Produto` (array), para auditoria/edição futura

Toggle por `RadioGroup` ou `Tabs` no topo do bloco.

### 3. Preço (com sugestão automática)
- Bloco de preview exibe, calculados a partir de custo + meses + linha + config:
  - **Preço Mínimo (0% lucro) /mês** e **Total**
  - **Preço Ideal Sugerido /mês** e **Total** (destacado)
- Campo `Preço/mês` pré-preenchido com o Preço Ideal Sugerido (atualizado automaticamente sempre que custo, meses ou linha mudam — só sobrescreve se o usuário ainda não editou manualmente)
- Campo `Preço Total` exibido em readonly (= preço/mês × meses)

### 4. Indicadores em tempo real
Card lateral (ou rodapé do dialog) com:
- Margem de Contribuição (R$ e %), com cor verde/amber/vermelha igual à tabela
- Badge de status: "Preço bom" ou "Abaixo do ideal"
- Comparação visual entre `Preço definido` vs `Mínimo` vs `Ideal`

## Validações (zod)

```
nome: string trim, 1–200
meses: int 1–60
linha: enum
custo: número > 0
preco_mensal: número >= 0
custo_breakdown[].horas/valor: > 0 quando modo detalhado
```

Bloqueia confirmação se nome já existir (case-insensitive).

## Mudanças técnicas (resumo)

- `src/types/precificacao.ts`: adicionar `custo_breakdown?: { cargo: string; horas: number; valor_hora: number }[]` em `Produto`
- `src/hooks/usePrecificacao.ts`: adicionar `addProduct(novo: Produto)` que faz `setProducts([novo, ...prev])`
- `src/components/precificacao/NewProductDialog.tsx`: **novo** — formulário completo com zod, react-hook-form, preview ao vivo
- `src/components/precificacao/AnalisePrecosTab.tsx`: botão `+ Novo Serviço` no header + integração do dialog

Nenhuma alteração de banco — tudo permanece em `localStorage` (consistente com o hook atual).

## Trade-offs

- O modo detalhado adiciona ~30% de complexidade no componente, mas é a única forma de manter paridade com a planilha original (que decompõe o custo por horas de equipe).
- Sugerir o Preço Ideal automaticamente reduz erros, mas o usuário sempre pode sobrescrever — o preview de mínimo/ideal continua visível como guarda-corpo.