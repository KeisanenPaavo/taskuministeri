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

/** Arvot miljoonina euroina; null, jos maalta puuttuu tieto. */
export type MaybeByCountry = Record<CountryCode, number | null>;

export interface CompareRow {
  id?: string;
  name: string;
  values: MaybeByCountry;
  /** Aikasarja vuodesta CompareData.from vertailuvuoteen asti. */
  hist: Record<CountryCode, (number | null)[]>;
  parts: CompareRow[];
}

export interface CompareGroup {
  id: string;
  title: string;
  year: number;
  hint: string;
  rows: CompareRow[];
}

export interface CompareData {
  /** Aikasarjojen alkuvuosi. */
  from: number;
  /** Vuosittain BKT (milj. €) ja väkiluku muunnoksia varten. */
  scale: Record<string, { gdp: ByCountry; pop: ByCountry }>;
  groups: CompareGroup[];
}

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
  compare: CompareData;
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
