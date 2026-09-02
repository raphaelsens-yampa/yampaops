# Engajamento CS — nova tela com embed do app do Google

Sim, é possível. O item entra no grupo CX logo abaixo de "Auditoria IA" e a tela exibe o app do Apps Script dentro de um iframe.

## O que será feito

1. Nova página `src/pages/CsEngagement.tsx` na rota `/atendimentos/engajamento-cs`:
   - Cabeçalho "Engajamento CS" com botões "Recarregar" e "Abrir em nova aba".
   - Iframe em tela cheia (altura calculada) com o app do Apps Script.
   - Aviso amigável caso o conteúdo não carregue, com link direto para abrir fora do sistema.
2. Rota registrada em `src/App.tsx`, protegida como as demais.
3. Item "Engajamento CS" no sidebar (grupo CX), imediatamente abaixo de "Auditoria IA".
4. Nova chave de acesso `engajamento_cs` na Gestão de Nível de Acessos, para controlar quem enxerga a seção.

## Duas ressalvas importantes sobre o embed

- **Login Google:** o app é restrito ao domínio yampa.com.br. Só carrega para quem estiver logado com a conta Google da empresa no mesmo navegador; caso contrário aparece a tela de login do Google dentro do quadro.
- **Permissão de incorporação:** por padrão, o Apps Script bloqueia ser exibido em sites de terceiros. Para o iframe funcionar, é preciso adicionar no script, no retorno do `doGet`:

```text
.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
```

e reimplantar o Web App. Sem isso, o navegador recusa a exibição e a tela mostrará o aviso com o botão "Abrir em nova aba".

Implemento a tela do jeito acima; se o embed for bloqueado, basta o ajuste no script para passar a renderizar.
