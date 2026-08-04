# Documento explicativo — aba "Análise de Preços"

Gerar um arquivo Word (.docx) para download explicando cada campo, coluna, filtro e KPI da aba "Análise de Preços" da tela Precificação Serviços, com a fórmula real usada pelo sistema e um exemplo numérico.

## Conteúdo do documento

1. **Visão geral da aba** — o que a tela responde: se o preço praticado de cada serviço cobre custo, deduções e margem-alvo da linha.
2. **Cards de resumo (KPIs)** — total de serviços, quantidade com "Preço bom", margem de contribuição média, itens alterados pendentes de salvar.
3. **Filtros e busca** — Todos, Preço bom, Abaixo do ideal, BPO, Time Financeiro, Setup; busca por nome; ordenação por qualquer coluna.
4. **Colunas da tabela**, uma por uma, com definição, origem do dado e fórmula:
   - Status (Bom / Abaixo do ideal): compara Preço/mês com Ideal/mês.
   - Produto e Linha (Premium / Gold / Prata) — a linha define a margem-alvo e, portanto, o markup.
   - Contr. (meses de contrato) — divisor usado para converter valores totais em mensais.
   - Custo/mês e Custo Tot. — custo direto (horas x valor/hora do breakdown).
   - Ideal/mês e Ideal Tot. — (custo / meses) x markup da linha, onde markup = 1 / (1 − deduções base − margem-alvo).
   - Min./mês e Min. Tot. — mesmo cálculo com margem-alvo zero: preço de equilíbrio.
   - Preço/mês (editável) e Total — preço praticado; edição fica pendente até "Salvar" e gera versão no histórico.
   - Margem (MC%) e valor em R$ — Preço Total x (1 − impostos − comissão − gateway − churn) − custo.
   - Lucro Proj. — (Preço Total − custo unitário total) / Preço Total, incluindo despesa fixa e as 4 deduções.
5. **Parâmetros que alimentam os cálculos** — referência rápida às deduções e margens-alvo definidas na aba Configurações e como alterá-las muda Ideal, Mínimo, Margem e Lucro Projetado.
6. **Exemplo prático completo** — usando a linha real do exemplo (Gold 20%, 12x, custo/mês R$ 35,70, ideal R$ 133,01, mínimo R$ 76,22, preço R$ 299,00, margem 59,1%, lucro 42,2%), mostrando cada número sendo reconstruído passo a passo.
7. **Como ler a tela na prática** — o que fazer quando o status está "Abaixo do ideal", diferença entre furar o Ideal e furar o Mínimo.

## Detalhes técnicos

- Fórmulas extraídas de `src/hooks/usePrecificacao.ts` (`calcMarkup`, `calcIdealMensal`, `calcMinMensal`, `calcMC`, `calcLucroProjetado`, `statusCheck`) e das colunas renderizadas em `src/components/precificacao/AnalisePrecosTab.tsx`.
- Documento gerado com a biblioteca `docx` em script temporário (fora do código do app), papel A4/Letter, fonte limpa, tabelas com uma linha por campo, cores alinhadas à identidade Yampa (primária #01B8E0, secundária #2D094C).
- Saída em `/mnt/documents` para download, com QA visual (conversão em imagens e revisão página a página) antes da entrega.
- Nenhuma alteração no código da aplicação.
