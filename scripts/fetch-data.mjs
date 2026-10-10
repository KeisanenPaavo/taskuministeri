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

// ---------- Eurostat: vertailu Ruotsiin ja Viroon ----------

const EUROSTAT = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data";
const COUNTRIES = [
  { code: "FI", name: "Suomi" },
  { code: "SE", name: "Ruotsi" },
  { code: "EE", name: "Viro" },
];

/** Hakee Eurostat-taulun ja palauttaa {get(geo, key, time), times}. `key` on taulun luokkadimension koodi. */
async function eurostat(table, params, keyDim) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) qs.append(k, x);
  for (const c of COUNTRIES) qs.append("geo", c.code);
  const res = await fetch(`${EUROSTAT}/${table}?${qs}`);
  if (!res.ok) throw new Error(`Eurostat ${table}: HTTP ${res.status}`);
  const js = await res.json();
  if (js.error) throw new Error(`Eurostat ${table}: ${JSON.stringify(js.error)}`);
  const ids = js.id;
  const index = ids.map((id) => js.dimension[id].category.index);
  const times = Object.keys(js.dimension.time.category.index).sort();
  const get = (geo, key, time) => {
    let flat = 0;
    for (let i = 0; i < ids.length; i++) {
      const cats = index[i];
      const want = ids[i] === "geo" ? geo : ids[i] === "time" ? time : ids[i] === keyDim ? key : Object.keys(cats)[0];
      const pos = cats[want];
      if (pos === undefined) return undefined;
      flat = flat * js.size[i] + pos;
    }
    return js.value[flat];
  };
  return { get, times };
}

/** Uusin vuosi, jolta kaikilla mailla on arvo kaikille avaimille. */
function latestCommonYear({ get, times }, keys) {
  for (const t of [...times].reverse()) {
    if (COUNTRIES.every((c) => keys.every((k) => get(c.code, k, t) !== undefined))) return t;
  }
  throw new Error("Ei yhteistä vuotta");
}

// --- Naapurivertailu osa-alueittain --------------------------------------
// Arvot miljoonina euroina, jotta selain voi näyttää ne sekä % BKT:stä että €/asukas/pv.

const COFOG_TREE = [
  [
    "GF10",
    "Sosiaaliturva",
    [
      ["GF1002", "Vanhuus (eläkkeet, vanhuspalvelut)"],
      ["GF1001", "Sairaus ja työkyvyttömyys"],
      ["GF1004", "Perheet ja lapset (ml. varhaiskasvatus)"],
      ["GF1005", "Työttömyys"],
      ["GF1003", "Perhe-eläkkeet"],
      ["GF1006", "Asumisen tuet"],
      ["GF1007", "Toimeentulotuki ja muu syrjäytymisen ehkäisy"],
      ["GF1009", "Muu sosiaaliturva"],
    ],
  ],
  [
    "GF07",
    "Terveydenhuolto",
    [
      ["GF0703", "Sairaalahoito"],
      ["GF0702", "Avohoito (terveyskeskukset, lääkärit, hammashoito)"],
      ["GF0701", "Lääkkeet ja apuvälineet"],
      ["GF0704", "Kansanterveystyö (rokotukset, seulonnat)"],
      ["GF0705", "Terveysalan tutkimus"],
      ["GF0706", "Muu terveydenhuolto"],
    ],
  ],
  [
    "GF01",
    "Yleinen hallinto (ml. velan korot)",
    [
      ["GF0101", "Lainsäädäntö, verotus, ulkoasiat"],
      ["GF0107", "Julkisen velan korot"],
      ["GF0102", "Kehitysyhteistyö"],
      ["GF0103", "Yleiset palvelut (mm. henkilöstö, suunnittelu)"],
      ["GF0104", "Perustutkimus"],
      ["GF0106", "Muu yleinen hallinto"],
      ["GF0108", "Siirrot hallinnon tasojen välillä"],
    ],
  ],
  [
    "GF09",
    "Koulutus",
    [
      ["GF0901", "Esiopetus ja alakoulu"],
      ["GF0902", "Yläkoulu, lukio ja ammatillinen koulutus"],
      ["GF0904", "Korkeakoulut"],
      ["GF0903", "Muu toisen asteen jälkeinen koulutus"],
      ["GF0905", "Muu koulutus (esim. aikuiskoulutus)"],
      ["GF0906", "Tukipalvelut (kouluruoka, kuljetukset)"],
      ["GF0907", "Koulutuksen tutkimus"],
      ["GF0908", "Muu koulutus"],
    ],
  ],
  [
    "GF04",
    "Elinkeinot ja liikenne",
    [
      ["GF0405", "Liikenne (tiet, radat, joukkoliikenne)"],
      ["GF0401", "Yleiset elinkeino- ja työvoima-asiat"],
      ["GF0402", "Maa-, metsä- ja kalatalous"],
      ["GF0403", "Energia"],
      ["GF0404", "Teollisuus ja rakentaminen"],
      ["GF0406", "Viestintä"],
      ["GF0407", "Muut toimialat (esim. matkailu)"],
      ["GF0408", "Elinkeinojen tutkimus ja kehitys"],
      ["GF0409", "Muut elinkeinoasiat"],
    ],
  ],
  [
    "GF02",
    "Puolustus",
    [
      ["GF0201", "Sotilaallinen puolustus"],
      ["GF0202", "Siviilipuolustus"],
      ["GF0203", "Sotilaallinen apu ulkomaille"],
      ["GF0204", "Puolustuksen tutkimus"],
      ["GF0205", "Muu puolustus"],
    ],
  ],
  [
    "GF03",
    "Järjestys ja turvallisuus",
    [
      ["GF0301", "Poliisi"],
      ["GF0302", "Pelastustoimi"],
      ["GF0303", "Tuomioistuimet"],
      ["GF0304", "Vankilat"],
      ["GF0305", "Turvallisuusalan tutkimus"],
      ["GF0306", "Muu järjestys ja turvallisuus"],
    ],
  ],
  [
    "GF08",
    "Kulttuuri ja vapaa-aika",
    [
      ["GF0801", "Liikunta ja virkistys"],
      ["GF0802", "Kulttuuri (kirjastot, museot, teatterit)"],
      ["GF0803", "Yleisradio ja julkaisutoiminta"],
      ["GF0804", "Uskonnolliset ja muut yhteisöt"],
      ["GF0805", "Kulttuurin tutkimus"],
      ["GF0806", "Muu kulttuuri ja vapaa-aika"],
    ],
  ],
  [
    "GF05",
    "Ympäristönsuojelu",
    [
      ["GF0501", "Jätehuolto"],
      ["GF0502", "Jätevesihuolto"],
      ["GF0503", "Saasteiden torjunta"],
      ["GF0504", "Luonnon monimuotoisuus"],
      ["GF0505", "Ympäristötutkimus"],
      ["GF0506", "Muu ympäristönsuojelu"],
    ],
  ],
  [
    "GF06",
    "Asuminen ja yhdyskunnat",
    [
      ["GF0601", "Asuntotuotanto"],
      ["GF0602", "Yhdyskuntien kehittäminen"],
      ["GF0603", "Vesihuolto"],
      ["GF0604", "Katuvalaistus"],
      ["GF0605", "Asumisen tutkimus"],
      ["GF0606", "Muu asuminen ja yhdyskunnat"],
    ],
  ],
];

