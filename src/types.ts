export interface Part {
  name: string;
  value: number; // milj. €
}

export interface Item {
  id: string;
  name: string;
  value: number; // milj. €
  desc: string;
  parts?: Part[];
}

export interface HistoryPoint {
  year: number;
  balance: number;
  balanceRatio: number;
  debt: number;
  debtRatio: number;
}

export type CountryCode = "FI" | "SE" | "EE";
export type ByCountry = Record<CountryCode, number>;

export interface NeighborData {
  source: string;
  countries: { code: CountryCode; name: string }[];
  mainYear: number;
  taxYear: number;
  cofogYear: number;
  main: { expenditure: ByCountry; revenue: ByCountry; balance: ByCountry; interest: ByCountry; tax: ByCountry };
  cofog: { id: string; name: string; values: ByCountry }[];
  social: { id: string; name: string; values: ByCountry }[];
  debt: ({ year: number } & ByCountry)[];
  sources: { name: string; url: string }[];
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
  neighbors: NeighborData;
  sources: { name: string; url: string }[];
}
