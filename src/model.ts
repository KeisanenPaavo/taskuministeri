// Yksinkertainen, läpinäkyvä julkisen talouden ennustemalli.
//
// Periaatteet:
//  - Verotulot kasvavat samaa tahtia kuin nimellinen BKT (reaalikasvu + inflaatio).
//  - Menot (pl. korot) kasvavat inflaation verran ja lisäksi "luontaisen menokasvun"
//    verran (ikääntyminen, palvelutarve). Jos talous kasvaa oletusta nopeammin tai
//    hitaammin, menot seuraavat erotusta puoliksi vuoden viiveellä (palkat ja osin
//    eläkkeet seuraavat ansiokehitystä). Siksi kasvu parantaa taloutta heti, mutta
//    pitkällä aikavälillä vähemmän kuin lyhyellä.
//  - Velasta uusitaan vuosittain noin viidesosa, joten korkojen nousu siirtyy
//    korkomenoihin vähitellen.
//  - Veromuutosten tuotot on kalibroitu valtiovarainministeriön vaikutusarvioihin.
//    Käyttäytymisvaikutus vie osan staattisesta tuotosta.
//
// Kaikki kertoimet lähteineen ovat alla COEFFICIENTS-listassa, joka näytetään myös sivulla.

import type { FinanceData } from "./types";

export interface Scenario {
  realGrowth: number; // %/v
  inflation: number; // %/v
  interestRate: number; // uuden velan korko, %
  incomeTaxPp: number; // valtion ansiotuloveroasteikon kaikkien portaiden muutos, %-yks.
  vatPp: number; // ALV:n yleinen verokanta, muutos %-yks.
  corporateTaxPp: number; // yhteisöveron kanta, muutos %-yks.
  excisePct: number; // valmisteverojen muutos, %
  spending: Record<string, number>; // menoluokan muutos, %
  spendingTrend: number; // menojen luontainen reaalikasvu, %/v
  behavioral: boolean; // huomioidaanko käyttäytymisvaikutukset
  /** Kasvutoimien lisäkasvu (%-yks.) ennustevuosina from..to (1 = ensimmäinen ennustevuosi). */
  growthBoosts?: GrowthBoost[];
  /** Lisämenot perusvuoden euroissa (milj. €), kasvavat muiden menojen tahdissa. */
  extraSpending?: number;
}

export interface GrowthBoost {
  pp: number;
  from: number;
  to?: number;
  /** Työllisyydestä syntyvä kasvu ei nosta palkkatasoa, joten menot eivät seuraa sitä. */
  employment?: boolean;
}

export const DEFAULT_SCENARIO: Scenario = {
  realGrowth: 1.2,
  inflation: 2.0,
  interestRate: 2.7,
  incomeTaxPp: 0,
  vatPp: 0,
  corporateTaxPp: 0,
  excisePct: 0,
  spending: {},
  spendingTrend: 1.2,
  behavioral: true,
};

export const YEARS = 10;
export const VAT_GENERAL_RATE = 25.5;
export const CORPORATE_RATE = 20;

/** Osuus oletuksesta poikkeavasta kasvusta, joka siirtyy menoihin vuoden viiveellä. */
export const GROWTH_PASS_THROUGH = 0.5;

/** Osuus velasta, joka hinnoitellaan vuosittain uudelleen (1 / uudelleenhinnoitteluaika 5,4 v). */
export const ROLLOVER = 0.185;

/**
 * Valtion ansiotuloveroasteikon +1 %-yks. kaikkiin portaisiin tuottaa staattisesti
 * noin 1,2 mrd € (VM 2023). Suhteutettuna vuoden 2023 kotitalouksien tuloveroihin
 * (34,8 mrd €) se on 3,45 % tuloverojen kertymästä.
 */
export const INCOME_TAX_PER_PP = 1200 / 34788;

/**
 * ALV:n yleisen kannan korotus 24 -> 25,5 % (HE 61/2024): staattisesti 1 167 milj. €
 * vuoden 2025 tasolla. Kun mukaan lasketaan julkisen sektorin omiin ostoihin sisältyvä
 * ALV, nettotuotto on 1 031 milj. €. Kysyntävaikutuksen jälkeen 956 milj. €.
 */
