import { useEffect, useState } from "react";
import type { FinanceData } from "./types";
import { COEFFICIENTS, DEFAULT_SCENARIO, ROLLOVER, BEHAVIOR, type Scenario } from "./model";
import { money, perCapita, perDay, pct, type Unit } from "./format";
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
  { id: "day", long: "Per asukas päivässä", short: "€ / pv", title: "Euroa jokaista suomalaista kohden päivässä" },
  { id: "year", long: "Per asukas vuodessa", short: "€ / v", title: "Euroa jokaista suomalaista kohden vuodessa" },
  { id: "total", long: "Miljardeina", short: "mrd €", title: "Koko Suomen luvut miljardeina euroina" },
];

// Lisäpelit sivun lopussa. Kumpi on isompi? on sivun alussa tarinan ensimmäisenä lukuna.
const GAMES = [
  { id: "daily", name: "Päivän haaste", desc: "Uusi talouspulma joka päivä" },
  { id: "hundred", name: "Sata euroa", desc: "Jaa 100 € ja vertaa Suomeen" },
] as const;
type GameId = (typeof GAMES)[number]["id"];

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

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("day");
  const [scenario, setScenarioState] = useState<Scenario>(readScenario);
  const [copied, setCopied] = useState(false);
  const [game, setGame] = useState<GameId>("daily");

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
    // Päivän haasteen jakolinkki (#haaste) vie pelien lukuun, jossa haaste on oletuksena auki.
    const id = hash === "haaste" ? "pelit" : hash;
    if (!id || !/^[a-z]+$/.test(id)) return;
    // Odotetaan, että kaaviot ja fontit ovat asettuneet, jotta kohta ei siirry vierityksen jälkeen.
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 300);
    return () => clearTimeout(t);
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
  const unitPicker = <UnitPicker unit={unit} setUnit={setUnit} />;
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
          <a className="brand" href="#">
            Taskuministeri
          </a>
          <nav className="nav" aria-label="Sivun luvut">
            <a href="#arvaa">Arvaa</a>
            <a href="#luvut">Paljon vai vähän</a>
            <a href="#rahat">Tulot ja menot</a>
            <a href="#velka">Velka</a>
            <a href="#kokeile">Kokeile itse</a>
            <a href="#pelit">Pelit</a>
          </nav>
        </div>
      </header>

      <main className="wrap">
        <div className="hero" id="arvaa">
          <p className="kicker">Julkinen talous {data.baseYear}</p>
          <h1>Onko miljardi paljon vai vähän?</h1>
          <p className="lead">
            Miljardeista väitellään joka päivä, mutta harva osaa sanoa, mikä niistä on paljon. Aloitetaan pelillä:
            arvaa, kumpi on isompi.
          </p>
          <p className="chapter">Luku 1 · Arvaa</p>
          <BiggerGame data={data} />
        </div>

        <section id="luvut">
          <p className="chapter">Luku 2</p>
          <h2 className="section-title">Paljon vai vähän?</h2>
          <p className="section-lead">
            Julkinen sektori käytti vuonna {data.baseYear} yhteensä {Math.round(data.expenditureTotal / 1000)} miljardia
            euroa. Se on {perDay(data.expenditureTotal, data.population).replace(" €/pv", "")} euroa päivässä jokaista
            suomalaista kohden, ja siitä {perDay(deficit, data.population).replace(" €/pv", "")} euroa otettiin velaksi.
            Vastaus riippuu siitä, mihin vertaa.
          </p>
          <MuchOrLittle data={data} />
        </section>

        <section id="rahat">
          <p className="chapter">Luku 3</p>
          <div className="section-head">
            <h2 className="section-title">Tulot ja menot {data.baseYear}</h2>
            {unitPicker}
          </div>
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
          <p className="chapter">Luku 4</p>
          <h2 className="section-title">Velka kasvaa</h2>
          <p className="section-lead">
            Kun menot ovat tuloja suuremmat, erotus otetaan velaksi. Velasta maksetaan korkoa, joka on pois muista
            menoista.
          </p>
          <div className="debt-strip">
            <div className="card kpi">
              <div className="label">Julkinen velka</div>
              {/* Velka on kertynyt määrä, ei vuotuinen virta, joten sitä ei muuteta päivä- tai vuosisummaksi. */}
              <div className="value">{money(data.debt, data.population, "total")}</div>
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
              <p className="chapter">Luku 5</p>
              <h2 className="section-title">Kokeile itse: miten velka kehittyy?</h2>
              <p className="section-lead" style={{ marginBottom: 16 }}>
                Liikuta säätimiä ja näe heti, miten talouskasvu, korot, verot ja menot vaikuttavat alijäämään ja velkaan
                seuraavan kymmenen vuoden aikana.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {unitPicker}
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

        <section id="pelit">
          <p className="chapter">Luku 6</p>
          <h2 className="section-title">Pelaa lisää</h2>
          <p className="section-lead">
            Nyt tiedät mittasuhteet. Ratkaise päivän talouspulma tai jaa itse sata euroa ja vertaa Suomeen.
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
          {game === "daily" && <DailyChallenge data={data} />}
          {game === "hundred" && <HundredEuros data={data} />}
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
