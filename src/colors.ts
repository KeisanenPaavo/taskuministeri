// Värit: tulot vihreän ja menot sinisen sävyinä, velan korot punaisella,
// jotta ne yhdistyvät alijäämään ja velkaan. Muu sivu on mustavalkoinen.

export const REVENUE_COLORS: Record<string, string> = {
  incomeTax: "#1f5a40",
  socialContrib: "#2f6b4f",
  vat: "#3f7d5f",
  excise: "#4f8f70",
  corporateTax: "#6a9f84",
  otherTax: "#86b09a",
  otherRevenue: "#7a8a80",
};

export const EXPENDITURE_COLORS: Record<string, string> = {
  pensions: "#1b3f6b",
  health: "#24507e",
  education: "#2f5f91",
  sickness: "#3c6c9c",
  family: "#4a79a6",
  unemployment: "#5786b0",
  otherSocial: "#6493ba",
  economy: "#2a4a6e",
  admin: "#3a5a80",
  defence: "#4a6a8f",
  order: "#5a7a9f",
  culture: "#6a8aaf",
  environment: "#7a9abf",
  interest: "#b8322a",
};

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Valitsee taustalle paremman kontrastin tekstivärin (valkoinen tai lähes musta). */
export function textOn(hex: string) {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (luminance("#121212") + 0.05);
  return onWhite >= onInk ? "#ffffff" : "#121212";
}
