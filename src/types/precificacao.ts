export type LinhaMarkup = 'Linha Premium' | 'Linha Gold' | 'Linha Prata';

export interface Produto {
  nome: string;
  meses: number;
  linha: LinhaMarkup;
  custo: number;
  preco_mensal: number;
  preco_total: number;
  ideal_mensal: number;
}

export interface DeducoesConfig {
  impostos: number;
  comissao: number;
  gateway: number;
  churn: number;
}

export interface MarkupLineConfig {
  target_margin: number;
  label: string;
}

export interface BaseDeducoesMarkup {
  impostos: number;
  comissao: number;
  gateway: number;
  investimento: number;
  comissao_comercial: number;
  despesa_fixa: number;
  churn: number;
}

export interface AppConfig {
  deductions: DeducoesConfig;
  markup: {
    premium: MarkupLineConfig;
    gold: MarkupLineConfig;
    prata: MarkupLineConfig;
  };
  base_deductions_for_markup: BaseDeducoesMarkup;
}

export interface PropostaForm {
  clientName: string;
  clientCompany: string;
  date: string;
  validity: number;
  consultant: string;
  discount: number;
  payment: string;
  notes: string;
}

export type FilterMode = 'todos' | 'bom' | 'abaixo' | 'bpo' | 'time' | 'setup';
