

# Forecast & Análise de Cenário — Plano de Implementação

## Resumo

Criar uma nova página **Forecast** acessível via sidebar (admin), com três seções principais inspiradas nos prints: **Taxas de Conversão por Etapa**, **Quanto Você Precisa para Bater a Meta**, e **Análise de Cenário com Recomendações Inteligentes**.

---

## O que será construído

### 1. Nova página `src/pages/Forecast.tsx`

Página completa com três blocos:

**Bloco A — Taxas de Conversão por Etapa**
- Tabela visual mostrando cada transição do funil:
  - Prospecções → Respostas
  - Respostas → Agendamento
  - Agendamento → Reunião Confirmada
  - Reunião Confirmada → Comparecimento (usar `reuniao_executada` como proxy)
  - Comparecimento → Conversão (fechado_won)
- Duas colunas por linha: **Taxa Atual** (calculada dos dados reais) e **Benchmark SaaS** (defaults do mercado)
- Quando não há dados suficientes, usa apenas o benchmark. Quando há dados, mostra ambos com indicador visual (verde se acima do bench, vermelho se abaixo)
- Campo editável para o admin ajustar os benchmarks

**Bloco B — Quanto Você Precisa para Bater a Meta**
(inspirado no print 1)
- Cards mostrando:
  - MQLs SDR necessários: atual → necessário
  - MQLs Seller necessários: atual → necessário
  - Total leads tráfego (base+novos): atual → necessário
- Cálculo reverso: pega a meta de MRR/deals, aplica as taxas de conversão de trás pra frente para calcular quantos leads são necessários em cada etapa do topo de funil

**Bloco C — Análise de Cenário & Recomendações**
(inspirado no print 2)
- Aproveitamento de capacidade: barra mostrando SDR X/Y MQLs, Seller X/Y, Closer X/Y calls
- Identifica o gargalo principal (etapa com pior conversão relativa ao benchmark)
- Gera recomendações automáticas baseadas em regras:
  - Se taxa de resposta está baixa → "Revise a cadência de prospecção ou invista em aquisição de leads mais qualificados"
  - Se agendamento está baixo → "Melhore o script de abordagem ou contrate mais SDRs"
  - Se comparecimento está baixo → "Implemente confirmações automáticas e lembretes"
  - Se conversão está baixa → "Revise a proposta comercial ou treine closers"
  - Se capacidade SDR está no limite → "Contrate mais um SDR"
  - Se há leads sobrando → "Oportunidade: aumente leads sem precisar contratar"

### 2. Benchmarks SaaS padrão (`src/lib/constants.ts`)

Adicionar constantes de benchmark de mercado SaaS:

```
SAAS_BENCHMARKS = {
  prospeccao_resposta: 0.10,      // 10% outbound, 25% inbound
  resposta_agendamento: 0.25,     // 25%
  agendamento_comparecimento: 0.70, // 70%
  comparecimento_conversao: 0.30,  // 30%
}
```

Mapeamento dos stages do DB para essas transições:
- novo_lead → contato_realizado = Prospecção → Resposta
- contato_realizado → diagnostico = Resposta → Agendamento
- diagnostico → proposta_enviada = Agendamento → Comparecimento
- proposta_enviada/negociacao → fechado_won = Comparecimento → Conversão

### 3. Componentes novos

- `src/components/forecast/ConversionRates.tsx` — tabela de taxas por etapa (atual vs bench)
- `src/components/forecast/GapToGoal.tsx` — cards "quanto falta" com cálculo reverso
- `src/components/forecast/ScenarioAnalysis.tsx` — capacidade + recomendações inteligentes

### 4. Rota e sidebar

- Adicionar rota `/forecast` no `App.tsx` (admin only)
- Adicionar item "Forecast" no sidebar com ícone `TrendingUp`

---

## Detalhes técnicos

- Dados calculados a partir das tabelas existentes (`leads`, `activities`, `goals`, `profiles`) — sem novas tabelas
- Taxas reais: contagem de leads que avançaram de stage X para stage Y no período atual
- Cálculo reverso do Gap to Goal: `meta_deals / taxa_conversao / taxa_comparecimento / taxa_agendamento / taxa_resposta = leads_necessarios_topo`
- Recomendações são rule-based: compara cada taxa atual com o benchmark e identifica o maior desvio como gargalo principal

