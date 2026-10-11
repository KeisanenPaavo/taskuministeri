import { useEffect, useState } from "react";
import type { FinanceData } from "./types";
import { COEFFICIENTS, DEFAULT_SCENARIO, ROLLOVER, BEHAVIOR, type Scenario } from "./model";
import { money, num, perDay, pct, type Unit } from "./format";
import BudgetColumns from "./components/BudgetColumns";
import Simulator from "./components/Simulator";
import BiggerGame from "./components/BiggerGame";
import HundredEuros from "./components/HundredEuros";
import MuchOrLittle, { SubscriptionCompare } from "./components/MuchOrLittle";
import Neighbors from "./components/Neighbors";
import DebtMetaphors from "./components/DebtMetaphors";
import DebtChart from "./components/DebtChart";
import Cite, { SourcesContext } from "./components/Cite";
import { track, trackChapters } from "./track";

// Skenaario tallennetaan URL:iin, jotta sen voi jakaa linkkinä.
function readScenario(): Scenario {
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get("s");
    if (raw) return { ...DEFAULT_SCENARIO, ...JSON.parse(raw) };
  } catch {
    /* virheellinen linkki: käytetään oletuksia */
  }
  return DEFAULT_SCENARIO;
}

function writeScenario(s: Scenario) {
  const diff = Object.fromEntries(
    Object.entries(s).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(DEFAULT_SCENARIO[k as keyof Scenario])),
  );
  const url = Object.keys(diff).length
    ? `#s=${encodeURIComponent(JSON.stringify(diff))}`
    : location.pathname + location.search;
  history.replaceState(null, "", url);
}

const UNITS: { id: Unit; long: string; short: string; title: string }[] = [
  { id: "day", long: "Per asukas päivässä", short: "€ / pv", title: "Euroa jokaista suomalaista kohden päivässä" },
  { id: "total", long: "Koko Suomi", short: "mrd €", title: "Koko Suomen luvut miljardeina euroina" },
];

// Viimeisen luvun välilehdet: simulaattori ja pelit. Kumpi on isompi? on sivun alussa ensimmäisenä lukuna.
const GAMES = [
  { id: "sim", name: "Kokeile itse", desc: "Säädä veroja ja menoja, katso velkaa" },
  { id: "hundred", name: "Sata euroa", desc: "Jaa 100 € ja vertaa Suomeen" },
] as const;
type GameId = (typeof GAMES)[number]["id"];

// Lähteet, joiden luvut on kirjoitettu suoraan sivulle (eivät tule datahausta).
const EXTRA_SOURCES = [
  {
    id: "spk",
    name: "Suomen Pankki: Kotitalouksien asuntolainakanta (toukokuu 2026)",
    url: "https://www.sttinfo.fi/tiedote/72170068/kotitalouslainojen-korot-nousivat-toukokuussa-2026?publisherId=1865&lang=fi",
  },
  {
    id: "palkat",
    name: "Tilastokeskus: Palkka- ja palkkiotulojen mediaani (joulukuu 2025)",
    url: "https://stat.fi/tup/kokeelliset-tilastot/tulorekisterin_palkat_ja_palkkiot/2026-02-09/index.html",
  },
];

