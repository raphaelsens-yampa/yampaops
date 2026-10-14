# Revisão de Conversões por Área

## Objetivo
Corrigir os filtros e tornar os valores da Visão Geral, do Detalhamento e das exportações coerentes, mantendo a fonte Stripe e o layout atual.

**Decisão confirmada:** o indicador principal será **Acréscimo de MRR**: novas vendas e recuperações + apenas o aumento dos upsells. O valor completo da assinatura continuará disponível no detalhamento, sem ser confundido com crescimento.

## Problemas confirmados
- O filtro Vendedor não aplica o vendedor escolhido: só existe tratamento para “Sem vendedor”.
- Os períodos enviados às consultas e às ações de correção não incluem o fuso de São Paulo. Os atalhos também convertem datas locais para UTC antes de extrair o dia, podendo deslocar o fim do mês.
- Os gráficos somam o MRR completo dos upsells, enquanto o card Expansão soma apenas o incremento. Em outubro, a consulta no fuso de São Paulo retornou R$17.284,20 em valores completos versus R$15.391,92 em novas vendas + incrementos registrados.
- O filtro Bruto/Líquido altera os valores apresentados, mas a seleção de registros sempre exige valor líquido positivo, independentemente do modo escolhido.
- Renovação e downgrade aparecem no detalhamento/exportação, mas não nos totais dos gráficos. Ao filtrar esses tipos, os gráficos ficam vazios sem uma distinção clara de escopo.
- O detalhamento corta em 500 registros e não oferece navegação para os demais.
- Falhas de consulta não têm apresentação própria; podem parecer ausência de conversões.
- A correção de MRR líquido em lote considera apenas price e período, ignorando os demais filtros, embora anuncie a quantidade do recorte visível.
- A rotina “Buscar valor líquido” também sobrescreve o campo bruto `mrr` com o líquido.
- A auditoria encontrou quatro conversões com área diferente do de-para atual desde julho. Isso será tratado como divergência de dados, não como prova de que o filtro Área está quebrado.
- Na conferência visual, valores monetários ultrapassam a largura de alguns cards e o sinal da contração fica isolado em outra linha.

## Correções propostas

### 1. Filtros confiáveis
- Aplicar vendedor específico, Todos e Sem vendedor corretamente.
- Padronizar período, safra, datas exibidas e ações de correção em **America/Sao_Paulo**, incluindo todo o último dia selecionado.
- Corrigir os atalhos Este mês, Últimos 30/90 dias e Ano atual; validar datas vazias e início posterior ao fim.
- Garantir que Bruto/Líquido use o mesmo critério de elegibilidade e valor em todo o painel.
- Revisar combinações de área, tipo, vendedor, safra, reativação e cupom; não ampliar a definição de cupom para qualquer desconto.
- Manter opções de área suficientes para os valores efetivamente registrados, incluindo desconhecida, sem substituir silenciosamente a área histórica pela área atual do de-para.
- Acrescentar Limpar filtros e sinalização de atualização, sem exibir zeros falsos durante o carregamento.

### 2. Um critério de MRR por finalidade
- Total principal, gráficos por área/plano, evolução e resumo de vendedores usarão **novas vendas/recuperações + incremento de upsell**.
- Recuperações permanecerão identificadas pela marcação de reativação, sem duplicar registros classificados como novos.
- Renovação e downgrade continuarão fora do acréscimo, com indicadores próprios e identificação explícita quando esse tipo estiver selecionado.
- Separar no detalhamento e nas exportações: MRR bruto da assinatura, MRR líquido, variação e contribuição ao acréscimo.
- Verificar a origem e a consistência de `delta_mrr` antes de rotulá-lo como líquido ou bruto. Não inventar um MRR anterior líquido quando ele não estiver disponível; indicar a limitação e preservar ajustes manuais válidos.
- Incluir o grupo Sem vendedor nos resumos pertinentes para permitir conciliação com o total. A tabela Vendas por Vendedor por Plano continuará restrita a novas vendas.
- Tornar visível também na Visão Geral o aviso de fallback bruto quando faltar líquido.

