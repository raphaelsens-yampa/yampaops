# Documento explicativo — aba "Cohort" (Histórico de Campanhas)

Gerar um arquivo Word (.docx) para download explicando cada campo, botão, card, gráfico e coluna da aba **Cohort** da tela Histórico de Campanhas, com a regra real usada pelo sistema e exemplos numéricos.

## Conteúdo do documento

1. **Visão geral da aba** — o que ela responde: dos clientes ativados por uma campanha, quantos continuam pagando hoje, quanta receita geraram e se a campanha se pagou.
2. **Como o dado entra** — lista de clientes por campanha (importação de planilha ou colagem de e-mails), normalização de e-mail, tratamento de linhas inválidas e duplicadas, colunas reconhecidas na planilha (e-mail, nome, oferta, data de ativação).
3. **Barra de ações** — Campanha, Lista de clientes, Recalcular cohort, Consultar Stripe (ao vivo), Reconsultar todos, Base de churn; o que cada um altera e quando usar.
4. **Precedência das fontes** — Metabase (snapshot diário) → Stripe local → Stripe ao vivo; significado de "Último cálculo" e "Snapshot Metabase" no rodapé da barra.
5. **Cards da primeira linha**, um a um, com fórmula:
   - Total da lista — contatos importados.
   - Ativos / Cancelados — status do cruzamento.
   - % de retenção — ativos ÷ (ativos + cancelados).
   - MRR ativo hoje — soma do MRR dos ativos.
6. **Cards da segunda linha**:
   - Receita Acumulada — soma, cliente a cliente, do MRR por mês da ativação até hoje (ativos) ou até o cancelamento (cancelados); registros com MRR nulo/zero são excluídos.
   - LTV Real — receita acumulada ÷ clientes pagantes.
   - LTV/CAC Real — LTV Real ÷ CAC (usa CAC Líquido quando preenchido e > 0, senão CAC geral); subtítulo mostra o LTV/CAC projetado do cadastro.
   - ROI Real (payback) — primeiro mês em que a receita acumulada iguala/supera o Investimento realizado; exibe "Não se pagou ainda" quando não atingido e "—" sem investimento cadastrado; subtítulo com o Tempo de ROI previsto.
   - ARPA — receita do mês 0 ÷ número de clientes pagantes.
7. **Curva e tabela consolidada (M0, M1, M2…)** — ativos e MRR por mês relativo, retenção sobre M0, ativos acumulados, MRR acumulado e os percentuais.
8. **Matriz de cohort (heatmap)** — cada linha é o mês de ativação, cada coluna o mês relativo; regra de "ainda ativo" e por que a matriz é triangular.
9. **Tabela por cliente** — colunas e-mail, nome, plano, oferta, MRR, status, ativação, cancelamento, origem, fonte do dado e fonte do churn; filtros de status/busca; remoção de contato; exportação CSV/XLSX.
10. **Glossário de status e fontes** — Ativo, Cancelado, Trial, Nunca assinou, Indefinido; Metabase, Stripe, Stripe (ao vivo); Snapshot diário, Histórico Metabase, Planilha manual, Stripe.
11. **Exemplo prático completo** — uma campanha fictícia com 100 e-mails, mostrando cada card sendo reconstruído passo a passo (receita acumulada, LTV, LTV/CAC, payback, ARPA).
12. **Como ler na prática** — o que indica LTV/CAC abaixo de 3x, payback longo, muitos "Nunca assinou" (lista suja ou falta de cruzamento) e quando recalcular.

## Detalhes técnicos

- Regras extraídas de `src/lib/campaignCohort.ts` (`summarize`, `buildCurve`, `summarizeCurve`, `computeLifetimeRevenue`, `paybackMonth`, `buildCohortMatrix`, `normalizeEmail`, `parseSheetRows`), de `src/components/campaign-history/CohortPanel.tsx` (cards, filtros, ações, regra do CAC), `CohortRetentionChart.tsx` e `CohortListDialog.tsx`.
- Documento gerado com a biblioteca `docx` em script temporário (fora do código do app), A4, tabelas com uma linha por campo, cores da identidade Yampa (primária #01B8E0, secundária #2D094C).
- Saída em `/mnt/documents` para download, com QA visual (conversão em imagens e revisão página a página) antes da entrega.
- Nenhuma alteração no código da aplicação.
