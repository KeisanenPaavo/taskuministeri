import { useEffect, useState } from "react";
import type { FinanceData } from "./types";
import { COEFFICIENTS, DEFAULT_SCENARIO, ROLLOVER, BEHAVIOR, type Scenario } from "./model";
import { money, perCapita, perDay, pct, type Unit } from "./format";
import { challengeNumber, generateChallenge, helsinkiDate } from "./daily";
import BudgetColumns from "./components/BudgetColumns";
import Simulator from "./components/Simulator";
import BiggerGame from "./components/BiggerGame";
import HundredEuros from "./components/HundredEuros";
import DailyChallenge from "./components/DailyChallenge";
import { EXPENDITURE_COLORS, REVENUE_COLORS } from "./colors";
import MuchOrLittle from "./components/MuchOrLittle";

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
  { id: "total", long: "Koko Suomi", short: "Suomi", title: "Koko Suomen luvut miljardeina euroina" },
  { id: "year", long: "Per asukas / vuosi", short: "€/v", title: "Euroa jokaista suomalaista kohden vuodessa" },
  { id: "day", long: "Per asukas / päivä", short: "€/pv", title: "Euroa jokaista suomalaista kohden päivässä" },
];

// Lehden päiväys otsikkoon, esim. "Lauantai 10.10.2026".
const dateline = (() => {
  const s = new Intl.DateTimeFormat("fi-FI", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
})();

const GAMES = [
  { id: "bigger", name: "Kumpi on isompi?", desc: "Arvaa kumpi kahdesta maksaa enemmän" },
  { id: "daily", name: "Päivän haaste", desc: "Uusi talouspulma joka päivä" },
  { id: "hundred", name: "Sata euroa", desc: "Jaa 100 € ja vertaa Suomeen" },
] as const;
type GameId = (typeof GAMES)[number]["id"];

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("total");
  const [scenario, setScenarioState] = useState<Scenario>(readScenario);
  const [copied, setCopied] = useState(false);
  // Päivän haasteen jakolinkki (#haaste) avaa suoraan haaste-välilehden.
  const [game, setGame] = useState<GameId>(() => (location.hash === "#haaste" ? "daily" : "bigger"));

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/finance.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  // Ankkurilinkki (#kokeile) toimii vasta, kun sisältö on ladattu.
  useEffect(() => {
    if (!data) return;
    const hash = location.hash.slice(1);
    const id = hash === "haaste" ? "peli" : hash;
    if (id && /^[a-z]+$/.test(id)) document.getElementById(id)?.scrollIntoView();
  }, [data]);

  const setScenario = (s: Scenario) => {
    setScenarioState(s);
    writeScenario(s);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* leikepöytä ei käytettävissä */
    }
  };

  if (error) return <div className="wrap hero">Datan lataus epäonnistui: {error}</div>;
  if (!data) return <div className="wrap hero">Ladataan…</div>;

  const deficit = data.expenditureTotal - data.revenueTotal;
  const today = generateChallenge(data, challengeNumber(helsinkiDate()));
  const openDaily = (e: React.MouseEvent) => {
    e.preventDefault();
    setGame("daily");
    history.replaceState(null, "", "#haaste");
    document.getElementById("peli")?.scrollIntoView({ behavior: "smooth" });
  };
  const fmt = (v: number) => money(v, data.population, unit);
  const defence = data.expenditure.find((e) => e.id === "defence")?.value ?? 0;
  const interestVsDefence =
    data.interest > defence
      ? "enemmän kuin puolustukseen"
      : `${pct((data.interest / defence) * 100, 0)} puolustusmenoista`;

  return (
    <div className="has-mobile-bar">
      <header className="topbar">
        <div className="wrap masthead">
          <span className="dateline">{dateline}</span>
          <a className="brand" href="#">
            Taskuministeri
          </a>
          <div className="toggle" role="group" aria-label="Yksikkö">
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
      </header>

      <main className="wrap">
        <div className="hero">
          <div className="hero-main">
            <p className="kicker">Julkinen talous {data.baseYear}</p>
            <h1>Onko miljardi paljon vai vähän?</h1>
            <p className="lead">
              Julkinen sektori käytti vuonna {data.baseYear} yhteensä {Math.round(data.expenditureTotal / 1000)}{" "}
              miljardia euroa. Se on {perDay(data.expenditureTotal, data.population).replace(" €/pv", "")} euroa
              päivässä jokaista suomalaista kohden, ja siitä {perDay(deficit, data.population).replace(" €/pv", "")}{" "}
              euroa otettiin velaksi.
            </p>
            <p className="hero-note">
              Miljardeista väitellään joka päivä, mutta harva pystyy hahmottamaan niitä. Tällä sivulla ne muutetaan
              euroiksi, verrataan toisiinsa ja pääset kokeilemaan itse. Avoimen datan pohjalta, ilman puoluekantaa.
            </p>
          </div>
          <aside className="hero-aside">
            <p className="kicker-ink">Päivän haaste #{today.number}</p>
            <p className="hero-aside-title">{today.theme.name}</p>
            <p className="hero-aside-text">{today.theme.intro(data)}</p>
            <a className="btn primary" href="#haaste" onClick={openDaily}>
              Ratkaise haaste
            </a>
            <p className="hero-aside-small">Uusi pulma joka päivä keskiyöllä.</p>
          </aside>
        </div>

        <MuchOrLittle data={data} />

        <nav className="contents" aria-label="Sivun sisältö">
          <a href="#peli">
            <b>Pelaa ja opi →</b>
            <span>Kumpi maksaa enemmän: puolustus vai velan korot? Kolme peliä miljardien mittasuhteista.</span>
          </a>
          <a href="#rahat">
            <b>Tulot ja menot →</b>
            <span>Mistä rahat tulevat ja mihin jokainen euro käytetään.</span>
          </a>
          <a href="#kokeile">
            <b>Kokeile itse →</b>
            <span>Muuta veroja, menoja ja korkoja ja katso, mitä velalle tapahtuu kymmenessä vuodessa.</span>
          </a>
        </nav>
        <p className="trust">
          Luvut: Tilastokeskus. Veromuutosten vaikutukset: valtiovarainministeriön arviot. Laskentatapa ja oletukset
          ovat <a href="#lahteet">avoimesti nähtävillä</a>.
        </p>

        <section id="peli">
          <h2 className="section-title">Pelaa ja opi</h2>
          <p className="section-lead">
            Testaa, kuinka hyvin tunnet Suomen talouden mittasuhteet, ratkaise päivän talouspulma tai jaa itse sata
            euroa.
          </p>
          <div className="game-tabs" role="tablist">
            {GAMES.map((g) => (
              <button
                key={g.id}
                role="tab"
                aria-selected={game === g.id}
                className={game === g.id ? "on" : ""}
                onClick={() => setGame(g.id)}
              >
                <span>
                  <b>{g.name}</b>
                  <small>{g.desc}</small>
                </span>
              </button>
            ))}
          </div>
          {game === "bigger" && <BiggerGame data={data} />}
          {game === "daily" && <DailyChallenge data={data} />}
          {game === "hundred" && <HundredEuros data={data} />}
        </section>

        <section id="rahat">
          <h2 className="section-title">Tulot ja menot {data.baseYear}</h2>
          <p className="section-lead">
            Valtio, kunnat, hyvinvointialueet ja eläkelaitokset käyttivät vuonna {data.baseYear} yhteensä{" "}
            {money(data.expenditureTotal, data.population, "total")}. Tuloja kertyi{" "}
            {money(deficit, data.population, "total")} vähemmän, ja erotus otettiin velaksi.
          </p>
          <div className="kpis">
            <div className="card kpi">
              <div className="label">
                <span className="dot" style={{ background: REVENUE_COLORS.socialContrib }} />
                Tulot {data.baseYear}
              </div>
              <div className="value">{fmt(data.revenueTotal)}</div>
              <div className="sub">{pct((data.revenueTotal / data.gdp) * 100)} BKT:stä</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <span className="dot" style={{ background: EXPENDITURE_COLORS.health }} />
                Menot {data.baseYear}
              </div>
              <div className="value">{fmt(data.expenditureTotal)}</div>
              <div className="sub">{pct((data.expenditureTotal / data.gdp) * 100)} BKT:stä</div>
            </div>
            <div className="card kpi bad">
              <div className="label">
                <span className="dot" style={{ background: "var(--deficit)" }} />
                Alijäämä eli otettiin velaksi
              </div>
              <div className="value">{fmt(deficit)}</div>
              <div className="sub">{pct((deficit / data.expenditureTotal) * 100, 0)} menoista rahoitettiin velalla</div>
            </div>
          </div>
          <BudgetColumns data={data} unit={unit} />
        </section>

        <section id="velka">
          <h2 className="section-title">Velka kasvaa</h2>
          <p className="section-lead">
            Kun menot ovat tuloja suuremmat, erotus otetaan velaksi. Velasta maksetaan korkoa, joka on pois muista
            menoista.
          </p>
          <div className="debt-strip">
            <div className="card kpi">
              <div className="label">Julkinen velka</div>
              <div className="value">{fmt(data.debt)}</div>
              <div className="sub">vuoden {data.baseYear} lopussa</div>
            </div>
            <div className="card kpi">
              <div className="label">Suhteessa BKT:hen</div>
              <div className="value">{pct(data.debtRatio, 1)}</div>
              <div className="sub">EU:n viitearvo 60 %</div>
            </div>
            <div className="card kpi">
              <div className="label">Velkaa per asukas</div>
              <div className="value">{perCapita(data.debt, data.population)}</div>
              <div className="sub">jokaista suomalaista kohden</div>
            </div>
            <div className="card kpi">
              <div className="label">Korkomenot</div>
              <div className="value">{fmt(data.interest)}</div>
              <div className="sub">vuodessa, {interestVsDefence}</div>
            </div>
          </div>
        </section>

        <section id="kokeile">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 className="section-title">Kokeile itse: miten velka kehittyy?</h2>
              <p className="section-lead" style={{ marginBottom: 16 }}>
                Liikuta säätimiä ja näe heti, miten talouskasvu, korot, verot ja menot vaikuttavat alijäämään ja velkaan
                seuraavan kymmenen vuoden aikana.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="chip" onClick={share}>
                {copied ? "Linkki kopioitu" : "Jaa skenaario"}
              </button>
              <button className="chip" onClick={() => setScenario(DEFAULT_SCENARIO)}>
                ↺ Aloita alusta
              </button>
            </div>
          </div>
          <Simulator data={data} unit={unit} scenario={scenario} setScenario={setScenario} />
        </section>
      </main>

      <footer className="footer" id="lahteet">
        <div className="wrap cols">
          <div>
            <h3>Miten simulaattori laskee?</h3>
            <ul>
              <li>Verotulot kasvavat samaa tahtia kuin talous (reaalikasvu + inflaatio).</li>
              <li>
                Menot kasvavat hintojen nousun verran ja lisäksi luontaisen menokasvun verran (oletus 1,2 % vuodessa,
                mm. ikääntyminen). Jos talous kasvaa oletusta nopeammin, menot seuraavat erotusta puoliksi vuoden
                viiveellä, koska palkat ja osin eläkkeet seuraavat ansiokehitystä. Lisätyöllisyydestä syntyvää kasvua
                menot eivät seuraa.
              </li>
              <li>
                Velasta uusitaan noin {pct(ROLLOVER * 100, 0)} vuodessa, joten korkojen nousu näkyy korkomenoissa
                vähitellen.
              </li>
              <li>
                Veromuutosten tuotot perustuvat valtiovarainministeriön vaikutusarvioihin. Osa tuotosta menetetään
                käyttäytymisvaikutusten takia (tulovero {pct(BEHAVIOR.incomeTax * 100, 0)}, ALV{" "}
                {pct(BEHAVIOR.vat * 100, 0)}, yhteisövero {pct(BEHAVIOR.corporateTax * 100, 0)}, valmisteverot{" "}
                {pct(BEHAVIOR.excise * 100, 0)}).
              </li>
              <li>
                Malli on tarkoituksella yksinkertainen. Se ei huomioi esim. menoleikkausten vaikutusta talouskasvuun,
                työllisyysvaikutuksia tai suhdanteiden heilahteluja. Virallisia ennusteita tekevät
                valtiovarainministeriö ja Suomen Pankki.
              </li>
            </ul>
          </div>
          <div>
            <h3>Lähteet</h3>
            <ul>
              {data.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
            <p>
              Luvut kattavat koko julkisen talouden (julkisyhteisöt, S13). Vuoden {data.baseYear} tiedot ovat
              ennakkotietoja. Alijäämä on tulojen ja menojen erotus, ja se voi poiketa hieman virallisesta
              EDP-alijäämästä. Data päivitetty {data.generated}.
            </p>
          </div>
        </div>
        <div className="wrap">
          <h3 style={{ marginTop: 24 }}>Kertoimet ja niiden lähteet</h3>
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
      </footer>
    </div>
  );
}