export const VAT_PER_PP = 1167 / 1.5 / 27108; // osuus ALV-tuotosta per %-yks. (2025)
export const VAT_PUBLIC_PURCHASES = 1 - 1031 / 1167; // ≈ 11,7 % palaa julkisille menoille

/** Käyttäytymisvaikutus: osuus (netto)tuotosta, joka menetetään. */
export const BEHAVIOR = {
  incomeTax: 0.25,
  vat: 1 - 956 / 1031, // ≈ 7,3 % (HE 61/2024)
  corporateTax: 0.4, // VM 2026: itserahoittavuus 34–46 %
  excise: 0.15,
};

export interface Coefficient {
  name: string;
  value: string;
  source: string;
  url?: string;
  own?: boolean;
}

/** Kertoimet ja niiden lähteet, näytetään sivun alalaidassa. */
export const COEFFICIENTS: Coefficient[] = [
  {
    name: "Valtion tuloveroasteikko +1 %-yks.",
    value: "≈ 1,2 mrd € staattisesti (2023 tasolla), skaalattu verokertymän mukana",
    source: "VM, Verokartoitus 2023 (via Verotutkimus.fi FIT #10/2026)",
    url: "https://verotutkimus.fi/tuloverotus-tarkea-veroinstrumentti/",
  },
  {
    name: "Tuloveron käyttäytymisvaikutus",
    value: "25 % staattisesta tuotosta",
    source:
      "Oma arvio tutkimuskirjallisuuden joustoista: keskituloiset 0–0,2, suurituloisimmat 0,4–0,5 (Verotutkimus.fi FIT #10/2026)",
    url: "https://verotutkimus.fi/tuloverotus-tarkea-veroinstrumentti/",
    own: true,
  },
  {
    name: "ALV:n yleinen kanta +1 %-yks.",
    value: "≈ 0,78 mrd € staattisesti, ≈ 0,69 mrd € kun julkisen sektorin omat ALV-menot vähennetään",
    source: "HE 61/2024 vp (ALV 24 → 25,5 %: 1 167 / 1 031 milj. €)",
    url: "https://www.eduskunta.fi/pdf/HE+61/2024",
  },
  {
    name: "ALV:n kysyntävaikutus",
    value: "7 % nettotuotosta (956 / 1 031 milj. €)",
    source: "HE 61/2024 vp",
    url: "https://www.eduskunta.fi/pdf/HE+61/2024",
  },
  {
    name: "Yhteisöverokanta ±1 %-yks.",
    value: "Tuotto / 20 %. VM:n arvio: −2 %-yks. = −832 milj. € staattisesti",
    source: "VM tiedote 28.4.2026",
    url: "https://vm.fi/-/yhteisoveroa-ehdotetaan-alennettavaksi-kahdella-prosenttiyksikolla",
  },
  {
    name: "Yhteisöveron itserahoittavuus",
    value: "40 % (VM:n haarukka 34–46 %, pitkä aikaväli)",
    source: "VM:n vaikutusarvio 2026, Yle 2026",
    url: "https://yle.fi/a/74-20226947",
  },
  {
    name: "Valmisteverojen käyttäytymisvaikutus",
    value: "15 %",
    source: "Oma arvio: kysynnän hintajousto noin −0,2…−0,3, vero noin puolet hinnasta",
    own: true,
  },
  {
    name: "Velan uudelleenhinnoittelu",
    value: "18,5 % velasta vuodessa",
    source: "Valtiokonttori: keskimääräinen uudelleenhinnoitteluaika 5,39 v (2025), kuoletukset 29,5 mrd €",
    url: "https://cdn.valtiokonttori.fi/wordpress/sites/18/2026/02/Valtion_velanhallinnan_vuosikatsaus_2025.pdf",
  },
  {
    name: "Uuden lainanoton korko (oletus)",
    value: "2,7 %",
    source:
      "Valtiokonttori: 10 v korko 3,16 % (2025 loppu), lyhyet velkasitoumukset ~2 % (EKP:n talletuskorko), velkasitoumusten osuus lainanotosta ~40 %",
    url: "https://cdn.valtiokonttori.fi/wordpress/sites/18/2026/02/Valtion_velanhallinnan_vuosikatsaus_2025.pdf",
  },
  {
    name: "Talouskasvun vaikutus rahoitusasemaan",
    value:
      "Ensimmäisenä vuonna ≈ 0,56 (menot / BKT). Sen jälkeen menot seuraavat oletuksesta poikkeavaa kasvua 50 %:sti vuoden viiveellä (oma oletus: palkat ja osin eläkkeet seuraavat ansiokehitystä)",
    source: "Vertailu: VTV:n arvio Suomen budjettijoustosta noin 0,5, EU-komission hieman korkeampi",
    url: "https://vtv.fi/en/report/automatic-fiscal-stabilizers-in-finland-1993-2021/",
  },
  {
    name: "Työllisyysuudistus (päivän haaste)",
    value:
      "10 000 lisätyöllistä ≈ +165 milj. € vuodessa, vaikutus kertyy 3 vuodessa. Työllisyyden kasvu ei nosta palkkatasoa, joten menot eivät seuraa sitä.",
    source: "VM 2020: yli 55-vuotiaiden työllisyystoimet, 10 000 työllistä vahvisti julkista taloutta noin 165 milj. €",
    url: "https://valtioneuvosto.fi/-/10623/valtiovarainministerio-julkaisee-arvionsa-yli-55-vuotiaiden-tyollisyytta-parantavista-toimista",
  },
  {
    name: "T&K- ja infrainvestointien kasvuvaikutus (päivän haaste)",
    value:
      "T&K +0,5 mrd € → tuottavuuskasvu +0,08 %-yks./v vuodesta 2028; infra +1 mrd € → +0,12 %-yks./v vuodesta 2027. Ne nostavat BKT:tä, mutta eivät mallissa maksa itseään takaisin julkiselle taloudelle 10 vuodessa.",
    source: "Havainnollistava oletus: todellisesta tuotosta ei ole yksiselitteistä arviota",
    own: true,
  },
  {
    name: "Menojen luontainen kasvu",
    value: "1,2 % vuodessa inflaation lisäksi",
    source: "Oma oletus (väestön ikääntyminen ja palvelutarve), säädettävissä",
    own: true,
  },
];

