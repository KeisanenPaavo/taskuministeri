export interface Item {
  id: string;
  name: string;
  value: number; // milj. €
  desc: string;
}

export interface HistoryPoint {
  year: number;
  balance: number;
  balanceRatio: number;
  debt: number;
  debtRatio: number;
}

export interface FinanceData {
  generated: string;
  baseYear: number;
  cofogYear: number;
  population: number;
  gdp: number;
  wages: number;
  cashBenefits: number;
  revenueTotal: number;
  expenditureTotal: number;
  balance: number;
  debt: number;
  debtRatio: number;
  interest: number;
  revenue: Item[];
  expenditure: Item[];
  history: HistoryPoint[];
  sources: { name: string; url: string }[];
}
