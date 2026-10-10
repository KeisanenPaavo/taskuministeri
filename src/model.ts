// Yksinkertainen, läpinäkyvä julkisen talouden ennustemalli.
//
// Periaatteet:
//  - Verotulot kasvavat samaa tahtia kuin nimellinen BKT (reaalikasvu + inflaatio).
//  - Menot (pl. korot) kasvavat inflaation verran ja lisäksi "luontaisen menokasvun"
//    verran (ikääntyminen, palvelutarve). Ne EIVÄT automaattisesti seuraa talouskasvua,
//    joten nopeampi kasvu parantaa taloutta ja hitaampi heikentää.
//  - Velasta erääntyy ja uusitaan vuosittain noin viidesosa, joten korkojen nousu
//    siirtyy korkomenoihin vähitellen.
//  - Veromuutoksilla on käyttäytymisvaikutus: osa staattisesta tuotosta katoaa,
//    kun ihmiset ja yritykset sopeutuvat.

import type { FinanceData } from "./types";

export interface Scenario {
  realGrowth: number; // %/v
  inflation: number; // %/v
  interestRate: number; // uuden velan korko, %
  incomeTaxPp: number; // ansiotuloveron keskimääräinen muutos, %-yks.
  vatPp: number; // ALV:n yleinen verokanta, muutos %-yks.
  corporateTaxPp: number; // yhteisöveron kanta, muutos %-yks.
  excisePct: number; // valmisteverojen muutos, %
  spending: Record<string, number>; // menoluokan muutos, %
  spendingTrend: number; // menojen luontainen reaalikasvu, %/v
  behavioral: boolean; // huomioidaanko käyttäytymisvaikutukset
}

export const DEFAULT_SCENARIO: Scenario = {
  realGrowth: 1.2,
  inflation: 2.0,
  interestRate: 3.0,
  incomeTaxPp: 0,
  vatPp: 0,
  corporateTaxPp: 0,
  excisePct: 0,
  spending: {},
  spendingTrend: 1.2,
  behavioral: true,
};

export const YEARS = 10;
/** Osuus velasta, joka uusitaan vuosittain uuteen korkoon (~ 1 / keskimaturiteetti). */
export const ROLLOVER = 0.2;
export const VAT_GENERAL_RATE = 25.5;
export const CORPORATE_RATE = 20;
/** Osuus ALV-tuotosta, joka kertyy yleisestä verokannasta (loput alennetuista kannoista). */
export const VAT_GENERAL_SHARE = 0.75;
/** Käyttäytymisvaikutus: osuus staattisesta tuotosta, joka menetetään. */
export const BEHAVIOR = { incomeTax: 0.3, vat: 0.1, corporateTax: 0.35, excise: 0.2 };

/** Ansiotuloveropohja: palkat + verotettavat etuudet (karkea arvio). */
export function incomeTaxBase(d: FinanceData) {
  return d.wages + 0.6 * d.cashBenefits;
}

const rev = (d: FinanceData, id: string) => d.revenue.find((r) => r.id === id)?.value ?? 0;

/** Veromuutosten vaikutus perusvuoden tasolla, milj. € (positiivinen = lisää tuloja). */
export function taxEffects(d: FinanceData, s: Scenario) {
  const b = (k: keyof typeof BEHAVIOR) => (s.behavioral ? 1 - BEHAVIOR[k] : 1);
  return {
    incomeTax: (s.incomeTaxPp / 100) * incomeTaxBase(d) * b("incomeTax"),
    vat: ((rev(d, "vat") * VAT_GENERAL_SHARE) / VAT_GENERAL_RATE) * s.vatPp * b("vat"),
    corporateTax: (rev(d, "corporateTax") / CORPORATE_RATE) * s.corporateTaxPp * b("corporateTax"),
    excise: (s.excisePct / 100) * rev(d, "excise") * b("excise"),
  };
}

/** Menomuutosten vaikutus perusvuoden tasolla, milj. € (positiivinen = lisää menoja). */
export function spendingEffects(d: FinanceData, s: Scenario) {
  const out: Record<string, number> = {};
  for (const e of d.expenditure) {
    out[e.id] = ((s.spending[e.id] ?? 0) / 100) * e.value;
  }
  return out;
}

export interface YearResult {
  year: number;
  gdp: number;
  revenue: number;
  primary: number;
  interest: number;
  balance: number;
  balanceRatio: number;
  debt: number;
  debtRatio: number;
  effectiveRate: number;
}

export function project(d: FinanceData, s: Scenario): YearResult[] {
  const tax = taxEffects(d, s);
  const spend = spendingEffects(d, s);
  const taxDelta = Object.values(tax).reduce((a, b) => a + b, 0);
  const spendDelta = Object.values(spend).reduce((a, b) => a + b, 0);

  const prevDebt = d.history[d.history.length - 2]?.debt ?? d.debt;
  let rate = d.interest / prevDebt; // toteutunut keskikorko
  let gdp = d.gdp;
  let debt = d.debt;
  // Muutokset suhteutetaan BKT:hen, jotta ne kasvavat talouden mukana.
  const revenueShare = (d.revenueTotal + taxDelta) / d.gdp;
  const basePrimary = d.expenditureTotal - d.interest + spendDelta;

  const g = s.realGrowth / 100;
  const p = s.inflation / 100;
  const i = s.interestRate / 100;
  const trend = s.spendingTrend / 100;

  const out: YearResult[] = [];
  for (let t = 1; t <= YEARS; t++) {
    gdp *= (1 + g) * (1 + p);
    const revenue = revenueShare * gdp;
    const primary = basePrimary * Math.pow((1 + p) * (1 + trend), t);
    const blended = (1 - ROLLOVER) * rate + ROLLOVER * i;
    const interest = debt * blended;
    const balance = revenue - primary - interest;
    const newDebt = Math.max(debt - balance, 0);
    // Uusi lainanotto tehdään uuteen korkoon.
    rate = newDebt > 0 ? (debt * blended + Math.max(newDebt - debt, 0) * i) / newDebt : blended;
    debt = newDebt;
    out.push({
      year: d.baseYear + t,
      gdp,
      revenue,
      primary,
      interest,
      balance,
      balanceRatio: (balance / gdp) * 100,
      debt,
      debtRatio: (debt / gdp) * 100,
      effectiveRate: rate * 100,
    });
  }
  return out;
}