const rev = (d: FinanceData, id: string) => d.revenue.find((r) => r.id === id)?.value ?? 0;

/** Staattinen tuotto (milj. €) yhden %-yksikön muutokselle, ennen käyttäytymisvaikutuksia. */
export function perPointStatic(d: FinanceData) {
  return {
    incomeTax: INCOME_TAX_PER_PP * rev(d, "incomeTax"),
    vat: VAT_PER_PP * rev(d, "vat") * (1 - VAT_PUBLIC_PURCHASES),
    corporateTax: rev(d, "corporateTax") / CORPORATE_RATE,
  };
}

/** Veromuutosten vaikutus perusvuoden tasolla, milj. € (positiivinen = lisää tuloja). */
export function taxEffects(d: FinanceData, s: Scenario) {
  const b = (k: keyof typeof BEHAVIOR) => (s.behavioral ? 1 - BEHAVIOR[k] : 1);
  const pp = perPointStatic(d);
  return {
    incomeTax: pp.incomeTax * s.incomeTaxPp * b("incomeTax"),
    vat: pp.vat * s.vatPp * b("vat"),
    corporateTax: pp.corporateTax * s.corporateTaxPp * b("corporateTax"),
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
  const basePrimary = d.expenditureTotal - d.interest + spendDelta + (s.extraSpending ?? 0);

  const g = s.realGrowth / 100;
  const p = s.inflation / 100;
  const i = s.interestRate / 100;
  const trend = s.spendingTrend / 100;

  const gRef = DEFAULT_SCENARIO.realGrowth / 100;
  let followGrowth = 1; // menojen kertynyt sopeutuminen poikkeavaan kasvuun
  let prevGrowth = gRef;

  const out: YearResult[] = [];
  for (let t = 1; t <= YEARS; t++) {
    const active = (s.growthBoosts ?? []).filter((b) => t >= b.from && t <= (b.to ?? YEARS));
    const boost = active.reduce((a, b) => a + b.pp / 100, 0);
    const jobsBoost = active.filter((b) => b.employment).reduce((a, b) => a + b.pp / 100, 0);
    gdp *= (1 + g + boost) * (1 + p);
    const revenue = revenueShare * gdp;
    followGrowth *= 1 + GROWTH_PASS_THROUGH * (prevGrowth - gRef);
    prevGrowth = g + boost - jobsBoost;
    const primary = basePrimary * Math.pow((1 + p) * (1 + trend), t) * followGrowth;
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
