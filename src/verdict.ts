import { mrd, num, pct, perDay } from "./format";

// Simulaattorin "päätöstiedote": pelaajan ratkaisu kerrottuna muutamalla lauseella.
// Huumori tulee luvuista, ei ratkaisujen arvottamisesta: kaikki arkkityypit ovat yhtä sallittuja.

export interface Effect {
  label: string;
  /** Vaikutus julkiseen talouteen perusvuoden tasolla, milj. € (+ parantaa). */
  v: number;
  kind: "tax" | "spend";
}

export interface VerdictInput {
  effects: Effect[];
  growthDelta: number; // %-yks. oletuksesta
  interestDelta: number; // %-yks. oletuksesta
  population: number;
  year: number;
  debt: number; // velkasuhde viimeisenä vuonna, %
  baseDebt: number; // ilman muutoksia, %
  target: number; // nykyinen velkasuhde, %
  progress: number; // 0..1+ tavoitteesta
  /** Kuinka monta %-yks. velkasuhde olisi pienempi, jos talous kasvaisi 0,5 %-yks. nopeammin. */
  growthLesson: number;
}

export interface Verdict {
  title: string;
  lines: string[];
}

// Veronimet genetiivissä lauseeseen "… korotus".
const TAX_GENITIVE: Record<string, string> = {
  "Valtion tulovero": "valtion tuloveron",
  Arvonlisävero: "arvonlisäveron",
  Yhteisövero: "yhteisöveron",
  Valmisteverot: "valmisteverojen",
};

const COFFEE = 3; // €, sama kuin luvun 2 kahvivertailussa

/** Euroa päivässä asukasta kohden → arkinen vertaus kahvikupeissa viikossa. */
function coffees(millions: number, population: number) {
  const perWeek = ((Math.abs(millions) * 1e6) / population / 365) * 7;
  const cups = perWeek / COFFEE;
  return cups >= 0.95 ? `${num(cups, cups < 10 ? 1 : 0)} kahvikupillista viikossa` : `${num(perWeek, 2)} € viikossa`;
}