// Lehden päiväys, esim. "Lauantai 10. lokakuuta 2026".
const dateline = (() => {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("fi-FI", { weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("fi-FI", { day: "numeric", month: "long", year: "numeric" }).format(now);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date}`;
})();

/** Pörssinauhan tyylinen avainlukurivi: tuorein vuosi ja muutos edellisestä. */
function Ticker({ data }: { data: FinanceData }) {
  const [prev, last] = data.history.slice(-2);
  const deficit = data.expenditureTotal - data.revenueTotal;
  const items: { label: string; value: string; change?: string; good?: boolean }[] = [
    {
      label: "Julkinen velka",
      value: `${pct(last.debtRatio, 1)} BKT:stä`,
      change: `${last.debtRatio >= prev.debtRatio ? "▲" : "▼"} ${num(last.debtRatio - prev.debtRatio, 1, true)} %-yks.`,
      good: last.debtRatio < prev.debtRatio,
    },
    {
      label: "Velka",
      value: money(last.debt, data.population, "total"),
      change: `${last.debt >= prev.debt ? "▲" : "▼"} ${money(last.debt - prev.debt, data.population, "total", true)}`,
      good: last.debt < prev.debt,
    },
    {
      label: "Alijäämä",
      value: `${pct(Math.abs(last.balanceRatio), 1)} BKT:stä`,
      change: `${-last.balanceRatio >= -prev.balanceRatio ? "▲" : "▼"} ${num(-last.balanceRatio + prev.balanceRatio, 1, true)} %-yks.`,
      good: -last.balanceRatio < -prev.balanceRatio,
    },
    { label: "Menot", value: perDay(data.expenditureTotal, data.population) },
    { label: "Uusi velka", value: perDay(deficit, data.population) },
    { label: "Korkomenot", value: money(data.interest, data.population, "total") },
  ];
  return (
    <div className="ticker" aria-label={`Avainluvut ${last.year}, muutos edellisestä vuodesta`}>
      <div className="wrap ticker-row">
        <span className="ticker-title">Avainluvut {last.year}</span>
        {items.map((it) => (
          <span key={it.label} className="ticker-item">
            <span className="ticker-label">{it.label}</span> <b>{it.value}</b>
            {it.change && <span className={`ticker-change ${it.good ? "good" : "bad"}`}> {it.change}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Simulaattorin laskentatapa ja kertoimet; näytetään simulaattorin alla avattavana. */
function SimulatorNotes() {
  return (
    <div className="sim-notes">
      <ul>
        <li>Verotulot kasvavat samaa tahtia kuin talous (reaalikasvu + inflaatio).</li>
        <li>
          Menot kasvavat hintojen nousun verran ja lisäksi luontaisen menokasvun verran (oletus 1,2 % vuodessa, mm.
          ikääntyminen). Jos talous kasvaa oletusta nopeammin, menot seuraavat erotusta puoliksi vuoden viiveellä, koska
          palkat ja osin eläkkeet seuraavat ansiokehitystä. Lisätyöllisyydestä syntyvää kasvua menot eivät seuraa.
        </li>
        <li>
          Velasta uusitaan noin {pct(ROLLOVER * 100, 0)} vuodessa, joten korkojen nousu näkyy korkomenoissa vähitellen.
        </li>
        <li>
          Veromuutosten tuotot perustuvat valtiovarainministeriön vaikutusarvioihin. Osa tuotosta menetetään
          käyttäytymisvaikutusten takia (tulovero {pct(BEHAVIOR.incomeTax * 100, 0)}, ALV {pct(BEHAVIOR.vat * 100, 0)},
          yhteisövero {pct(BEHAVIOR.corporateTax * 100, 0)}, valmisteverot {pct(BEHAVIOR.excise * 100, 0)}).
        </li>
        <li>
          Malli on tarkoituksella yksinkertainen. Se ei huomioi esim. menoleikkausten vaikutusta talouskasvuun,
          työllisyysvaikutuksia tai suhdanteiden heilahteluja. Virallisia ennusteita tekevät valtiovarainministeriö ja
          Suomen Pankki.
        </li>
      </ul>
      <h4>Kertoimet ja niiden lähteet</h4>
      <div className="coef-table">
        <table>
          <thead>
            <tr>
              <th>Kerroin</th>
              <th>Arvo</th>
              <th>Lähde</th>
            </tr>
          </thead>
          <tbody>
            {COEFFICIENTS.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.value}</td>
                <td>
                  {c.own && <span className="tag">oma arvio</span>}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.source}
                    </a>
                  ) : (
                    c.source
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Selkeästi nimetty valinta: missä yksikössä luvut näytetään. */
function UnitPicker({ unit, setUnit }: { unit: Unit; setUnit: (u: Unit) => void }) {
  return (
    <div className="unit-picker">
      <span className="unit-label" id="unit-label">
        Näytä luvut
      </span>
      <div className="toggle" role="group" aria-labelledby="unit-label">
        {UNITS.map((u) => (
          <button
            key={u.id}
            className={unit === u.id ? "on" : ""}
            aria-pressed={unit === u.id}
            onClick={() => setUnit(u.id)}
            title={u.title}
          >
            <span className="long">{u.long}</span>
            <span className="short">{u.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** initialData: esirenderöinnissä ja selaimessa valmiiksi haettu data, jolloin sivu ei näytä latausviestiä. */
export default function App({ initialData }: { initialData?: FinanceData }) {
  const [data, setData] = useState<FinanceData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("day");
  const [scenario, setScenarioState] = useState<Scenario>(readScenario);
  const [game, setGame] = useState<GameId>("sim");

  useEffect(() => {
    if (initialData) return;
    fetch(`${import.meta.env.BASE_URL}data/finance.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [initialData]);

  // Lukusyvyys: tapahtuma, kun lukija pääsee kunkin luvun kohdalle.
  useEffect(() => {
    if (!data) return;
    return trackChapters({
      arvaa: "Luku 1: Arvaa",
      paljon: "Luku 2: Paljon vai vähän",
      velka: "Luku 3: Velka",
      naapurit: "Luku 4: Naapurit",
      kokeile: "Luku 5: Kokeile",
      lahteet: "Sivun loppu",
    });
  }, [data]);

  // Ankkurilinkki (#kokeile) toimii vasta, kun sisältö on ladattu.
  useEffect(() => {
    if (!data) return;
    const hash = location.hash.slice(1);
    // Vanhat ankkurit ohjataan uusiin lukuihin; skenaariolinkki (#s=…) vie simulaattoriin.
    const alias: Record<string, string> = { haaste: "kokeile", pelit: "kokeile", luvut: "paljon", rahat: "rahat" };
    const id = hash.startsWith("s=") ? "kokeile" : (alias[hash] ?? hash);
    if (!id || !/^[a-z]+$/.test(id)) return;
    // Odotetaan, että kaaviot ja fontit ovat asettuneet, jotta kohta ei siirry vierityksen jälkeen.
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 300);
    return () => clearTimeout(t);
  }, [data]);

  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    writeScenario(s);
  };

  if (error) return <div className="wrap hero">Datan lataus epäonnistui: {error}</div>;
  if (!data) return <div className="wrap hero">Ladataan…</div>;

  const deficit = data.expenditureTotal - data.revenueTotal;
  const unitPicker = <UnitPicker unit={unit} setUnit={setUnit} />;
  const defence = data.expenditure.find((e) => e.id === "defence")?.value ?? 0;
  const day = (v: number) => perDay(v, data.population).replace(" €/pv", "");
  const bn = (v: number) => num(v / 1000, 1);
  const pensions = data.expenditure.find((e) => e.id === "pensions")!;
  // Viimeinen ylijäämävuosi ja velka silloin, tarinan vertailukohdaksi.
  const lastSurplus = [...data.history].reverse().find((h) => h.balance > 0);

  const sources = [...data.sources, ...data.neighbors.sources, ...EXTRA_SOURCES];

  return (
    <SourcesContext.Provider value={sources}>
      <div className="has-mobile-bar">
        <header className="masthead-wrap">
          <div className="wrap">
            <div className="masthead-top">
              <span>{dateline}</span>
              <span className="masthead-motto">Miljardit taskukoossa</span>
              <a className="masthead-source" href="#lahteet">
                Lähteet: Tilastokeskus · Eurostat
              </a>
            </div>
            <a className="nameplate" href="#">
              Taskuministeri
            </a>
            <nav className="sections" aria-label="Osastot">
              <a href="#arvaa">Arvaa</a>
              <a href="#paljon">Paljon vai vähän</a>
              <a href="#velka">Velka</a>
              <a href="#naapurit">Naapurit</a>
              <a href="#kokeile">Kokeile ja pelaa</a>
            </nav>
          </div>
          <Ticker data={data} />
        </header>

        <main className="wrap story">
          <div className="hero" id="arvaa">
            <p className="kicker">Julkinen talous {data.baseYear}</p>
            <h1>Onko miljardi paljon vai vähän?</h1>
            <p className="byline">
              Taskuministerin toimitus · <a href="#lahteet">Lähteet</a>: Tilastokeskus, Eurostat, Verohallinto, Suomen
              Pankki, valtiovarainministeriö · Päivitetty {new Date(data.generated).toLocaleDateString("fi-FI")}
            </p>
            <p className="lead dropcap">
              Suomen julkinen sektori käytti viime vuonna {Math.round(data.expenditureTotal / 1000)} miljardia euroa.
              Luku on niin suuri, että sitä on vaikea hahmottaa, ja siksi miljardeista on helppo väitellä. Tässä jutussa
              miljardit pienennetään taskukokoon: euroiksi päivässä, Netflix-tilauksiksi ja kahvikupeiksi.
            </p>
            <p className="story-text">Aloitetaan pelillä. Arvaa, kumpi on isompi.</p>
            <p className="chapter">Luku 1 · Arvaa</p>
            <BiggerGame data={data} />
          </div>

          <section id="paljon">
            <p className="chapter">Luku 2</p>
            <h2 className="section-title">Paljon vai vähän?</h2>
            <p className="section-lead">
              Vuonna {data.baseYear} julkinen sektori käytti {day(data.expenditureTotal)} euroa päivässä jokaista
              suomalaista kohden, vauvasta vaariin. Siitä {day(deficit)} euroa otettiin velaksi.
              <Cite ids={["15ah"]} /> Onko se paljon vai vähän? Vastaus riippuu siitä, mihin vertaa.
            </p>
            <MuchOrLittle data={data} />
            <SubscriptionCompare data={data} />

            <div id="rahat" className="story-block">
              <div className="section-head">
                <h3 className="story-head">Mistä rahat tulevat ja mihin ne menevät?</h3>
                {unitPicker}
              </div>
              <p className="story-text">
                Rahaa käyttävät valtio, kunnat, hyvinvointialueet ja työeläkelaitokset. Tuloja kertyi{" "}
                {bn(data.revenueTotal)} miljardia ja menoja {bn(data.expenditureTotal)} miljardia euroa. Suurin
                yksittäinen meno ovat eläkkeet ja vanhuspalvelut, {day(pensions.value)} euroa päivässä asukasta kohden.
                Erotus, {bn(deficit)} miljardia, otettiin velaksi.
                <Cite ids={["15ah", "15aj", "12a6", "vero"]} /> Napauta palaa, niin näet, mitä siihen kuuluu.
              </p>
              <BudgetColumns data={data} unit={unit} />
            </div>

            <p className="story-text story-bridge">
              Tulojen päällä oleva punainen pala on velkaa. Yksi vuosi ei kaada taloutta, mutta sama toistuu vuodesta
              toiseen.
            </p>
          </section>

          <section id="velka">
            <p className="chapter">Luku 3</p>
            <h2 className="section-title">Velka kasvaa</h2>
            <p className="section-lead">
              {lastSurplus && (
                <>
                  Vielä vuonna {lastSurplus.year} julkinen talous teki ylijäämää, ja velkaa oli {bn(lastSurplus.debt)}{" "}
                  miljardia euroa eli {pct(lastSurplus.debtRatio, 0)} bruttokansantuotteesta. Sen jälkeen menot ovat
                  ylittäneet tulot joka vuosi.{" "}
                </>
              )}
              Vuoden {data.baseYear} lopussa velkaa oli {bn(data.debt)} miljardia euroa eli {pct(data.debtRatio, 1)}{" "}
              BKT:stä. EU:n viitearvo on 60 %.
              <Cite ids={["122g", "15a9"]} />
            </p>
            <DebtChart data={data} />
            <p className="story-text">
              Velasta maksetaan korkoa {bn(data.interest)} miljardia euroa vuodessa, {day(data.interest)} euroa päivässä
              jokaista suomalaista kohden. Se on{" "}
              {data.interest > defence ? "enemmän kuin koko puolustukseen" : "lähes yhtä paljon kuin puolustukseen"}{" "}
              käytetty summa, ja korkoihin menevä raha on pois muista menoista.
            </p>
            <DebtMetaphors data={data} />
            <p className="story-text story-bridge">
              Onko Suomen velka poikkeuksellinen? Katsotaan, miltä naapureissa näyttää.
            </p>
          </section>

          <section id="naapurit">
            <p className="chapter">Luku 4</p>
            <h2 className="section-title">Naapurit: Suomi, Ruotsi ja Viro</h2>
            <p className="section-lead">
              Ruotsissa verotetaan lähes yhtä paljon kuin Suomessa, mutta velkaa on alle puolet. Viro taas kerää ja
              käyttää vähemmän. Luvut ovat prosentteja bruttokansantuotteesta, jotta eri kokoiset maat ovat
              vertailukelpoisia.
              <Cite ids={["gov_10a_main", "gov_10a_exp", "gov_10a_taxag", "gov_10dd_edpt1", "nama"]} />
            </p>
            <Neighbors n={data.neighbors} />
            <p className="story-text story-bridge">
              Mitä sitten pitäisi tehdä? Siihen ei ole yhtä oikeaa vastausta, mutta voit kokeilla itse.
            </p>
          </section>

          <section id="kokeile">
            <p className="chapter">Luku 5</p>
            <h2 className="section-title">Nyt on sinun vuorosi</h2>
            <p className="section-lead">
              Säädä veroja, menoja ja talouskasvua ja katso, mitä velalle tapahtuu seuraavan kymmenen vuoden aikana. Tai
              jaa sata euroa itse ja vertaa Suomeen.
            </p>
            <div className="game-tabs" role="tablist">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={game === g.id}
                  className={game === g.id ? "on" : ""}
                  onClick={() => {
                    setGame(g.id);
                    track("Välilehti", { peli: g.name });
                  }}
                >
                  <span>
                    <b>{g.name}</b>
                    <small>{g.desc}</small>
                  </span>
                </button>
              ))}
            </div>
            {game === "sim" && (
              <>
                <div className="sim-bar">
                  {unitPicker}

                  <button className="chip" onClick={() => setScenario(DEFAULT_SCENARIO)}>
                    ↺ Aloita alusta
                  </button>
                </div>
                <Simulator data={data} unit={unit} scenario={scenario} setScenario={setScenario} />
                <details className="more-info">
                  <summary>Miten simulaattori laskee?</summary>
                  <SimulatorNotes />
                </details>
              </>
            )}
            {game === "hundred" && <HundredEuros data={data} />}
          </section>
        </main>

        <footer className="footer" id="lahteet">
          <div className="wrap">
            <div>
              <h3>Lähteet</h3>
              <ol className="source-list">
                {sources.map((s) => (
                  <li key={s.id} id={`lahde-${s.id}`}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  </li>
                ))}
              </ol>
              <p>
                Luvut kattavat koko julkisen talouden (julkisyhteisöt, S13). Vuoden {data.baseYear} tiedot ovat
                ennakkotietoja. Alijäämä on tulojen ja menojen erotus, ja se voi poiketa hieman virallisesta
                EDP-alijäämästä. Data päivitetty {data.generated}.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </SourcesContext.Provider>
  );
}
