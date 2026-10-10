import { useEffect, useState } from "react";
import type { FinanceData } from "./types";
import { COEFFICIENTS, DEFAULT_SCENARIO, ROLLOVER, BEHAVIOR, type Scenario } from "./model";
import { money, perCapita, perDay, pct, type Unit } from "./format";
import BudgetColumns from "./components/BudgetColumns";
import Simulator from "./components/Simulator";
import BiggerGame from "./components/BiggerGame";

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

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("total");
  const [scenario, setScenarioState] = useState<Scenario>(readScenario);
  const [copied, setCopied] = useState(false);

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
    const id = location.hash.slice(1);
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
  const fmt = (v: number) => money(v, data.population, unit);
  const defence = data.expenditure.find((e) => e.id === "defence")?.value ?? 0;
  const interestVsDefence =
    data.interest > defence ? "enemmän kuin puolustukseen" : `${pct((data.interest / defence) * 100, 0)} puolustusmenoista`;

  return (
    <div className="has-mobile-bar">
      <header className="topbar">
        <div className="wrap">
          <div className="brand">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
              <rect x="4" y="14" width="6" height="14" rx="1" fill="#2a7d6b" />
              <rect x="13" y="8" width="6" height="20" rx="1" fill="#315fa8" />
              <rect x="22" y="4" width="6" height="24" rx="1" fill="#c4473a" />
            </svg>
            Taskuministeri
          </div>
          <nav className="nav">
            <a href="#peli">Peli</a>
            <a href="#rahat">Tulot ja menot</a>
            <a href="#velka">Velka</a>
            <a href="#kokeile">Kokeile itse</a>
          </nav>
          <div className="toggle" role="group" aria-label="Yksikkö">
            {UNITS.map((u) => (
              <button key={u.id} className={unit === u.id ? "on" : ""} onClick={() => setUnit(u.id)} title={u.title}>
                <span className="long">{u.long}</span>
                <span className="short">{u.short}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="hero">
          <div className="eyebrow">♠ Taskuministeri. Ässät on nyt sun hihassa.</div>
          <h1>
            Julkinen talous on yhteinen taloutemme. <span className="grad">Nyt voit nähdä sen ja kokeilla itse.</span>
          </h1>
          <p className="lead">
            Julkisesta taloudesta väitellään miljardeilla, prosenteilla ja leikkauslistoilla. Kokonaiskuvaa on silti
            vaikea hahmottaa, ja vielä harvemmin vaihtoehtoja pääsee kokeilemaan itse. Tämä sivu on tehty, jotta
            jokainen voi muodostaa oman käsityksensä avoimen datan pohjalta, ilman puoluekantaa.
          </p>

          <div className="fact">
            <div>
              <b>{perCapita(data.expenditureTotal, data.population)}</b>
              <span>
                julkisia menoja jokaista suomalaista kohden vuodessa, eli{" "}
                <b className="inline">{perDay(data.expenditureTotal, data.population).replace("/pv", "")}</b> päivässä
              </span>
            </div>
            <div>
              <b>{perCapita(data.revenueTotal, data.population)}</b>
              <span>
                veroja ja muita tuloja, eli{" "}
                <b className="inline">{perDay(data.revenueTotal, data.population).replace("/pv", "")}</b> päivässä
              </span>
            </div>
            <div>
              <b className="neg">{perCapita(deficit, data.population)}</b>
              <span>
                uutta velkaa per suomalainen vuonna {data.baseYear}, eli{" "}
                <b className="inline">{perDay(deficit, data.population).replace("/pv", "")}</b> päivässä
              </span>
            </div>
          </div>

          <div className="intro-cards">
            <a className="card intro-card" href="#peli">
              <span className="ic">🃏</span>
              <h3>Testaa vaistosi</h3>
              <p>
                Kumpi maksaa enemmän: puolustus vai velan korot? Kymmenen kysymyksen peli, joka opettaa miljardien
                mittasuhteet minuutissa.
              </p>
              <span className="go">Pelaa →</span>
            </a>
            <a className="card intro-card" href="#rahat">
              <span className="ic">🔍</span>
              <h3>Katso, mihin rahat menevät</h3>
              <p>
                Näe yhdellä silmäyksellä, paljonko verot tuovat ja mihin jokainen euro käytetään: eläkkeisiin,
                terveyteen, kouluihin vai velan korkoihin.
              </p>
              <span className="go">Tulot ja menot →</span>
            </a>
            <a className="card intro-card" href="#kokeile">
              <span className="ic">🎛️</span>
              <h3>Kokeile itse päättäjänä</h3>
              <p>
                Nosta tai laske veroja, leikkaa tai lisää menoja ja muuta korkoja. Näet heti, mitä velalle tapahtuu
                seuraavan kymmenen vuoden aikana.
              </p>
              <span className="go">Avaa simulaattori →</span>
            </a>
          </div>

          <p className="trust">
            Luvut ovat Tilastokeskukselta, ja veromuutosten vaikutukset perustuvat valtiovarainministeriön arvioihin.
            Laskentatapa ja kaikki oletukset ovat <a href="#lahteet">avoimesti nähtävillä</a>.
          </p>
        </div>

        <section id="peli">
          <h2 className="section-title">Lämmittely: kumpi on isompi?</h2>
          <p className="section-lead">
            Arvaa ennen kuin katsot. Kumpi kahdesta vie enemmän rahaa tai tuo enemmän tuloja? Vastauksen jälkeen näet
            luvut euroina päivässä jokaista suomalaista kohden.
          </p>
          <BiggerGame data={data} />
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
                <span className="dot" style={{ background: "#2f8a6f" }} />
                Tulot {data.baseYear}
              </div>
              <div className="value">{fmt(data.revenueTotal)}</div>
              <div className="sub">{pct((data.revenueTotal / data.gdp) * 100)} BKT:stä</div>
            </div>
            <div className="card kpi">
              <div className="label">
                <span className="dot" style={{ background: "#3866b0" }} />
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
              <div className="sub">
                {pct((deficit / data.expenditureTotal) * 100, 0)} menoista rahoitettiin velalla
              </div>
            </div>
          </div>
          <BudgetColumns data={data} unit={unit} />
        </section>

        <section id="velka">
          <h2 className="section-title">Velka kasvaa</h2>
          <p className="section-lead">
            Kun menot ovat tuloja suuremmat, erotus otetaan velaksi. Velasta maksetaan korkoa, joka on pois
            muista menoista.
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
              <div className="sub">
                vuodessa, {interestVsDefence}
              </div>
            </div>
          </div>
        </section>

        <section id="kokeile">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 className="section-title">Kokeile itse: miten velka kehittyy?</h2>
              <p className="section-lead" style={{ marginBottom: 16 }}>
                Liikuta säätimiä ja näe heti, miten talouskasvu, korot, verot ja menot vaikuttavat
                alijäämään ja velkaan seuraavan kymmenen vuoden aikana.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="chip" onClick={share}>
                {copied ? "✓ Linkki kopioitu" : "🔗 Jaa skenaario"}
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
                mm. ikääntyminen). Ne eivät automaattisesti seuraa talouskasvua.
              </li>
              <li>
                Velasta uusitaan noin {pct(ROLLOVER * 100, 0)} vuodessa, joten korkojen nousu näkyy korkomenoissa
                vähitellen.
              </li>
              <li>
                Veromuutosten tuotot perustuvat valtiovarainministeriön vaikutusarvioihin. Osa tuotosta menetetään
                käyttäytymisvaikutusten takia (tulovero{" "}
                {pct(BEHAVIOR.incomeTax * 100, 0)}, ALV {pct(BEHAVIOR.vat * 100, 0)}, yhteisövero{" "}
                {pct(BEHAVIOR.corporateTax * 100, 0)}, valmisteverot {pct(BEHAVIOR.excise * 100, 0)}).
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
