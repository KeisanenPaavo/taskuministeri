const nf = (digits: number) =>
  new Intl.NumberFormat("fi-FI", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const f0 = nf(0);
const f1 = nf(1);

/** Miljoonat euroina -> "12,3 mrd €" */
export function mrd(millions: number, signed = false) {
  const v = millions / 1000;
  const s = f1.format(Math.abs(v));
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s} mrd €`;
}

/** Miljoonat euroina asukasta kohden -> "26 800 €" */
export function perCapita(millions: number, population: number, signed = false) {
  const v = (millions * 1e6) / population;
  const rounded = Math.round(v / 10) * 10;
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${f0.format(Math.abs(rounded))} €`;
}

export function money(millions: number, population: number, perPerson: boolean, signed = false) {
  return perPerson ? perCapita(millions, population, signed) : mrd(millions, signed);
}

export function pct(v: number, digits = 1, signed = false) {
  const s = nf(digits).format(Math.abs(v));
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s} %`;
}

export function num(v: number, digits = 1, signed = false) {
  const s = nf(digits).format(Math.abs(v));
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}${s}`;
}