### 3. Detalhamento, edições e correções
- Substituir o corte de 500 por paginação visual, mantendo todos os registros carregados para os totais e exports.
- Exibir estados distintos de carregamento, erro e resultado vazio; permitir tentar novamente.
- Após editar uma conversão ou price, atualizar os registros, indicadores, opções e verificações relacionados, inclusive ao revisitar filtros já usados.
- Na edição de price, validar valores financeiros e permitir limpar oferta/plano sem manter o texto antigo nas conversões escolhidas.
- Na correção de líquido em lote, apresentar prévia e quantidade real dos registros que serão alterados; respeitar o recorte anunciado e distinguir a alteração do cadastro global do price.
- Em “Buscar valor líquido”, preservar o campo bruto. Investigar os registros possivelmente já sobrescritos e só propor recomposição quando houver evidência confiável da Stripe; nenhuma correção histórica arbitrária.
- Manter prévia e confirmação para reaplicar o de-para; não corrigir em massa as quatro divergências sem apresentar o impacto.

### 4. Apresentação e validação
- Ajustar largura/quebra dos cards e legibilidade dos gráficos sem redesenhar a tela.
- Criar testes de filtros combinados, vendedor, limites de datas, bruto/líquido, reativação e contribuição de upsell. Exemplo concreto: cliente de R$900 para R$1.000 contribui R$100, mas sua assinatura permanece R$1.000.
- Conferir outubro e setembro com dados reais: totais por área, vendedor e plano devem reconciliar com as mesmas linhas e regras, não por compensações artificiais.
- Testar no navegador filtros isolados/combinados, limpeza, navegação do detalhamento, exportação e recarga após uma edição autorizada.
- Rodar os testes relevantes e conferir erros da aplicação antes de concluir.

## Migração de IA já autorizada
Esta é uma etapa separada da revisão do painel. A escolha **Replace outdated models** já autorizou estas substituições na Auditoria IA:

| Modelo atual | Retirada confirmada | Substituto suportado |
| --- | --- | --- |
| Gemini 2.5 Flash — configuração ativa | 20/10/2026 | `google/gemini-3.8-flash` |
| Gemini 2.5 Flash Lite — opção | 20/10/2026 | `google/gemini-3.1-flash-lite` |
| Gemini 2.5 Pro — opção | 20/10/2026 | `google/gemini-4-argon` |
| GPT-5 Mini — opção | 11/12/2026 | `openai/gpt-5.4-mini` |
| GPT-5 — opção | 11/12/2026 | `openai/gpt-5.6-sol` |

- Atualizar apenas referências afetadas, opções de seleção e configurações que ainda usem os modelos depreciados.
- Preservar critérios, prompts, limites de saída, comportamento de execução e histórico de auditorias. Adaptar parâmetros somente quando o novo modelo exigir.
- Verificar uma chamada real da Auditoria IA e a gravação/leitura do resultado; eventuais bloqueios de créditos ou acesso serão reportados, sem trocar novamente o modelo.
- Preservar os modelos suportados já usados na Voz do Cliente e na Análise do Churn.

## Detalhes técnicos e limites
- Centralizar as regras de filtro, datas e contribuição financeira em funções testáveis, utilizadas por `StripeConversions.tsx` e seus resumos/exports.
- Manter consultas completas e ordenação estável com `fetchAllPaged`; revisar também carregamentos auxiliares relevantes.
- Alterações de serviços ficam restritas às rotinas chamadas por este painel e ao contrato necessário para a migração autorizada da Auditoria IA.
- Não trocar a fonte desta tela para Metabase, alterar regras de Metas/Comissionamento, apagar conversões ou publicar o aplicativo.
- Registrar as decisões e requisitos confirmados ao entrar na implementação; nesta etapa nenhuma alteração de código ou dados será executada.