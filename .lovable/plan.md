
## Diagnóstico

A OnePage Diretoria hoje tem três problemas que geram a sensação de "sobras" e poluição visual:

1. **Duas sidebars empilhadas** — o `Layout` já entrega a sidebar principal do sistema (com colapso); dentro dela existe uma segunda sidebar vertical (`p1`…`p6`) com seu próprio botão de colapso. Resultado: ~178 px de coluna extra antes do conteúdo começar, redundância visual e dois controles de colapso competindo.
2. **Cabeçalho repetido em cada seção** — cada um dos 6 blocos (`Page`) renderiza novamente o logo "YAMPA · by 4blue" + título + meta + um rodapé "Uso restrito…". Isso faz sentido em PDF/print, não numa SPA onde o app já tem header e a página já tem título.
3. **Larguras e respiros descalibrados** — cada `Page` é capada em `maxWidth: 1320 px` com borda + sombra forte, dentro de um `main` que já tem padding (`p-4 lg:p-6`) e fundo `#060f17` quase preto, criando faixas pretas à esquerda/direita em telas largas e quebrando a coesão visual com o resto do app (que é claro).

## Proposta

### 1. Remover a sidebar interna — sim, não faz sentido
Substituir por **abas horizontais sticky** logo abaixo do header do app:

```text
┌─ Sidebar app ─┬──────────────────────────────────────────────┐
│               │ [One Page] [Financeiro] [Metas] [Rev] [Mkt]  │  ← sticky
│  (menus do    ├──────────────────────────────────────────────┤
│   sistema)    │                                              │
│               │   conteúdo da seção ativa, full-width        │
└───────────────┴──────────────────────────────────────────────┘
```

- Mantém o mesmo scroll-spy + clique para navegar entre seções.
- Libera ~178 px horizontais → cards respiram, gráficos ficam maiores.
- Elimina o segundo botão de colapso (a sidebar do sistema já colapsa).

### 2. Cabeçalho único por seção
- Remover o bloco `YAMPA / by 4blue / título / meta` e o rodapé "Uso restrito…" de cada `Page`.
- Manter por seção apenas um header enxuto: **título grande + meta à direita** alinhado com a barra de abas.
- Mover a linha "Uso restrito — Sócios Yampa / 4blue · Dados até 16/06/2026" para **um único rodapé** no final da página inteira.

### 3. Reajustes visuais para reduzir sobras e melhorar a leitura
- **Remover `maxWidth: 1320`** e a borda+sombra externa de cada `Page`. O `main` do app já define a largura útil; cada seção vira só um stack de cards.
- **Trocar o fundo `#060f17`** por `bg-background` (token semântico) para integrar com o restante do sistema; cards continuam dark (`#132336`) como ilhas de dado, mas sem o "moldurão" preto ao redor.
- **Padding consistente**: `p-4 lg:p-6` no container da seção, `gap-4` nos grids (substituindo o `gap-3.5` atual misturado). Remover o `padding: 22px 24px 26px` interno do `Page`.
- **Cards**: padronizar raio (`rounded-xl`), borda usando `border-border` e padding `p-4` em vez de `14px 16px` inline.
- **Tipografia**: títulos de seção em `text-xl font-bold tracking-tight`; mini-labels mantêm o uppercase 11px atual (funciona bem para densidade executiva).
- **KPIs**: reduzir o número grande de `30px` para `28px` e dar `tabular-nums` para alinhar colunas; ganha densidade sem perder hierarquia.
- **Sticky tabs**: barra de abas com `backdrop-blur` + borda inferior, para flutuar elegante sobre o conteúdo no scroll.

### 4. Responsivo
- Em `<lg`, as abas viram um scroll horizontal (já é o comportamento natural) com indicador da aba ativa.
- Em mobile, as abas continuam sticky no topo do conteúdo (a sidebar do app já vira off-canvas).

## Arquivos a alterar

- `src/pages/OnePageDiretoria.tsx`
  - Remover `<nav>` lateral, estado `navCollapsed` e imports `ChevronLeft/ChevronRight`.
  - Criar `<SectionTabs active onSelect />` sticky no topo do `main`.
  - Refatorar `Page({ id, ttl, meta, children })` para renderizar só `<section id> <header título+meta> {children} </section>` sem moldura.
  - Substituir `Card` para usar classes Tailwind + tokens (`bg-card border-border`) em vez de `style` inline.
  - Mover o disclaimer "Uso restrito…" para um único `<footer>` ao final.
  - Trocar `background:"#060f17"` por `bg-background text-foreground`.

Nenhuma alteração de dados, rotas, lógica de negócio ou backend.

## Fora de escopo
- Não mexer no `Layout`/sidebar do sistema (mantém o colapso já existente).
- Não alterar conteúdo numérico, gráficos ou ordem das seções.
- Não tocar em outras páginas.
