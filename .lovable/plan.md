# Regras de comissionamento como aba

Sim, a tela existe: `CommissionSettings` (regras globais de comissionamento). Hoje ela está órfã — não há rota no roteador nem item no menu, então ninguém consegue abri-la pela interface. Além dela, a aba "Referência" já existente cobre os percentuais por plano/periodicidade.

## O que fazer

1. Transformar `CommissionSettings` em componente de painel (sem `Layout` e sem título próprio de página), preservando todos os campos atuais:
   - Base da comissão (líquido/bruto), mês de pagamento T+N, dia de pagamento, meses de garantia, gap de reativação.
   - Elegibilidade por tipo: nova venda, reativação, upsell, renovação, downgrade.
   - Multiplicadores por tipo e base de upsell (delta ou total).
   - Estorno por churn (clawback) ligado/desligado.
   - Tabelas auxiliares que ela já renderiza: precificação de produtos e gatilhos de comissão.
2. Adicionar a aba "Regras" na tela de Comissionamento, visível apenas para administradores, posicionada antes de "Referência".
3. Manter o comportamento de salvar em uma única linha de configuração, com feedback de sucesso/erro.

## Detalhes técnicos

- Extrair o conteúdo de `src/pages/CommissionSettings.tsx` para `src/components/comissionamento/CommissionRulesPanel.tsx`, removendo o wrapper `Layout` e o cabeçalho da página.
- Em `src/pages/Comissionamento.tsx`: novo `TabsTrigger value="rules"` (admin) e `TabsContent` correspondente renderizando o painel.
- Remover o arquivo de página órfão para não deixar duas fontes da mesma UI.
- Nenhuma mudança de banco de dados; segue lendo e gravando `commission_settings`.
