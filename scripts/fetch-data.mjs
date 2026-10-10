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
    sources: [
      { name: "Eurostat: Julkisyhteisöjen tulot ja menot (gov_10a_main)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_main/default/table" },
      { name: "Eurostat: Menot tehtävittäin, COFOG (gov_10a_exp)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table" },
      { name: "Eurostat: Julkinen velka (gov_10dd_edpt1)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10dd_edpt1/default/table" },
      { name: "Eurostat: Verot ja sosiaaliturvamaksut (gov_10a_taxag)", url: "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_taxag/default/table" },
    ],
  };
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
  const taxCodes = ["SSS", "1100", "1200", "2000", "210001", "210002", "220001", "220002",
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

  const taxesTotal = tax("SSS");
  const otherTaxValue = taxesTotal - tax("1100") - tax("2000") - tax("5111") - tax("5121") - tax("1200");
  const revenue = [
    { id: "incomeTax", name: "Ansio- ja pääomatulovero", value: tax("1100"),
      desc: "Verot, jotka maksetaan palkoista, eläkkeistä, verotettavista etuuksista (esim. työttömyyspäiväraha) sekä pääomatuloista kuten osingoista, vuokrista ja myyntivoitoista. Valtion tulovero on progressiivinen: pienituloisimmat eivät maksa sitä lainkaan. Kunnallisvero on kaikille saman suuruinen prosentti, joka vaihtelee kunnittain.",
      parts: finishParts(tax("1100"), [
        { name: "Valtion ansio- ja pääomatulovero", value: tax("1100", "S1311") },
        { name: "Kunnallisvero", value: tax("1100", "S1313") },
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
  for (const it of [...out.revenue, ...out.expenditure]) {
    console.log(`\n${it.name} ${it.value}`);
    for (const p of it.parts) console.log(`   ${String(p.value).padStart(6)}  ${p.name}`);
  }
  console.log(history.slice(-3));
  console.log("Naapurit", JSON.stringify(neighbors.main), "vuodet", neighbors.mainYear, neighbors.taxYear, neighbors.cofogYear);
  console.table(neighbors.cofog.map((c) => ({ nimi: c.name, ...c.values })));
  console.table(neighbors.social.map((c) => ({ nimi: c.name, ...c.values })));
  console.log("velka", neighbors.debt[0], neighbors.debt.at(-1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
