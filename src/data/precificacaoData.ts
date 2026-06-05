import { Produto, AppConfig } from '@/types/precificacao';

export const DEFAULT_CONFIG: AppConfig = {
  deductions: {
    impostos: 0.08,
    comissao: 0.10,
    gateway: 0.05,
    churn: 0.06,
  },
  markup: {
    premium: { target_margin: 0.30, label: 'Premium' },
    gold:    { target_margin: 0.20, label: 'Gold' },
    prata:   { target_margin: 0.10, label: 'Prata' },
  },
  base_deductions_for_markup: {
    impostos: 0.08,
    comissao: 0.10,
    gateway: 0.05,
    investimento: 0.06,
    comissao_comercial: 0.0134,
    despesa_fixa: 0.168212,
    churn: 0.06,
  },
};

export const DEFAULT_PRODUCTS: Produto[] = [
  { nome: 'BPO Financeiro Junior - 300 lançamentos',                              meses: 12, linha: 'Linha Gold',    custo: 428.39,   preco_mensal: 299,    preco_total: 3588,     ideal_mensal: 133.01   },
  { nome: 'BPO Financeiro Pleno - 301 a 600 lançamentos',                         meses: 12, linha: 'Linha Gold',    custo: 831.59,   preco_mensal: 399,    preco_total: 4788,     ideal_mensal: 258.20   },
  { nome: 'BPO Financeiro Senior - 601 a 900 lançamentos',                        meses: 12, linha: 'Linha Gold',    custo: 1234.78,  preco_mensal: 499,    preco_total: 5988,     ideal_mensal: 383.39   },
  { nome: 'BPO Financeiro Top - +901 lançamentos',                                meses: 12, linha: 'Linha Gold',    custo: 1637.97,  preco_mensal: 899,    preco_total: 10788,    ideal_mensal: 508.58   },
  { nome: 'Setup 3 meses Pleno',                                                  meses: 1,  linha: 'Linha Prata',   custo: 388.07,   preco_mensal: 399,    preco_total: 399,      ideal_mensal: 1053.44  },
  { nome: 'BPO Financeiro Pleno + Setup 3 meses',                                 meses: 12, linha: 'Linha Gold',    custo: 1194.46,  preco_mensal: 399,    preco_total: 4788,     ideal_mensal: 370.87   },
  { nome: 'Setup 3 meses Senior',                                                 meses: 1,  linha: 'Linha Prata',   custo: 614.87,   preco_mensal: 499,    preco_total: 499,      ideal_mensal: 1669.08  },
  { nome: 'BPO Financeiro Senior + Setup 3 meses',                                meses: 12, linha: 'Linha Gold',    custo: 1824.45,  preco_mensal: 499,    preco_total: 5988,     ideal_mensal: 566.48   },
  { nome: 'Setup 3 meses Top',                                                    meses: 1,  linha: 'Linha Prata',   custo: 977.74,   preco_mensal: 899,    preco_total: 899,      ideal_mensal: 2654.11  },
  { nome: 'BPO Financeiro Top + Setup 3 meses',                                   meses: 12, linha: 'Linha Gold',    custo: 2590.52,  preco_mensal: 899,    preco_total: 10788,    ideal_mensal: 804.34   },
  { nome: 'Time Financeiro Reunião Trimestral - 12x - BPO Pleno + Setup 3 meses', meses: 12, linha: 'Linha Gold',    custo: 1622.85,  preco_mensal: 799.90, preco_total: 9598.80,  ideal_mensal: 503.89   },
  { nome: 'Time Financeiro Reunião Trimestral - 12x - BPO Senior + Setup 3 meses',meses: 12, linha: 'Linha Gold',    custo: 2252.84,  preco_mensal: 899,    preco_total: 10788,    ideal_mensal: 699.50   },
  { nome: 'Time Financeiro Reunião Trimestral - 12x - BPO Top + Setup 3 meses',   meses: 12, linha: 'Linha Gold',    custo: 3018.91,  preco_mensal: 999,    preco_total: 11988,    ideal_mensal: 937.36   },
  { nome: 'Time Financeiro Reunião Trimestral - 6x - BPO Pleno + Setup 3 meses',  meses: 6,  linha: 'Linha Gold',    custo: 942.46,   preco_mensal: 799.90, preco_total: 4799.40,  ideal_mensal: 585.26   },
  { nome: 'Time Financeiro Reunião Trimestral - 6x - BPO Senior + Setup 3 meses', meses: 6,  linha: 'Linha Gold',    custo: 1370.86,  preco_mensal: 899,    preco_total: 5394,     ideal_mensal: 851.29   },
  { nome: 'Time Financeiro Reunião Trimestral - 6x - BPO Top + Setup 3 meses',    meses: 6,  linha: 'Linha Gold',    custo: 1935.33,  preco_mensal: 999,    preco_total: 5994,     ideal_mensal: 1201.82  },
  { nome: 'Time Financeiro Pacote de Reuniões - 12x - BPO Pleno + Setup 3 meses', meses: 12, linha: 'Linha Gold',    custo: 1572.45,  preco_mensal: 799.90, preco_total: 9598.80,  ideal_mensal: 488.24   },
  { nome: 'Time Financeiro Pacote de Reuniões - 12x - BPO Senior + Setup 3 meses',meses: 12, linha: 'Linha Gold',    custo: 2202.44,  preco_mensal: 899,    preco_total: 10788,    ideal_mensal: 683.85   },
  { nome: 'Time Financeiro Pacote de Reuniões - 12x - BPO Top + Setup 3 meses',   meses: 12, linha: 'Linha Gold',    custo: 2968.51,  preco_mensal: 999,    preco_total: 11988,    ideal_mensal: 921.71   },
  { nome: 'Time Financeiro Pacote de Reuniões - 6x - BPO Pleno + Setup 3 meses',  meses: 6,  linha: 'Linha Gold',    custo: 967.66,   preco_mensal: 799.90, preco_total: 4799.40,  ideal_mensal: 600.91   },
  { nome: 'Time Financeiro Pacote de Reuniões - 6x - BPO Senior + Setup 3 meses', meses: 6,  linha: 'Linha Gold',    custo: 1396.06,  preco_mensal: 899,    preco_total: 5394,     ideal_mensal: 866.94   },
  { nome: 'Time Financeiro Pacote de Reuniões - 6x - BPO Top + Setup 3 meses',    meses: 6,  linha: 'Linha Gold',    custo: 1960.53,  preco_mensal: 999,    preco_total: 5994,     ideal_mensal: 1217.47  },
];
