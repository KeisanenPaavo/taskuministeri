// Värit: tulot vihreä–keltainen-sävyissä, menot sini–violetti-sävyissä,
// velan korot punaisella, jotta ne yhdistyvät alijäämään ja velkaan.

export const REVENUE_COLORS: Record<string, string> = {
  incomeTax: "#1f6f5c",
  socialContrib: "#2f8a6f",
  vat: "#4a9e6a",
  excise: "#79ad55",
  corporateTax: "#a3ad3f",
  otherTax: "#c0a23a",
  otherRevenue: "#8d927f",
};

export const EXPENDITURE_COLORS: Record<string, string> = {
  pensions: "#2c4f8c",
  health: "#3866b0",
  education: "#4f80c8",
  sickness: "#5c5fae",
  family: "#7a5aae",
  unemployment: "#985aa6",
  otherSocial: "#7d6f9e",
  economy: "#3a8299",
  admin: "#566d87",
  defence: "#5b6150",
  order: "#6f7d60",
  culture: "#4e8e88",
  environment: "#6d9c74",
  interest: "#c4473a",
};

/** Valitsee tekstivärin taustan kirkkauden mukaan. */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1d1f23" : "#ffffff";
}