export function verdict(i: VerdictInput): Verdict {
  const taxGain = i.effects.filter((e) => e.kind === "tax").reduce((a, e) => a + e.v, 0);
  const spendGain = i.effects.filter((e) => e.kind === "spend").reduce((a, e) => a + e.v, 0);
  const policy = taxGain + spendGain;
  const tighten = Math.max(0, taxGain) + Math.max(0, spendGain);
  const biggest = [...i.effects].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  const reached = i.debt <= i.target + 0.05;

  let title: string;
  let closer: string;
  if (policy < -500) {
    title = "Lahjojen jakaja";
    closer = "Kansa kiittää nyt, korkolasku kiittää myöhemmin.";
  } else if (Math.abs(policy) < 300 && i.growthDelta >= 0.3) {
    title = "Kasvun optimisti";
    closer = `Koko suunnitelma nojaa siihen, että talous kasvaa ${num(i.growthDelta, 1)} %-yksikköä oletusta nopeammin. Peukut pystyyn.`;
  } else if (Math.abs(policy) < 300 && (i.interestDelta > 0.3 || i.growthDelta <= -0.3)) {
    title = "Huonon sään ministeri";
    closer = "Maailma muuttui, budjetti ei. Seuraavaksi kannattaa avata Verot- tai Menot-välilehti.";
  } else if (Math.abs(policy) < 300) {
    title = "Varovainen ministeri";
    closer = "Pienin askelin eteenpäin. Velka ei kysy, kuinka varovainen olit.";
  } else if (taxGain >= 0.7 * tighten) {
    title = "Verokarhu";
    closer = "Karhu heräsi talviuniltaan ja kävi kassalla.";
  } else if (spendGain >= 0.7 * tighten) {
    title = "Saksiministeri";
    closer = "Sakset kävivät. Jokaisella leikkauksella on joku, joka huomaa sen.";
  } else {
    title = "Kompromissien mestari";
    closer = "Vähän veroja, vähän leikkauksia. Kukaan ei ole täysin tyytyväinen, eli klassinen suomalainen ratkaisu.";
  }

  const lines: string[] = [];
  if (biggest) {
    const amount = mrd(Math.abs(biggest.v));
    const head =
      biggest.kind === "tax"
        ? `Suurin päätöksesi on ${TAX_GENITIVE[biggest.label] ?? biggest.label.toLowerCase()} ${biggest.v > 0 ? "korotus, joka tuo kassaan" : "kevennys, joka maksaa"} ${amount} vuodessa.`
        : `Suurin päätöksesi koskee menoerää ${biggest.label.toLowerCase()}: ${biggest.v > 0 ? "leikkaus säästää" : "lisäys maksaa"} ${amount} vuodessa.`;
    lines.push(
      `${head} ` +
        `Se on ${perDay(Math.abs(biggest.v), i.population)} jokaista suomalaista kohden, noin ${coffees(biggest.v, i.population)}.`,
    );
  }
  if (Math.abs(policy) >= 300) {
    lines.push(
      `Kaikkiaan päätöksesi ${policy > 0 ? "parantavat" : "heikentävät"} julkista taloutta ${mrd(Math.abs(policy))} vuodessa.`,
    );
  }
  if (reached) {
    const margin = i.target - i.debt;
    lines.push(
      margin < 2
        ? `Velka pysähtyy ${pct(i.debt, 0)}:iin vuonna ${i.year}. Täpärästi, mutta maali on maali.`
        : `Velka laskee ${pct(i.debt, 0)}:iin vuonna ${i.year}, ${num(margin, 0)} %-yksikköä alle nykytason.`,
    );
  } else if (i.progress < 0) {
    lines.push(
      `Velka nousee ${pct(i.debt, 0)}:iin vuonna ${i.year}, enemmän kuin ilman muutoksia (${pct(i.baseDebt, 0)}).`,
    );
  } else {
    lines.push(
      `Velka kasvaa yhä, mutta hitaammin: ${pct(i.debt, 0)} vuonna ${i.year}. Matkaa tavoitteeseen on ${num(Math.max(0, 1 - i.progress) * 100, 0)} %.`,
    );
  }
  // Talouskasvun merkitys: vertaa puolen prosenttiyksikön lisäkasvua pelaajan omiin päätöksiin.
  const ownEffect = i.baseDebt - i.debt;
  const lesson = num(i.growthLesson, 0);
  if (i.growthDelta >= 0.3) {
    lines.push(
      `Kasvu tekee tässä raskaan työn: jokainen puoli prosenttiyksikköä lisää kasvua pienentää velkaa noin ${lesson} %-yksikköä. Kasvua ei kuitenkaan säädetä liukusäätimellä, vaan se syntyy työllisyydestä, investoinneista ja tuottavuudesta.`,
    );
  } else if (i.growthDelta <= -0.3) {
    lines.push(
      `Hidas kasvu näkyy velassa nopeasti: puoli prosenttiyksikköä kasvussa tarkoittaa noin ${lesson} %-yksikköä velassa vuoteen ${i.year} mennessä.`,
    );
  } else if (ownEffect > 0.5 && i.growthLesson > ownEffect) {
    lines.push(
      `Vertailun vuoksi: jos talous kasvaisi vain 0,5 %-yksikköä nopeammin, velka olisi vuonna ${i.year} noin ${lesson} %-yksikköä pienempi. Se on enemmän kuin kaikki päätöksesi yhteensä (${num(ownEffect, 0)} %-yks.).`,
    );
  } else {
    lines.push(
      `Talouskasvulla on iso merkitys: jos talous kasvaisi 0,5 %-yksikköä nopeammin, velka olisi vuonna ${i.year} vielä noin ${lesson} %-yksikköä pienempi.`,
    );
  }
  if (tighten >= 1000 && i.growthDelta < 0.3) {
    lines.push(
      "Malli ei laske, miten veronkorotukset tai leikkaukset vaikuttavat kasvuun. Todellisuudessa ne voivat hidastaa sitä, ja silloin osa hyödystä katoaa.",
    );
  }
  lines.push(closer);
  return { title, lines };
}
