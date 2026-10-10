// Päivän haaste: joka päivä kaikille sama talouspoliittinen pulma.
//
// Haaste arvotaan päivämäärästä (Suomen aikaa), joten kaikki saavat saman tehtävän
// ilman palvelinta. Tavoite asetetaan mallin avulla: generaattori käy läpi kaikki
// sallitut korttiyhdistelmät ja valitsee tavoitteen, joka on varmasti saavutettavissa.

import type { FinanceData } from "./types";
import { DEFAULT_SCENARIO, project, type Scenario } from "./model";

/** Ensimmäisen haasteen päivä (#1). */
const LAUNCH = "2026-10-10";
const MAX_MOVES = 4;
const CARD_COUNT = 7;
/** Helppo vaikeustaso: tavoite on tämä osuus parhaasta mahdollisesta parannuksesta. */
const DIFFICULTY = 0.5;

// ---------- Päivämäärät ----------

/** Päivämäärä muodossa YYYY-MM-DD Suomen aikaa. */
export function helsinkiDate(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

function dayIndex(date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${LAUNCH}T00:00:00Z`)) / 86_400_000);
}

export function challengeNumber(date: string) {
  return dayIndex(date) + 1;
}

export function dateOf(num: number) {
  return new Date(Date.parse(`${LAUNCH}T00:00:00Z`) + (num - 1) * 86_400_000).toISOString().slice(0, 10);
}

export function formatDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("fi-FI", { weekday: "short", day: "numeric", month: "numeric" }).format(d);
}

// ---------- Satunnaisuus ----------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Kortit ----------

export type CardKind = "tax" | "cut" | "growth";

export interface Card {
  id: string;
  kind: CardKind;
  emoji: string;
  name: string;
  patch: Partial<Scenario>;
  /** Lyhyt selitys kasvukorteille */
  note?: string;
}

const tax = (id: string, emoji: string, name: string, patch: Partial<Scenario>): Card => ({
  id,
  kind: "tax",
  emoji,
  name,
  patch,
});
const cut = (id: string, emoji: string, name: string, area: string, pct: number): Card => ({
  id,
  kind: "cut",
  emoji,
  name,
  patch: { spending: { [area]: -pct } },
});

export const CARDS: Card[] = [
  tax("vat05", "🛒", "ALV +0,5 %-yks.", { vatPp: 0.5 }),
  tax("vat1", "🛒", "ALV +1 %-yks.", { vatPp: 1 }),
  tax("income05", "💼", "Valtion tulovero +0,5 %-yks.", { incomeTaxPp: 0.5 }),
  tax("income1", "💼", "Valtion tulovero +1 %-yks.", { incomeTaxPp: 1 }),
  tax("corp2", "🏭", "Yhteisövero +2 %-yks.", { corporateTaxPp: 2 }),
  tax("excise10", "⛽", "Valmisteverot +10 %", { excisePct: 10 }),
  tax("excise20", "⛽", "Valmisteverot +20 %", { excisePct: 20 }),
  cut("admin10", "🏛️", "Hallinto −10 %", "admin", 10),
  cut("economy10", "🚆", "Elinkeinot ja liikenne −10 %", "economy", 10),
  cut("education5", "🎓", "Koulutus −5 %", "education", 5),
  cut("health5", "🏥", "Terveydenhuolto −5 %", "health", 5),
  cut("pensions2", "👵", "Eläkkeet ja vanhuspalvelut −2 %", "pensions", 2),
  cut("family10", "👶", "Perheet ja lapset −10 %", "family", 10),
  cut("unemployment10", "📋", "Työttömyysturva −10 %", "unemployment", 10),
  cut("otherSocial10", "🤝", "Asumistuki ym. sosiaaliturva −10 %", "otherSocial", 10),
  cut("culture20", "🎭", "Kulttuuri ja vapaa-aika −20 %", "culture", 20),
  cut("defence10", "🛡️", "Puolustus −10 %", "defence", 10),
  // Kasvukortit: vaikutus kertyy viiveellä. Työllisyys on kalibroitu VM:n arvioon
  // (10 000 työllistä ≈ 165 milj. €), T&K ja infra ovat havainnollistavia oletuksia.
  {
    id: "jobs",
    kind: "growth",
    emoji: "👷",
    name: "Työllisyysuudistus: +30 000 työllistä",
    patch: { growthBoosts: [{ pp: 0.1, from: 2, to: 4, employment: true }] },
    note: "Ei maksa mitään, mutta vaikutus alkaa vasta 2027. Lisätyöllisten verot vahvistavat taloutta suoraan.",
  },
  {
    id: "rnd",
    kind: "growth",
    emoji: "🔬",
    name: "T&K-rahoitus +0,5 mrd €",
    patch: { extraSpending: 500, growthBoosts: [{ pp: 0.08, from: 3 }] },
    note: "Maksaa heti, nostaa tuottavuutta vuodesta 2028. Julkiselle taloudelle tuotto tulee hitaasti.",
  },
  {
    id: "infra",
    kind: "growth",
    emoji: "🏗️",
    name: "Infrainvestoinnit +1 mrd €",
    patch: { extraSpending: 1000, growthBoosts: [{ pp: 0.12, from: 2 }] },
    note: "Maksaa heti, nostaa tuottavuutta vuodesta 2027. Julkiselle taloudelle tuotto tulee hitaasti.",
  },
];

/** Lisää muutokset skenaarioon. Vero- ja menomuutokset summautuvat. */
function withPatch(base: Scenario, p: Partial<Scenario>): Scenario {
  const s: Scenario = { ...base, spending: { ...base.spending } };
  s.vatPp += p.vatPp ?? 0;
  s.incomeTaxPp += p.incomeTaxPp ?? 0;
  s.corporateTaxPp += p.corporateTaxPp ?? 0;
  s.excisePct += p.excisePct ?? 0;
  for (const [k, v] of Object.entries(p.spending ?? {})) s.spending[k] = (s.spending[k] ?? 0) + v;
  s.extraSpending = (s.extraSpending ?? 0) + (p.extraSpending ?? 0);
  s.growthBoosts = [...(s.growthBoosts ?? []), ...(p.growthBoosts ?? [])];
  return s;
}

export function applyCards(base: Scenario, cards: Card[]): Scenario {
  return cards.reduce((s, c) => withPatch(s, c.patch), base);
}

// ---------- Teemat ----------

type Metric = "balance" | "debt";

interface Theme {
  id: string;
  emoji: string;
  name: string;
  intro: (d: FinanceData) => string;
  shock: Partial<Scenario>;
  /** Pakolliset muutokset, esim. vaalilupaus. */
  mandatory?: Partial<Scenario>;
  metric: Metric;
  pool: CardKind[];
  range?: boolean;
  /** Mittausvuosi ennusteessa (1 = ensimmäinen ennustevuosi). Oletus: saldo 2 v, velka 5 v. */
  horizon?: number;
}

// Viikonpäivän mukaan (0 = sunnuntai).
const THEMES: Record<number, Theme> = {
  1: {
    id: "rates",
    emoji: "📈",
    name: "Korkoshokki",
    intro: () => "Markkinat hermostuvat ja uuden velan korko nousee 5 prosenttiin.",
    shock: { interestRate: 5 },
    metric: "debt",
    pool: ["tax", "cut", "growth"],
  },
  2: {
    id: "cuts",
    emoji: "✂️",
    name: "Vain leikkauksia",
    intro: () => "Hallitus on luvannut, ettei veroja koroteta. Tasapaino on löydettävä menoista.",
    shock: {},
    metric: "balance",
    pool: ["cut"],
  },
  3: {
    id: "taxes",
    emoji: "🧾",
    name: "Vain veroja",
    intro: () => "Hallitus on luvannut, ettei palveluista leikata. Rahat on löydettävä veroista.",
    shock: {},
    metric: "balance",
    pool: ["tax"],
  },
  4: {
    id: "recession",
    emoji: "🌧️",
    name: "Taantuma",
    intro: () =>
      "Vienti hyytyy ja talous polkee paikallaan: kasvu on 0 % vuodessa. Ilman kasvua verotulot eivät kasva, mutta menot kasvavat.",
    shock: { realGrowth: 0 },
    metric: "debt",
    pool: ["tax", "cut", "growth"],
  },
  5: {
    id: "precision",
    emoji: "🎯",
    name: "Tarkkuuslaukaus",
    intro: () => "Liian iso sopeutus jarruttaa taloutta, liian pieni kasvattaa velkaa. Osu tarkasti.",
    shock: {},
    metric: "balance",
    pool: ["tax", "cut"],
    range: true,
  },
  6: {
    id: "promise",
    emoji: "🎁",
    name: "Vaalilupaus",
    intro: (d) => {
      const edu = d.expenditure.find((e) => e.id === "education")?.value ?? 0;
      return `Lupasit vaaleissa koulutukseen 6 % lisää eli noin ${(Math.round((edu * 0.06) / 100) / 10).toLocaleString("fi-FI")} mrd € vuodessa. Lupaus pidetään, mutta rahat on löydettävä muualta.`;
    },
    shock: {},
    mandatory: { spending: { education: 6 } },
    metric: "balance",
    pool: ["tax", "cut", "growth"],
  },
  0: {
    id: "growth",
    emoji: "🌱",
    name: "Kasvun vuosikymmen",
    intro: () =>
      "Tavoite on kymmenen vuoden päässä, joten kasvulla on aikaa vaikuttaa. Mutta mitkä kasvutoimet oikeasti vahvistavat julkista taloutta? Vertaa korttien aikajanoja.",
    shock: {},
    metric: "debt",
    pool: ["tax", "cut", "growth"],
    horizon: 10,
  },
};

// ---------- Salaiset bonusehdot ----------

interface Bonus {
  id: string;
  text: string;
  check: (cards: Card[]) => boolean;
}

const BONUSES: Bonus[] = [
  { id: "noTax", text: "Ei yhtään veronkorotusta", check: (c) => c.every((x) => x.kind !== "tax") },
  { id: "noCut", text: "Ei yhtään menoleikkausta", check: (c) => c.every((x) => x.kind !== "cut") },
  { id: "noEdu", text: "Koulutukseen ei kosketa", check: (c) => c.every((x) => x.id !== "education5") },
  { id: "noHealth", text: "Terveydenhuoltoon ei kosketa", check: (c) => c.every((x) => x.id !== "health5") },
  {
    id: "noSocial",
    text: "Sosiaaliturvaan ei kosketa",
    check: (c) => c.every((x) => !["family10", "unemployment10", "otherSocial10", "pensions2"].includes(x.id)),
  },
  { id: "noVat", text: "Arvonlisäveroon ei kosketa", check: (c) => c.every((x) => !x.id.startsWith("vat")) },
  { id: "twoMax", text: "Korkeintaan kaksi korttia", check: (c) => c.length <= 2 },
  { id: "growth", text: "Vähintään yksi kasvukortti", check: (c) => c.some((x) => x.kind === "growth") },
];

// ---------- Haaste ----------

export interface Challenge {
  number: number;
  date: string;
  theme: Theme;
  base: Scenario;
  cards: Card[];
  forbidden: string | null;
  maxMoves: number;
  metric: Metric;
  /** Mittarin vuosi (indeksi ennusteeseen) */
  yearIndex: number;
  year: number;
  /** Arvo, josta lähdetään (ilman kortteja) */
  start: number;
  /** Tavoite: balance >= min (ja <= max, jos väli); debt <= max */
  min?: number;
  max?: number;
  par: number;
  bonus: Bonus | null;
}

export function metricValue(d: FinanceData, c: Pick<Challenge, "base" | "metric" | "yearIndex">, cards: Card[]) {
  const r = project(d, applyCards(c.base, cards))[c.yearIndex];
  return c.metric === "balance" ? r.balanceRatio : r.debtRatio;
}

export function meetsTarget(c: Challenge, v: number) {
  if (c.metric === "debt") return v <= c.max!;
  return v >= c.min! && (c.max === undefined || v <= c.max);
}

function combos<T>(items: T[], max: number): T[][] {
  const out: T[][] = [[]];
  const rec = (start: number, acc: T[]) => {
    for (let i = start; i < items.length; i++) {
      const next = [...acc, items[i]];
      out.push(next);
      if (next.length < max) rec(i + 1, next);
    }
  };
  rec(0, []);
  return out;
}

/** Muuttaa mittarin "parempi on isompi" -muotoon. */
const goodness = (m: Metric, v: number) => (m === "balance" ? v : -v);

export function generateChallenge(d: FinanceData, num: number): Challenge {
  const date = dateOf(num);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const theme = THEMES[weekday];
  const rnd = mulberry32(num * 2654435761);

  const base = withPatch({ ...DEFAULT_SCENARIO, ...theme.shock, spending: {} }, theme.mandatory ?? {});

  // Korttivalikoima teeman mukaan
  const pool = CARDS.filter((c) => theme.pool.includes(c.kind));
  let cards: Card[];
  if (theme.pool.length > 1) {
    // Kasvun vuosikymmenessä kaikki kolme kasvukorttia, muissa sekateemoissa yksi.
    const nGrowth = theme.pool.includes("growth") ? (theme.id === "growth" ? 3 : 1) : 0;
    const nTax = nGrowth === 3 ? 2 : nGrowth === 1 ? 2 : 3;
    const pick = (kind: CardKind, n: number) =>
      shuffle(
        pool.filter((c) => c.kind === kind),
        rnd,
      ).slice(0, n);
    const growth = pick("growth", nGrowth);
    const taxes = pick("tax", nTax);
    const cuts = pick("cut", CARD_COUNT - nGrowth - nTax);
    cards = shuffle([...growth, ...taxes, ...cuts], rnd);
  } else {
    cards = shuffle(pool, rnd).slice(0, CARD_COUNT);
  }
  // Joka toisessa haasteessa yksi kortti on kielletty (rajoite)
  const forbidden = rnd() < 0.5 ? cards[Math.floor(rnd() * cards.length)].id : null;
  const allowed = cards.filter((c) => c.id !== forbidden);

  const metric = theme.metric;
  const yearIndex = (theme.horizon ?? (metric === "balance" ? 2 : 5)) - 1;
  const year = d.baseYear + yearIndex + 1;
  const partial = { base, metric, yearIndex };
  const start = metricValue(d, partial, []);
  const all = combos(allowed, MAX_MOVES).map((set) => ({ set, v: metricValue(d, partial, set) }));
  const best = Math.max(...all.map((x) => goodness(metric, x.v)));

  let min: number | undefined;
  let max: number | undefined;
  if (theme.range) {
    // Valitaan satunnainen 2–3 kortin ratkaisu ja rakennetaan sen ympärille 0,6 %-yks. väli.
    // Väli ei saa sisältää lähtötilannetta, joten valitaan selvästi parempia ratkaisuja.
    const mids = all.filter((x) => x.set.length >= 2 && x.set.length <= 3 && x.v - start > 0.8);
    const pick = mids[Math.floor(rnd() * mids.length)].v;
    min = Math.floor((pick - 0.3) * 10) / 10;
    max = Math.round((min + 0.6) * 10) / 10;
  } else {
    const gain = (best - goodness(metric, start)) * DIFFICULTY;
    const raw = goodness(metric, start) + gain;
    // Pyöristetään puolen prosenttiyksikön tarkkuuteen helpompaan suuntaan.
    if (metric === "balance") min = Math.floor(raw * 2) / 2;
    else max = Math.ceil(-raw * 2) / 2;
    // Jos pyöristys tekisi tavoitteesta valmiiksi saavutetun, käytetään tarkempaa arvoa.
    if (meetsTarget({ metric, min, max } as Challenge, start)) {
      if (metric === "balance") min = Math.ceil(raw * 10) / 10;
      else max = Math.floor(-raw * 10) / 10;
    }
  }

  const tmp = { metric, min, max } as Challenge;
  const solutions = all.filter((x) => x.set.length > 0 && meetsTarget(tmp, x.v));
  const par = Math.min(...solutions.map((x) => x.set.length));

  // Salainen bonus: saavutettavissa yhdessä tavoitteen ja par-siirtojen kanssa,
  // mutta ei automaattisesti totta (jokin ratkaisu rikkoo sen).
  const bonus =
    shuffle(BONUSES, rnd).find(
      (b) => solutions.some((x) => x.set.length === par && b.check(x.set)) && solutions.some((x) => !b.check(x.set)),
    ) ?? null;

  return {
    number: num,
    date,
    theme,
    base,
    cards,
    forbidden,
    maxMoves: MAX_MOVES,
    metric,
    yearIndex,
    year,
    start,
    min,
    max,
    par,
    bonus,
  };
}

/** Kortin vaikutus BKT:n tasoon (%) ennustevuonna index. */
export function cardGdpEffect(d: FinanceData, base: Scenario, card: Card, index = 9) {
  return (project(d, applyCards(base, [card]))[index].gdp / project(d, base)[index].gdp - 1) * 100;
}

/** Kortin oma vaikutus rahoitusasemaan (milj. €) ennustevuonna index (0 = ensimmäinen). */
export function cardEffect(d: FinanceData, base: Scenario, card: Card, index = 0) {
  return project(d, applyCards(base, [card]))[index].balance - project(d, base)[index].balance;
}

// ---------- Tähdet ja tallennus ----------

export interface Result {
  stars: number;
  target: boolean;
  parHit: boolean;
  bonusHit: boolean;
  cards: string[];
  value: number;
}

export function score(c: Challenge, cards: Card[], value: number): Result {
  const target = meetsTarget(c, value);
  const parHit = target && cards.length <= c.par;
  const bonusHit = target && (c.bonus ? c.bonus.check(cards) : true);
  return {
    stars: Number(target) + Number(parHit) + Number(bonusHit),
    target,
    parHit,
    bonusHit,
    cards: cards.map((x) => x.id),
    value,
  };
}

const KEY = "taskuministeri-daily";

export function loadResults(): Record<number, Result> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveResult(num: number, r: Result) {
  try {
    const all = loadResults();
    all[num] = r;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* tallennus ei käytettävissä (esim. yksityinen ikkuna) */
  }
}

/** Peräkkäiset päivät, joina haaste on ratkaistu (tänään tai eilen päättyen). */
export function streak(results: Record<number, Result>, today: number) {
  let n = results[today]?.target ? today : today - 1;
  let count = 0;
  while (results[n]?.target) {
    count++;
    n--;
  }
  return count;
}
