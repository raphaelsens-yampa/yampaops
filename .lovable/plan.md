# Corrigir a opção "Personalizado" no Cenário de crescimento

## O que deveria acontecer

Ao escolher **Personalizado…**, o seletor deve permanecer nesse modo e abrir um campo de % ao lado, onde o usuário digita o crescimento mensal desejado (ex.: 7,5%). Só depois de digitar um valor válido as metas são recalculadas; enquanto o campo está vazio, as metas seguem as cadastradas, mas o seletor continua exibindo "Personalizado…".

## Por que hoje não funciona

O modo exibido no seletor é derivado apenas do percentual atual. Ao clicar em "Personalizado…" com o campo vazio, o percentual aplicado é 0 — que é exatamente o valor do preset "Cadastrado (1% a.m.)" — então o seletor volta sozinho para "Cadastrado" e o campo de % nunca aparece.

## Como corrigir

- Guardar o modo escolhido ("preset" ou "personalizado") como estado próprio do componente, em vez de inferi-lo do percentual.
- Ao selecionar "Personalizado…": manter o modo, exibir o campo de % já focado e não alterar o cenário até haver um número válido.
- Aceitar vírgula ou ponto como separador decimal, ignorar valores negativos/não numéricos e limitar a um máximo razoável (ex.: 100% a.m.).
- Sair do modo personalizado só quando o usuário escolher um preset.
- Quando o cenário salvo no navegador não for um dos presets (ex.: 7,5% de uma sessão anterior), abrir já em modo personalizado com o valor preenchido.
- O badge "Cenário X% · simulação" continua aparecendo apenas quando há percentual válido aplicado.

## Detalhes técnicos

Alteração restrita a `src/components/goals/GoalScenarioSelector.tsx` (estado de modo + validação do input). Nenhuma mudança em `src/lib/goalScenario.ts`, no hook de persistência ou no banco.