// Lajit: [id, nimi, koodit (summataan), osat]
const ECON_TREE = [
  ["benefits", "Rahana maksettavat etuudet (eläkkeet, päivärahat)", ["D62PAY"], []],
  [
    "wages",
    "Julkisen sektorin palkat",
    ["D1PAY"],
    [
      ["Palkat", ["D11PAY"]],
      ["Työnantajan maksut", ["D12PAY"]],
    ],
  ],
  ["purchases", "Tavara- ja palveluostot", ["P2"], []],
  ["inKind", "Kotitalouksille ostetut palvelut", ["D632PAY"], []],
  ["investment", "Investoinnit", ["P51G"], []],
  ["subsidies", "Tuet yrityksille", ["D3PAY"], []],
  ["interest", "Velan korot", ["D41PAY"], []],
];

const TAX_TREE = [
  ["incomeTax", "Ansio- ja pääomatuloverot", ["D51A_C1"], []],
  [
    "labour",
    "Sosiaaliturvamaksut ja palkkaverot",
    ["D61", "D29C"],
    [
      ["Työnantajien sosiaaliturvamaksut", ["D611"]],
      ["Palkansaajien ja yrittäjien maksut", ["D613"]],
      ["Palkkasummaverot (Ruotsi: allmän löneavgift)", ["D29C"]],
    ],
  ],
  ["vat", "Arvonlisävero", ["D211"], []],
  ["excise", "Valmisteverot (energia, alkoholi, tupakka)", ["D214A", "D2122C"], []],
  ["corporateTax", "Yhteisövero", ["D51B_C2"], []],
  ["property", "Kiinteistö- ja varallisuusverot", ["D29A", "D59A"], []],
];
const TAX_TOTAL = "D2_D5_D91_D61_M_D995";
/** Aikajanan alkuvuosi. */
const COMPARE_FROM = 2000;
const NONTAX = [
  ["Myyntitulot ja asiakasmaksut", ["P11_P12_P131"]],
  ["Korko- ja osinkotulot", ["D4REC"]],
];

