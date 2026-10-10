// Hakee Suomen julkisen talouden datan Tilastokeskuksen StatFin-rajapinnasta
// ja kirjoittaa sen tiedostoon public/data/finance.json.
//
// Ajo: npm run fetch-data

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin";

/** Hakee taulun ja palauttaa funktion get({dim: koodi, ...}) -> arvo. */
async function query(table, selections) {
  const body = {
    query: Object.entries(selections).map(([code, values]) => ({
      code,
      selection: { filter: "item", values },
    })),
    response: { format: "json-stat2" },
  };
  const res = await fetch(`${BASE}/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
  const js = await res.json();
  const ids = js.id;
  const sizes = js.size;
  const index = ids.map((id) => js.dimension[id].category.index);

  return (coords) => {
    let flat = 0;
    for (let i = 0; i < ids.length; i++) {
      const pos = index[i][coords[ids[i]]];
      if (pos === undefined) throw new Error(`${table}: tuntematon ${ids[i]}=${coords[ids[i]]}`);
      flat = flat * sizes[i] + pos;
    }
    return js.value[flat];
  };
}

/** Hakee taulun vuosilistan metatiedoista. */
async function years(table, code = "timeperiod_y") {
  const res = await fetch(`${BASE}/${table}`);
  const meta = await res.json();
  return meta.variables.find((v) => v.code === code).values;
}

const r1 = (x) => Math.round(x * 10) / 10;

async function main() {
  // --- Vuodet ---------------------------------------------------------------
  const ntpYears = await years("ntp/15ah.px");
  const baseYear = ntpYears[ntpYears.length - 1];
  const cofogYears = await years("jmete/12a6.px");
  const cofogYear = cofogYears[cofogYears.length - 1];
  const debtYears = (await years("jali/122g.px")).filter((y) => Number(y) >= 1990);

  // --- BKT ------------------------------------------------------------------
  const gdpQ = await query("ntp/15a9.px", {
    taloustoimi_1_20180101: ["B1GMH", "D11R"],
    contentscode: ["ntp-cp"],
    timeperiod_y: [baseYear],
  });
  const gdp = gdpQ({ taloustoimi_1_20180101: "B1GMH", contentscode: "ntp-cp", timeperiod_y: baseYear });
  const wages = gdpQ({ taloustoimi_1_20180101: "D11R", contentscode: "ntp-cp", timeperiod_y: baseYear });

  // --- Tulot ja menot yhteensä (sulautettu = julkisyhteisöjen sisäiset siirrot poistettu)
  const totQ = await query("ntp/15ah.px", {
    sektoriluokitus_7_20230101: ["S13"],
    taloustoimi_1_20180101: ["OTRS", "OTES", "B9", "D41K", "D411KS13", "D62K"],
    contentscode: ["ntp-cp"],
    timeperiod_y: [baseYear],
  });
  const tot = (t) =>
    totQ({ sektoriluokitus_7_20230101: "S13", taloustoimi_1_20180101: t, contentscode: "ntp-cp", timeperiod_y: baseYear });
  const revenueTotal = tot("OTRS");
  const expenditureTotal = tot("OTES");
  const interest = tot("D41K") - tot("D411KS13"); // korot ulkopuolisille
  const cashBenefits = tot("D62K");

  // --- Verot verolajeittain -------------------------------------------------
  const taxCodes = ["SSS", "1100", "1200", "2000", "5111", "5121", "4000"];
  const taxQ = await query("ntp/15aj.px", {
    sektoriluokitus_7_20230101: ["S13"],
    verolaji_11_20190101: taxCodes,
    contentscode: ["ntp-cp"],
    timeperiod_y: [baseYear],
  });
  const tax = (c) =>
    taxQ({ sektoriluokitus_7_20230101: "S13", verolaji_11_20190101: c, contentscode: "ntp-cp", timeperiod_y: baseYear });

  const taxesTotal = tax("SSS");
  const revenue = [
    { id: "incomeTax", name: "Ansio- ja pääomatulovero", value: tax("1100"),
      desc: "Palkoista, eläkkeistä, etuuksista ja pääomatuloista maksettavat verot (valtio + kunnat)." },
    { id: "socialContrib", name: "Sosiaaliturvamaksut", value: tax("2000"),
      desc: "Työeläke-, työttömyys- ja sairausvakuutusmaksut. Suurin osa menee työeläkkeisiin." },
    { id: "vat", name: "Arvonlisävero", value: tax("5111"),
      desc: "Lähes kaikkien tavaroiden ja palvelujen hintaan sisältyvä vero. Yleinen verokanta 25,5 %." },
    { id: "excise", name: "Valmisteverot", value: tax("5121"),
      desc: "Energia-, alkoholi-, tupakka-, auto- ja virvoitusjuomaverot." },
    { id: "corporateTax", name: "Yhteisövero", value: tax("1200"),
      desc: "Yritysten voitoista maksettava vero. Verokanta 20 %." },
    { id: "otherTax", name: "Muut verot", value: taxesTotal - tax("1100") - tax("2000") - tax("5111") - tax("5121") - tax("1200"),
      desc: "Mm. kiinteistövero, varainsiirtovero, perintövero ja ajoneuvovero." },
    { id: "otherRevenue", name: "Muut tulot", value: revenueTotal - taxesTotal,
      desc: "Maksutulot (esim. asiakasmaksut), korko- ja osinkotulot sekä myyntitulot." },
  ];

  // --- Menot tehtävittäin (COFOG) -------------------------------------------
  const cofogCodes = ["SSS", "G01", "G0107", "G02", "G03", "G04", "G05", "G06", "G07", "G08", "G09",
    "G10", "G1001", "G1002", "G1004", "G1005"];
  const cofQ = await query("jmete/12a6.px", {
    sektoriluokitus_7_20230101: ["S13"],
    taloustoimi_1_20180101: ["OTES"],
    julkisyht_teht_3_20010101: cofogCodes,
    contentscode: ["jmete-cp"],
    timeperiod_y: [cofogYear],
  });
  const cof = (c) =>
    cofQ({ sektoriluokitus_7_20230101: "S13", taloustoimi_1_20180101: "OTES", julkisyht_teht_3_20010101: c,
      contentscode: "jmete-cp", timeperiod_y: cofogYear });

  const cofogRaw = [
    { id: "pensions", name: "Eläkkeet ja vanhuspalvelut", value: cof("G1002"),
      desc: "Vanhuuseläkkeet ja ikääntyneiden hoivapalvelut." },
    { id: "health", name: "Terveydenhuolto", value: cof("G07"),
      desc: "Sairaalat, terveyskeskukset, lääkekorvaukset." },
    { id: "education", name: "Koulutus", value: cof("G09"),
      desc: "Varhaiskasvatus, esiopetus, peruskoulu, lukiot, ammattikoulut ja yliopistot." },
    { id: "sickness", name: "Sairaus ja työkyvyttömyys", value: cof("G1001"),
      desc: "Työkyvyttömyyseläkkeet, sairauspäivärahat ja vammaispalvelut." },
    { id: "family", name: "Perheet ja lapset", value: cof("G1004"),
      desc: "Lapsilisät, vanhempainpäivärahat, lastensuojelu ja päivähoito." },
    { id: "unemployment", name: "Työttömyys", value: cof("G1005"),
      desc: "Työttömyysturva ja työllisyyspalvelut." },
    { id: "otherSocial", name: "Muu sosiaaliturva", value: cof("G10") - cof("G1001") - cof("G1002") - cof("G1004") - cof("G1005"),
      desc: "Asumistuki, toimeentulotuki, leskeneläkkeet ym." },
    { id: "economy", name: "Elinkeinot ja liikenne", value: cof("G04"),
      desc: "Tiet ja raiteet, elinkeinotuet, maa- ja metsätalous, työvoimapalvelut." },
    { id: "admin", name: "Yleinen hallinto", value: cof("G01") - cof("G0107"),
      desc: "Ministeriöt, verohallinto, ulkoasiainhallinto, perustutkimus, kehitysapu." },
    { id: "defence", name: "Puolustus", value: cof("G02"),
      desc: "Puolustusvoimat ja hävittäjähankinnat." },
    { id: "order", name: "Järjestys ja turvallisuus", value: cof("G03"),
      desc: "Poliisi, pelastustoimi, tuomioistuimet ja vankilat." },
    { id: "culture", name: "Kulttuuri ja vapaa-aika", value: cof("G08"),
      desc: "Kirjastot, liikunta, kulttuuri, Yle." },
    { id: "environment", name: "Ympäristö ja asuminen", value: cof("G05") + cof("G06"),
      desc: "Jätehuolto, vesihuolto, ympäristönsuojelu ja asumisen tuet." },
    { id: "interest", name: "Velan korot", value: cof("G0107"),
      desc: "Julkisen velan korkomenot." },
  ];
  // Tehtäväjakauma on saatavilla vuoden viiveellä: skaalataan perusvuoden kokonaismenoihin
  // ja korvataan korot perusvuoden toteutuneilla korkomenoilla.
  const nonInterestCofog = cofogRaw.filter((c) => c.id !== "interest").reduce((s, c) => s + c.value, 0);
  const scale = (expenditureTotal - interest) / nonInterestCofog;
  const expenditure = cofogRaw.map((c) => ({
    ...c,
    value: c.id === "interest" ? interest : c.value * scale,
  }));

  // --- Velka ja alijäämä historia -------------------------------------------
  const debtQ = await query("jali/122g.px", {
    sektoriluokitus_7_20230101: ["S13"],
    contentscode: ["jali-B", "jali-D", "Ratio_B", "Ratio_D"],
    timeperiod_y: debtYears,
  });
  const d = (c, y) => debtQ({ sektoriluokitus_7_20230101: "S13", contentscode: c, timeperiod_y: y });
  const history = debtYears.map((y) => ({
    year: Number(y),
    balance: d("jali-B", y),
    balanceRatio: d("Ratio_B", y),
    debt: d("jali-D", y),
    debtRatio: d("Ratio_D", y),
  }));
  const last = history[history.length - 1];

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    baseYear: Number(baseYear),
    cofogYear: Number(cofogYear),
    preliminary: true,
    unit: "miljoonaa euroa",
    population: 5_640_000,
    gdp: Math.round(gdp),
    wages: Math.round(wages),
    cashBenefits: Math.round(cashBenefits),
    revenueTotal: Math.round(revenueTotal),
    expenditureTotal: Math.round(expenditureTotal),
    balance: Math.round(revenueTotal - expenditureTotal),
    debt: Math.round(last.debt),
    debtRatio: r1(last.debtRatio),
    interest: Math.round(interest),
    revenue: revenue.map((r) => ({ ...r, value: Math.round(r.value) })),
    expenditure: expenditure.map((r) => ({ ...r, value: Math.round(r.value) })),
    history,
    sources: [
      { name: "Tilastokeskus: Julkisyhteisöjen tulot ja menot (15ah)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15ah.px/" },
      { name: "Tilastokeskus: Verot ja veronluonteiset maksut (15aj)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15aj.px/" },
      { name: "Tilastokeskus: Julkisyhteisöjen menot tehtävittäin (12a6)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__jmete/statfin_jmete_pxt_12a6.px/" },
      { name: "Tilastokeskus: Julkisyhteisöjen alijäämä ja velka (122g)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__jali/statfin_jali_pxt_122g.px/" },
      { name: "Tilastokeskus: BKT (15a9)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15a9.px/" },
    ],
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/finance.json", JSON.stringify(out, null, 2) + "\n");

  const sumRev = out.revenue.reduce((s, r) => s + r.value, 0);
  const sumExp = out.expenditure.reduce((s, r) => s + r.value, 0);
  console.log(`Perusvuosi ${baseYear} (menojakauma ${cofogYear})`);
  console.log(`BKT ${out.gdp} | tulot ${out.revenueTotal} (osat ${sumRev}) | menot ${out.expenditureTotal} (osat ${sumExp})`);
  console.log(`Alijäämä ${out.balance} | velka ${out.debt} (${out.debtRatio} %) | korot ${out.interest}`);
  console.table(out.revenue.map(({ name, value }) => ({ name, value })));
  console.table(out.expenditure.map(({ name, value }) => ({ name, value })));
  console.log(history.slice(-3));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