async function fetchCompare() {
  const since = { sinceTimePeriod: String(COMPARE_FROM) };
  const meur = { sector: "S13", unit: "MIO_EUR", ...since };
  const byCountry = (fn) => Object.fromEntries(COUNTRIES.map((c) => [c.code, fn(c.code)]));
  const r1 = (v) => (v === undefined || v === null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
  // Summa koodeista; puuttuu (undefined), jos yksikään koodi ei löydy.
  const sumOf = (src) => (codes) => (g, t) => {
    const vals = codes.map((k) => src.get(g, k, t));
    return vals.every((v) => v === undefined || v === null) ? undefined : vals.reduce((s, v) => s + (v ?? 0), 0);
  };
  const yearsTo = (y) => Array.from({ length: Number(y) - COMPARE_FROM + 1 }, (_, i) => String(COMPARE_FROM + i));

  // BKT ja väkiluku muunnoksia varten
  const gdp = await eurostat("nama_10_gdp", { na_item: "B1GQ", unit: "CP_MEUR", ...since }, "na_item");
  const pop = await eurostat("nama_10_pe", { na_item: "POP_NC", unit: "THS_PER", ...since }, "na_item");
  const scale = {};
  const addScale = (y) => {
    for (const t of yearsTo(y)) {
      scale[t] = {
        gdp: byCountry((g) => gdp.get(g, "B1GQ", t)),
        pop: byCountry((g) => Math.round(pop.get(g, "POP_NC", t) * 1000)),
      };
    }
  };

  /** Rivi: arvot vertailuvuodelta ja aikasarja vuodesta COMPARE_FROM. fn(g, t) palauttaa milj. €. */
  const mkRow = (y, id, name, fn, parts = []) => ({
    ...(id ? { id } : {}),
    name,
    values: byCountry((g) => r1(fn(g, y))),
    hist: byCountry((g) => yearsTo(y).map((t) => r1(fn(g, t)))),
    parts,
  });
  const minShare = (vals, y) => Math.max(...COUNTRIES.map((c) => (vals[c.code] ?? 0) / scale[y].gdp[c.code]));
  const keepPart = (y) => (p) => minShare(p.values, y) >= 0.0003;

  // Menot tehtävittäin
  const cofogCodes = COFOG_TREE.flatMap(([c, , subs]) => [c, ...subs.map((s) => s[0])]);
  const exp = await eurostat("gov_10a_exp", { cofog99: cofogCodes, na_item: "TE", ...meur }, "cofog99");
  const cy = latestCommonYear(exp, COFOG_TREE.map((d) => d[0]));
  addScale(cy);
  const xget = sumOf(exp);
  const cofog = COFOG_TREE.map(([code, name, subs]) =>
    mkRow(cy, code, name, xget([code]), subs.map(([sc, sn]) => mkRow(cy, null, sn, xget([sc]))).filter(keepPart(cy))),
  );

  // Menot lajeittain ja tulot: gov_10a_main
  const mainCodes = [
    "TE",
    "TR",
    "B9",
    ...ECON_TREE.flatMap(([, , c, p]) => [...c, ...p.flatMap((x) => x[1])]),
    ...NONTAX.flatMap((x) => x[1]),
  ];
  const main = await eurostat("gov_10a_main", { na_item: mainCodes, ...meur }, "na_item");
  const ey = latestCommonYear(main, ECON_TREE.flatMap(([, , c]) => c).concat("TE"));
  addScale(ey);
  const mget = sumOf(main);
  const econ = ECON_TREE.map(([id, name, codes, parts]) =>
    mkRow(ey, id, name, mget(codes), parts.map(([pn, pc]) => mkRow(ey, null, pn, mget(pc)))),
  );
  const econCodes = ECON_TREE.map(([, , c]) => c);
  econ.push(
    mkRow(ey, "otherExp", "Muut menot (mm. EU-maksut, kehitysapu, pääomansiirrot)", (g, t) => {
      const parts = econCodes.map((c) => mget(c)(g, t));
      const te = main.get(g, "TE", t);
      return te === undefined || parts.some((v) => v === undefined) ? undefined : te - parts.reduce((s, v) => s + v, 0);
    }),
  );

  const taxCodes = [TAX_TOTAL, ...TAX_TREE.flatMap(([, , c, p]) => [...c, ...p.flatMap((x) => x[1])])];
  const tax = await eurostat("gov_10a_taxag", { na_item: taxCodes, ...meur }, "na_item");
  // Tulovuosi: uusin, jolta sekä veroerittely että kokonaistulot löytyvät
  const ry = [...tax.times]
    .reverse()
    .find((t) =>
      COUNTRIES.every(
        (c) =>
          [TAX_TOTAL, "D51A_C1", "D211", "D61"].every((k) => tax.get(c.code, k, t) !== undefined) &&
          main.get(c.code, "TR", t) !== undefined,
      ),
    );
  addScale(ry);
  const tget = sumOf(tax);
  const revenue = TAX_TREE.map(([id, name, codes, parts]) =>
    mkRow(ry, id, name, tget(codes), parts.map(([pn, pc]) => mkRow(ry, null, pn, tget(pc))).filter(keepPart(ry))),
  );
  const taxRowCodes = TAX_TREE.map(([, , c]) => c);
  revenue.push(
    mkRow(ry, "otherTax", "Muut verot", (g, t) => {
      const total = tax.get(g, TAX_TOTAL, t);
      return total === undefined ? undefined : total - taxRowCodes.reduce((s, c) => s + (tget(c)(g, t) ?? 0), 0);
    }),
  );
  revenue.push(
    mkRow(
      ry,
      "nonTax",
      "Muut kuin verotulot",
      (g, t) => {
        const tr = main.get(g, "TR", t);
        const total = tax.get(g, TAX_TOTAL, t);
        return tr === undefined || total === undefined ? undefined : tr - total;
      },
      NONTAX.map(([pn, pc]) => mkRow(ry, null, pn, mget(pc))),
    ),
  );

  // Yleiskuva: menot, tulot, verot, alijäämä, korot ja velka (velka on kanta, muut vuosivirtoja).
  const debt = await eurostat("gov_10dd_edpt1", { na_item: "GD", sector: "S13", unit: "MIO_EUR", ...since }, "na_item");
  // Veroaste lasketaan tavalliseen tapaan EU:lle maksetut verot mukaan lukien (S13_S212); se valmistuu aiemmin.
  const taxRatio = await eurostat(
    "gov_10a_taxag",
    { na_item: TAX_TOTAL, sector: "S13_S212", unit: "MIO_EUR", ...since },
    "na_item",
  );
  const overviewFns = [
    ["expenditure", "Julkiset menot", (g, t) => main.get(g, "TE", t)],
    ["revenue", "Julkiset tulot", (g, t) => main.get(g, "TR", t)],
    ["tax", "Verot ja sosiaaliturvamaksut", (g, t) => taxRatio.get(g, TAX_TOTAL, t)],
    ["deficit", "Alijäämä", (g, t) => (main.get(g, "B9", t) === undefined ? undefined : -main.get(g, "B9", t))],
    ["interest", "Velan korot", (g, t) => main.get(g, "D41PAY", t)],
    ["debt", "Julkinen velka", (g, t) => debt.get(g, "GD", t)],
  ];
  const oy = [...main.times]
    .reverse()
    // Veroerittely valmistuu muita myöhemmin, joten sitä ei vaadita uusimmalta vuodelta.
    .find((t) =>
      COUNTRIES.every((c) => overviewFns.every(([id, , fn]) => id === "tax" || fn(c.code, t) !== undefined)),
    );
  addScale(oy);
  // Jos veroerittely puuttuu uusimmalta vuodelta, verorivi näytetään edelliseltä vuodelta ja vuosi kerrotaan nimessä.
  const ty = latestCommonYear(taxRatio, [TAX_TOTAL]);
  addScale(ty);
  const overview = overviewFns.map(([id, name, fn]) =>
    id === "tax" && ty !== oy ? { ...mkRow(ty, id, `${name} (${ty})`, fn), year: Number(ty) } : mkRow(oy, id, name, fn),
  );

  return {
    from: COMPARE_FROM,
    scale,
    groups: [
      {
        id: "overview",
        title: "Yleiskuva",
        year: Number(oy),
        rows: overview,
        hint: "Kuinka suuri julkinen talous on ja kuinka paljon sillä on velkaa.",
      },
      {
        id: "cofog",
        title: "Menot tehtävittäin",
        year: Number(cy),
        rows: cofog,
        hint: "Mihin rahat käytetään: COFOG-luokitus, sama kaikissa EU-maissa.",
      },
      {
        id: "econ",
        title: "Menot lajeittain",
        year: Number(ey),
        rows: econ,
        hint: "Miten rahat käytetään: palkkoihin, etuuksiin, ostoihin vai investointeihin.",
      },
      {
        id: "revenue",
        title: "Tulot lajeittain",
        year: Number(ry),
        rows: revenue,
        hint: "Mistä rahat tulevat: verot, maksut ja muut tulot.",
      },
    ],
  };
}

async function fetchNeighbors() {
  const since = { sinceTimePeriod: "2018" };
  const mainKeys = ["TE", "TR", "B9", "D41PAY"];
  const main = await eurostat("gov_10a_main", { na_item: mainKeys, sector: "S13", unit: "PC_GDP", ...since }, "na_item");
  const mainYear = latestCommonYear(main, mainKeys);

  const tax = await eurostat(
    "gov_10a_taxag",
    { na_item: "D2_D5_D91_D61_M_D995", sector: "S13_S212", unit: "PC_GDP", ...since },
    "na_item",
  );
  const taxYear = latestCommonYear(tax, ["D2_D5_D91_D61_M_D995"]);

  const cofogDefs = [
    { id: "social", code: "GF10", name: "Sosiaaliturva" },
    { id: "health", code: "GF07", name: "Terveydenhuolto" },
    { id: "admin", code: "GF01", name: "Yleinen hallinto (ml. velan korot)" },
    { id: "education", code: "GF09", name: "Koulutus" },
    { id: "economy", code: "GF04", name: "Elinkeinot ja liikenne" },
    { id: "defence", code: "GF02", name: "Puolustus" },
    { id: "order", code: "GF03", name: "Järjestys ja turvallisuus" },
    { id: "culture", code: "GF08", name: "Kulttuuri ja vapaa-aika" },
    { id: "environment", code: "GF05", name: "Ympäristönsuojelu" },
    { id: "housing", code: "GF06", name: "Asuminen ja yhdyskunnat" },
  ];
  const socialDefs = [
    { id: "oldAge", code: "GF1002", name: "Vanhuus (eläkkeet, vanhuspalvelut)" },
    { id: "sickness", code: "GF1001", name: "Sairaus ja työkyvyttömyys" },
    { id: "family", code: "GF1004", name: "Perheet ja lapset" },
    { id: "unemployment", code: "GF1005", name: "Työttömyys" },
  ];
  const codes = [...cofogDefs, ...socialDefs].map((d) => d.code);
  const exp = await eurostat("gov_10a_exp", { cofog99: codes, na_item: "TE", sector: "S13", unit: "PC_GDP", ...since }, "cofog99");
  const cofogYear = latestCommonYear(exp, codes);

  const debt = await eurostat("gov_10dd_edpt1", { na_item: "GD", sector: "S13", unit: "PC_GDP", sinceTimePeriod: "2000" }, "na_item");

  const byCountry = (fn) => Object.fromEntries(COUNTRIES.map((c) => [c.code, fn(c.code)]));
  return {
    source: "Eurostat",
    countries: COUNTRIES,
    mainYear: Number(mainYear),
    taxYear: Number(taxYear),
    cofogYear: Number(cofogYear),
    main: {
      expenditure: byCountry((g) => main.get(g, "TE", mainYear)),
      revenue: byCountry((g) => main.get(g, "TR", mainYear)),
      balance: byCountry((g) => main.get(g, "B9", mainYear)),
      interest: byCountry((g) => main.get(g, "D41PAY", mainYear)),
      tax: byCountry((g) => tax.get(g, "D2_D5_D91_D61_M_D995", taxYear)),
    },
    cofog: cofogDefs.map((d) => ({ id: d.id, name: d.name, values: byCountry((g) => exp.get(g, d.code, cofogYear)) })),
    social: socialDefs.map((d) => ({ id: d.id, name: d.name, values: byCountry((g) => exp.get(g, d.code, cofogYear)) })),
    debt: debt.times
      .map((t) => ({ year: Number(t), ...byCountry((g) => debt.get(g, "GD", t)) }))
      .filter((r) => COUNTRIES.every((c) => r[c.code] !== undefined)),
    compare: await fetchCompare(),
    sources: [
      { id: "gov_10a_main", name: "Eurostat: Julkisyhteisöjen tulot ja menot (gov_10a_main)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_main/default/table" },
      { id: "gov_10a_exp", name: "Eurostat: Menot tehtävittäin, COFOG (gov_10a_exp)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table" },
      { id: "gov_10dd_edpt1", name: "Eurostat: Julkinen velka (gov_10dd_edpt1)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10dd_edpt1/default/table" },
      { id: "gov_10a_taxag", name: "Eurostat: Verot ja sosiaaliturvamaksut (gov_10a_taxag)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_taxag/default/table" },
      { id: "nama", name: "Eurostat: BKT (nama_10_gdp) ja väkiluku (nama_10_pe)", url: "https://ec.europa.eu/eurostat/databrowser/view/nama_10_gdp/default/table" },
    ],
  };
}

/** Verohallinto: pääomatuloveron osuus valtion tuloverosta uusimmalta verovuodelta. */
async function fetchCapitalShare() {
  const url =
    "https://vero2.stat.fi/PXWeb/api/v1/fi/Vero/Henkiloasiakkaiden_tuloverot/lopulliset/verot_maksut/verot_maksut_105.px";
  const meta = await (await fetch(url)).json();
  const year = meta.variables.find((v) => v.code === "Verovuosi").values.at(-1);
  // 40 = valtion tulovero ansiotulosta, 50 = pääomatulosta, 180 = eläketulon lisävero (ansiotuloa)
  const items = ["HVT_VEROT_40", "HVT_VEROT_50", "HVT_VEROT_180"];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Verovuosi", selection: { filter: "item", values: [year] } },
        { code: "Erä", selection: { filter: "item", values: items } },
        { code: "Sukupuoli", selection: { filter: "item", values: ["S"] } },
        { code: "Ikäluokka", selection: { filter: "item", values: ["SS"] } },
        { code: "Tunnusluvut", selection: { filter: "item", values: ["Sum"] } },
      ],
      response: { format: "json" },
    }),
  });
  if (!res.ok) throw new Error(`Verohallinto: HTTP ${res.status}`);
  const v = Object.fromEntries((await res.json()).data.map((d) => [d.key[1], Number(d.values[0])]));
  const earned = v.HVT_VEROT_40 + v.HVT_VEROT_180;
  return { year: Number(year), share: v.HVT_VEROT_50 / (earned + v.HVT_VEROT_50) };
}

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
  const taxCodes = ["SSS", "1100", "110001", "1200", "2000", "210001", "210002", "220001", "220002",
    "5111", "5121", "512101", "512102", "512103", "512104", "512105",
    "410001", "430001", "440001", "511302", "521001", "5126"];
  const taxQ = await query("ntp/15aj.px", {
    sektoriluokitus_7_20230101: ["S13", "S1311", "S1313"],
    verolaji_11_20190101: taxCodes,
    contentscode: ["ntp-cp"],
    timeperiod_y: [baseYear],
  });
  const tax = (c, sector = "S13") =>
    taxQ({ sektoriluokitus_7_20230101: sector, verolaji_11_20190101: c, contentscode: "ntp-cp", timeperiod_y: baseYear });

  // Tulojen erittely muista kuin veroista
  const othQ = await query("ntp/15ah.px", {
    sektoriluokitus_7_20230101: ["S13"],
    taloustoimi_1_20180101: ["P11R", "P12R", "P131R", "D4RS", "D7RS", "D9RS", "D91R"],
    contentscode: ["ntp-cp"],
    timeperiod_y: [baseYear],
  });
  const oth = (t) =>
    othQ({ sektoriluokitus_7_20230101: "S13", taloustoimi_1_20180101: t, contentscode: "ntp-cp", timeperiod_y: baseYear });

  /** Yhdistää pienet (alle 1 %) erät "Muut"-riviin, joka näytetään vain jos se on merkittävä. */
  const finishParts = (total, parts) => {
    const list = parts.filter((p) => p.name !== "Muut" && p.value >= total * 0.01);
    const rest = total - list.reduce((a, p) => a + p.value, 0);
    if (rest > total * 0.005) list.push({ name: "Muut", value: rest });
    return list.map((p) => ({ name: p.name, value: Math.round(p.value) }));
  };

  // Valtion tuloveron jako ansio- ja pääomatuloveroon Verohallinnon tilaston osuuksilla.
  // Korkotulojen lähdevero on pääomatulon veroa, joten se lisätään pääomatuloveroon sellaisenaan.
  const capital = await fetchCapitalShare();
  const stateRest = tax("1100", "S1311") - tax("110001");
  const stateCapital = stateRest * capital.share + tax("110001");
  const stateEarned = tax("1100", "S1311") - stateCapital;

  const taxesTotal = tax("SSS");
  const otherTaxValue = taxesTotal - tax("1100") - tax("2000") - tax("5111") - tax("5121") - tax("1200");
  const revenue = [
    { id: "incomeTax", name: "Ansio- ja pääomatulovero", value: tax("1100"),
      desc: `Verot, jotka maksetaan palkoista, eläkkeistä, verotettavista etuuksista (esim. työttömyyspäiväraha) sekä pääomatuloista kuten osingoista, vuokrista ja myyntivoitoista. Ansiotulovero menee valtiolle ja kunnille. Valtion ansiotulovero on progressiivinen: pienituloisimmat eivät maksa sitä lainkaan. Kunnallisvero on kaikille saman suuruinen prosentti, joka vaihtelee kunnittain. Pääomatulovero (30 %, yli 30 000 euron osalta 34 %) menee kokonaan valtiolle. Ansio- ja pääomatuloveron jako perustuu Verohallinnon verovuoden ${capital.year} tilastoon.`,
      parts: finishParts(tax("1100"), [
        { name: "Valtion ansiotulovero (palkat, eläkkeet, etuudet)", value: stateEarned },
        { name: "Kunnallisvero (ansiotuloista)", value: tax("1100", "S1313") },
        { name: "Pääomatulovero (osingot, vuokrat, myyntivoitot, korot)", value: stateCapital },
      ]) },
    { id: "socialContrib", name: "Sosiaaliturvamaksut", value: tax("2000"),
      desc: "Palkasta maksettavat vakuutusmaksut, joilla rahoitetaan työeläkkeet sekä työttömyys- ja sairausvakuutus. Osan maksaa työnantaja palkan päälle, osan palkansaaja tai yrittäjä itse. Valtaosa menee työeläkelaitoksille tulevia eläkkeitä varten.",
      parts: finishParts(tax("2000"), [
        { name: "Työnantajien työeläkemaksut", value: tax("220001") },
        { name: "Palkansaajien ja yrittäjien työeläkemaksut", value: tax("210001") },
        { name: "Palkansaajien muut maksut (sairaus- ja työttömyysvakuutus)", value: tax("210002") },
        { name: "Työnantajien muut maksut (sairaus- ja työttömyysvakuutus)", value: tax("220002") },
      ]) },
    { id: "vat", name: "Arvonlisävero", value: tax("5111"),
      desc: "Vero, joka sisältyy lähes kaikkien tavaroiden ja palvelujen hintaan. Yleinen verokanta on 25,5 %. Elintarvikkeissa ja ravintolaruoassa kanta on 14 %, ja esimerkiksi kirjoissa, lääkkeissä, joukkoliikenteessä ja kulttuuri- ja liikuntapalveluissa alempi. Yritykset tilittävät veron, mutta sen maksaa lopulta kuluttaja.",
      parts: [] },
    { id: "excise", name: "Valmisteverot", value: tax("5121"),
      desc: "Tiettyjen tuotteiden hintaan sisältyvät erityisverot. Niillä kerätään tuloja ja ohjataan kulutusta: esimerkiksi polttoaineiden ja sähkön energiaverot, alkoholi- ja tupakkavero sekä virvoitusjuomavero.",
      parts: finishParts(tax("5121"), [
        { name: "Energiaverot (polttoaineet ja sähkö)", value: tax("512102") },
        { name: "Alkoholijuomavero", value: tax("512101") },
        { name: "Tupakkavero", value: tax("512105") },
        { name: "Autovero", value: tax("512103") },
        { name: "Virvoitusjuomavero", value: tax("512104") },
      ]) },
    { id: "corporateTax", name: "Yhteisövero", value: tax("1200"),
      desc: "Osakeyhtiöiden ja muiden yhteisöjen voitoistaan maksama vero. Verokanta on 20 %. Tuotto vaihtelee paljon suhdanteiden mukaan, koska se riippuu yritysten tuloksista. Tuotto jaetaan valtion, kuntien ja seurakuntien kesken.",
      parts: finishParts(tax("1200"), [
        { name: "Valtion osuus", value: tax("1200", "S1311") },
        { name: "Kuntien osuus", value: tax("1200", "S1313") },
      ]) },
    { id: "otherTax", name: "Muut verot", value: otherTaxValue,
      desc: "Pienemmät verot, kuten kunnille menevä kiinteistövero, perintö- ja lahjavero, asunto- ja osakekaupoista maksettava varainsiirtovero, vakuutusmaksuvero sekä autoilijoiden ajoneuvovero.",
      parts: finishParts(otherTaxValue, [
        { name: "Kiinteistövero", value: tax("410001") },
        { name: "Perintö- ja lahjavero", value: tax("430001") },
        { name: "Vakuutusmaksuvero", value: tax("511302") },
        { name: "Ajoneuvovero", value: tax("521001") },
        { name: "Varainsiirtovero", value: tax("440001") },
        { name: "Eräiden palvelujen verot (mm. rahapelit)", value: tax("5126") },
      ]) },
    { id: "otherRevenue", name: "Muut tulot", value: revenueTotal - taxesTotal,
      desc: "Tulot, jotka eivät ole veroja: julkisten yksiköiden myyntitulot, palveluista perittävät asiakasmaksut (esim. terveyskeskus- ja päivähoitomaksut) sekä korko- ja osinkotulot. Suurin osa korko- ja osinkotuloista kertyy työeläkerahastoille. Mukana on myös kansantalouden tilinpidon laskennallisia eriä, kuten itse tehtyjen ohjelmistojen ja tutkimuksen arvo.",
      parts: finishParts(revenueTotal - taxesTotal, [
        { name: "Myyntitulot (esim. liikelaitokset, vuokrat, palvelujen myynti)", value: oth("P11R") },
        { name: "Korko- ja osinkotulot (pääosin työeläkerahastot)", value: oth("D4RS") },
        { name: "Asiakasmaksut (esim. terveys- ja sosiaalipalvelut)", value: oth("P131R") },
        { name: "Oma tuotanto omaan käyttöön (laskennallinen)", value: oth("P12R") },
        { name: "Muut tulonsiirrot (esim. EU-rahoitus, sakot)", value: oth("D7RS") },
        { name: "Pääomansiirrot (esim. investointiavustukset)", value: oth("D9RS") - oth("D91R") },
      ]) },
  ];

  // --- Menot tehtävittäin (COFOG) -------------------------------------------
  // Jokaiselle menoerälle: COFOG-luokat ja erittely. "cash" = rahana maksettavat etuudet (D62K),
  // "services" = kaikki muu (palvelut, palkat, ostot).
  const cofogDefs = [
    { id: "pensions", name: "Eläkkeet ja vanhuspalvelut", codes: ["G1002"],
      desc: "Vanhuuseläkkeet (työeläkkeet, kansaneläke ja takuueläke) sekä ikääntyneiden palvelut, kuten kotihoito, palveluasuminen ja hoivakodit. Tämä on julkisen talouden suurin yksittäinen menoerä, ja se kasvaa väestön ikääntyessä.",
      parts: [
        { name: "Eläkkeet (rahana maksettavat)", codes: ["G1002"], tx: "cash" },
        { name: "Vanhuspalvelut (kotihoito, palveluasuminen, hoiva)", codes: ["G1002"], tx: "services" },
      ] },
    { id: "health", name: "Terveydenhuolto", codes: ["G07"],
      desc: "Sairaalat, terveyskeskukset ja muu avohoito, lääkkeiden ja apuvälineiden korvaukset sekä ehkäisevä terveydenhuolto. Suurimman osan järjestävät hyvinvointialueet, ja Kela korvaa osan yksityisistä palveluista ja lääkkeistä.",
      parts: [
        { name: "Sairaalahoito", codes: ["G0703"] },
        { name: "Avohoito (terveyskeskukset, lääkärikäynnit, hammashoito)", codes: ["G0702"] },
        { name: "Lääkkeet ja apuvälineet", codes: ["G0701"] },
        { name: "Kansanterveystyö (esim. rokotukset, seulonnat)", codes: ["G0704"] },
        { name: "Terveysalan tutkimus ja kehitys", codes: ["G0705"] },
        { name: "Muu terveydenhuolto", codes: ["G0706"] },
      ] },
    { id: "education", name: "Koulutus", codes: ["G09"],
      desc: "Esiopetus, peruskoulu, lukiot, ammatillinen koulutus, ammattikorkeakoulut ja yliopistot sekä aikuiskoulutus. Varhaiskasvatus (päiväkodit) ei tilastoissa kuulu tänne, vaan Perheet ja lapset -menoihin.",
      parts: [
        { name: "Esiopetus ja alakoulu", codes: ["G0901"] },
        { name: "Yläkoulu, lukio ja ammatillinen koulutus", codes: ["G0902", "G0903"] },
        { name: "Yliopistot ja ammattikorkeakoulut", codes: ["G0904"] },
        { name: "Koulutuksen tukipalvelut", codes: ["G0906"] },
        { name: "Aikuiskoulutus ja muu tutkintoon johtamaton koulutus", codes: ["G0905"] },
        { name: "Koulutuksen tutkimus ja kehitys", codes: ["G0907"] },
      ] },
    { id: "sickness", name: "Sairaus ja työkyvyttömyys", codes: ["G1001"],
      desc: "Toimeentulo ja palvelut niille, jotka eivät sairauden tai vamman vuoksi voi tehdä töitä: työkyvyttömyyseläkkeet, sairauspäivärahat, vammaisetuudet sekä vammaispalvelut, kuten henkilökohtainen apu ja asumispalvelut.",
      parts: [
        { name: "Työkyvyttömyyseläkkeet ja sairauspäivärahat", codes: ["G1001"], tx: "cash" },
        { name: "Vammaispalvelut ja kuntoutus", codes: ["G1001"], tx: "services" },
      ] },
    { id: "family", name: "Perheet ja lapset", codes: ["G1004"],
      desc: "Lapsiperheiden tuet ja palvelut: varhaiskasvatus eli päiväkodit, lapsilisät, vanhempainpäivärahat, kotihoidon tuki sekä lastensuojelu ja muut perhepalvelut.",
      parts: [
        { name: "Lapsilisät, vanhempainpäivärahat ja muut rahana maksettavat tuet", codes: ["G1004"], tx: "cash" },
        { name: "Palvelut (varhaiskasvatus, lastensuojelu ym.)", codes: ["G1004"], tx: "services" },
      ] },
    { id: "unemployment", name: "Työttömyys", codes: ["G1005"],
      desc: "Työttömien toimeentulo: ansiosidonnainen päiväraha, peruspäiväraha ja työmarkkinatuki. Tämä erä kasvaa nopeasti taantumassa, kun työttömyys lisääntyy.",
      parts: [
        { name: "Työttömyyspäivärahat ja työmarkkinatuki", codes: ["G1005"], tx: "cash" },
        { name: "Muut menot", codes: ["G1005"], tx: "services" },
      ] },
    { id: "otherSocial", name: "Muu sosiaaliturva", codes: ["G1003", "G1006", "G1007", "G1008", "G1009"],
      desc: "Muut sosiaaliturvan menot, kuten yleinen asumistuki, toimeentulotuki, leskeneläkkeet sekä syrjäytymistä ehkäisevät palvelut, esimerkiksi päihde- ja asunnottomuustyö.",
      parts: [
        { name: "Asumistuki", codes: ["G1006"] },
        { name: "Toimeentulotuki ja syrjäytymisen ehkäisy", codes: ["G1007"] },
        { name: "Leskeneläkkeet ja muut edunsaajat", codes: ["G1003"] },
        { name: "Muut", codes: ["G1008", "G1009"] },
      ] },
    { id: "economy", name: "Elinkeinot ja liikenne", codes: ["G04"],
      desc: "Liikenneverkot (tiet, rautatiet, joukkoliikenne), maa- ja metsätalouden tuet, energia, yritystuet, työvoimapalvelut sekä elinkeinoelämän tutkimus ja kehitys, kuten Business Finlandin rahoitus.",
      parts: [
        { name: "Liikenne (tiet, raiteet, joukkoliikenne)", codes: ["G0405"] },
        { name: "Yleinen elinkeino- ja työvoimahallinto", codes: ["G0401"] },
        { name: "Maa-, metsä- ja kalatalous", codes: ["G0402"] },
        { name: "Elinkeinojen tutkimus ja kehitys", codes: ["G0408"] },
        { name: "Energia", codes: ["G0403"] },
        { name: "Teollisuus ja rakentaminen", codes: ["G0404"] },
        { name: "Viestintä", codes: ["G0406"] },
        { name: "Muut toimialat", codes: ["G0407", "G0409"] },
      ] },
    { id: "admin", name: "Yleinen hallinto", codes: ["G0101", "G0102", "G0103", "G0104", "G0105", "G0106", "G0108"],
      desc: "Valtion ja kuntien yleinen hallinto: eduskunta, ministeriöt, verohallinto, ulkoasiainhallinto, kuntien keskushallinto ja tilastotoimi. Mukana ovat myös perustutkimus ja kehitysyhteistyö.",
      parts: [
        { name: "Päätöksenteko, talous- ja verohallinto, ulkoasiat", codes: ["G0101"] },
        { name: "Yleiset hallintopalvelut", codes: ["G0103"] },
        { name: "Perustutkimus", codes: ["G0104"] },
        { name: "Kehitysyhteistyö", codes: ["G0102"] },
        { name: "Muut", codes: ["G0105", "G0106", "G0108"] },
      ] },
    { id: "defence", name: "Puolustus", codes: ["G02"],
      desc: "Puolustusvoimat: henkilöstö, varusmieskoulutus, kalusto ja hankinnat, kuten F-35-hävittäjät. Lisäksi siviilipuolustus ja sotilaallinen apu ulkomaille.",
      parts: [
        { name: "Sotilaallinen puolustus", codes: ["G0201"] },
        { name: "Sotilaallinen apu ulkomaille", codes: ["G0203"] },
        { name: "Siviilipuolustus", codes: ["G0202"] },
        { name: "Muut", codes: ["G0204", "G0205"] },
      ] },
    { id: "order", name: "Järjestys ja turvallisuus", codes: ["G03"],
      desc: "Poliisi, pelastustoimi ja palokunnat, tuomioistuimet ja oikeusapu sekä vankilat.",
      parts: [
        { name: "Poliisi", codes: ["G0301"] },
        { name: "Pelastustoimi", codes: ["G0302"] },
        { name: "Tuomioistuimet ja oikeusapu", codes: ["G0303"] },
        { name: "Vankilat", codes: ["G0304"] },
        { name: "Muut", codes: ["G0305", "G0306"] },
      ] },
    { id: "culture", name: "Kulttuuri ja vapaa-aika", codes: ["G08"],
      desc: "Liikuntapaikat ja urheilun tuki, kirjastot, museot, teatterit ja orkesterit, nuorisotyö, Yle sekä uskonnollisten ja muiden yhteisöjen tuki.",
      parts: [
        { name: "Liikunta ja virkistys (liikuntapaikat, nuorisotyö)", codes: ["G0801"] },
        { name: "Kulttuuripalvelut (kirjastot, museot, teatterit)", codes: ["G0802"] },
        { name: "Radio, tv ja julkaisutoiminta (mm. Yle)", codes: ["G0803"] },
        { name: "Uskonnollisten ja muiden yhteisöjen tuki", codes: ["G0804"] },
        { name: "Muut", codes: ["G0805", "G0806"] },
      ] },
    { id: "environment", name: "Ympäristö ja asuminen", codes: ["G05", "G06"],
      desc: "Jäte- ja jätevesihuolto, ympäristönsuojelu ja luonnonsuojelu sekä asuinalueiden ja yhdyskuntien kehittäminen, vesihuolto ja katuvalaistus. Asumistuki ei kuulu tänne vaan sosiaaliturvaan.",
      parts: [
        { name: "Yhdyskuntakehitys ja asuinolot", codes: ["G0601", "G0602"] },
        { name: "Jäte- ja jätevesihuolto", codes: ["G0501", "G0502"] },
        { name: "Luonnon- ja ympäristönsuojelu", codes: ["G0503", "G0504", "G0505", "G0506"] },
        { name: "Vesihuolto ja katuvalaistus", codes: ["G0603", "G0604"] },
        { name: "Muut", codes: ["G0605", "G0606"] },
      ] },
  ];
  const cofogCodes = [...new Set(cofogDefs.flatMap((d) => [...d.codes, ...d.parts.flatMap((p) => p.codes)]))];
  const cofQ = await query("jmete/12a6.px", {
    sektoriluokitus_7_20230101: ["S13"],
    taloustoimi_1_20180101: ["OTES", "D62K"],
    julkisyht_teht_3_20010101: cofogCodes,
    contentscode: ["jmete-cp"],
    timeperiod_y: [cofogYear],
  });
  const cof = (c, t = "OTES") =>
    cofQ({ sektoriluokitus_7_20230101: "S13", taloustoimi_1_20180101: t, julkisyht_teht_3_20010101: c,
      contentscode: "jmete-cp", timeperiod_y: cofogYear }) ?? 0;
  const partValue = (p) =>
    p.codes.reduce((a, c) => a + (p.tx === "cash" ? cof(c, "D62K") : p.tx === "services" ? cof(c) - cof(c, "D62K") : cof(c)), 0);

  // Tehtäväjakauma on saatavilla vuoden viiveellä: skaalataan perusvuoden kokonaismenoihin
  // (pl. korot, jotka otetaan perusvuoden toteutuneista luvuista).
  const cofogRaw = cofogDefs.map((d) => ({ ...d, value: d.codes.reduce((a, c) => a + cof(c), 0) }));
  const nonInterest = cofogRaw.reduce((s, c) => s + c.value, 0);
  const scale = (expenditureTotal - interest) / nonInterest;
  const expenditure = [
    ...cofogRaw.map((d) => ({
      id: d.id,
      name: d.name,
      value: d.value * scale,
      desc: d.desc,
      parts: finishParts(d.value * scale, d.parts.map((p) => ({ name: p.name, value: partValue(p) * scale }))),
    })),
    { id: "interest", name: "Velan korot", value: interest, parts: [],
      desc: "Korot, jotka julkinen sektori maksaa velastaan. Kun korot nousivat vuodesta 2022 alkaen, korkomenot alkoivat kasvaa nopeasti, ja ne kasvavat edelleen sitä mukaa kuin vanhaa halpaa velkaa uusitaan kalliimpaan korkoon." },
  ];

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

  const neighbors = await fetchNeighbors();

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
    neighbors,
    sources: [
      { id: "15ah", name: "Tilastokeskus: Julkisyhteisöjen tulot ja menot (15ah)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15ah.px/" },
      { id: "15aj", name: "Tilastokeskus: Verot ja veronluonteiset maksut (15aj)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15aj.px/" },
      { id: "12a6", name: "Tilastokeskus: Julkisyhteisöjen menot tehtävittäin (12a6)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__jmete/statfin_jmete_pxt_12a6.px/" },
      { id: "122g", name: "Tilastokeskus: Julkisyhteisöjen alijäämä ja velka (122g)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__jali/statfin_jali_pxt_122g.px/" },
      { id: "vero", name: "Verohallinto: Henkilöasiakkaiden tuloverot (ansio- ja pääomatuloveron jako)", url: "https://vero2.stat.fi/PXWeb/pxweb/fi/Vero/Vero__Henkiloasiakkaiden_tuloverot__lopulliset__verot_maksut/verot_maksut_105.px/" },
      { id: "15a9", name: "Tilastokeskus: BKT (15a9)", url: "https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__ntp/statfin_ntp_pxt_15a9.px/" },
    ],
  };

  await mkdir("public/data", { recursive: true });
  // Lukulistat yhdelle riville, jotta aikasarjat eivät paisuta tiedostoa.
  const json = JSON.stringify(out, null, 2).replace(/\[\s+((?:-?[\d.]+|null)(?:,\s+(?:-?[\d.]+|null))*)\s+\]/g, (_, x) =>
    `[${x.split(/,\s+/).join(", ")}]`,
  );
  await writeFile("public/data/finance.json", json + "\n");

  const sumRev = out.revenue.reduce((s, r) => s + r.value, 0);
  const sumExp = out.expenditure.reduce((s, r) => s + r.value, 0);
  console.log(`Perusvuosi ${baseYear} (menojakauma ${cofogYear})`);
  console.log(`BKT ${out.gdp} | tulot ${out.revenueTotal} (osat ${sumRev}) | menot ${out.expenditureTotal} (osat ${sumExp})`);
  console.log(`Alijäämä ${out.balance} | velka ${out.debt} (${out.debtRatio} %) | korot ${out.interest}`);
  for (const it of [...out.revenue, ...out.expenditure]) {
    console.log(`\n${it.name} ${it.value}`);
    for (const p of it.parts) console.log(`   ${String(p.value).padStart(6)}  ${p.name}`);
  }
  console.log(history.slice(-3));
  console.log("Naapurit", JSON.stringify(neighbors.main), "vuodet", neighbors.mainYear, neighbors.taxYear, neighbors.cofogYear);
  console.table(neighbors.cofog.map((c) => ({ nimi: c.name, ...c.values })));
  console.table(neighbors.social.map((c) => ({ nimi: c.name, ...c.values })));
  console.log("velka", neighbors.debt[0], neighbors.debt.at(-1));
  for (const gr of neighbors.compare.groups) {
    const pcRow = (r, v) => {
      const sc = neighbors.compare.scale[r.year ?? gr.year];
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null ? null : Math.round((x / sc.gdp[k]) * 1000) / 10]));
    };
    const sc = neighbors.compare.scale[gr.year];
    const pc = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null ? null : Math.round((x / sc.gdp[k]) * 1000) / 10]));
    console.log(`\n${gr.title} ${gr.year}`);
    console.table(gr.rows.flatMap((r) => [{ nimi: r.name, ...pcRow(r, r.values) }, ...r.parts.map((p) => ({ nimi: "  " + p.name, ...pc(p.values) }))]));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
