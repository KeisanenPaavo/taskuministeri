import { useEffect, useState } from "react";
import type { FinanceData } from "./types";
import { DEFAULT_SCENARIO, ROLLOVER, BEHAVIOR, type Scenario } from "./model";
import { money, perCapita, pct } from "./format";
import BudgetColumns from "./components/BudgetColumns";
import Simulator from "./components/Simulator";

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

export default function App() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perPerson, setPerPerson] = useState(false);
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
  const fmt = (v: number) => money(v, data.population, perPerson);
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
            Suomen talous
          </div>
          <nav className="nav">
            <a href="#rahat">Tulot ja menot</a>
            <a href="#velka">Velka</a>
            <a href="#kokeile">Kokeile itse</a>
          </nav>
          <div className="toggle" role="group" aria-label="Yksikkö">
            <button className={!perPerson ? "on" : ""} onClick={() => setPerPerson(false)}>
              Koko Suomi
            </button>
            <button className={perPerson ? "on" : ""} onClick={() => setPerPerson(true)}>
              Per asukas
            </button>
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="hero">
          <h1>Mistä Suomen julkinen talous saa rahansa ja mihin se ne käyttää?</h1>
          <p>
            Valtio, kunnat, hyvinvointialueet ja eläkelaitokset käyttivät vuonna {data.baseYear} yhteensä{" "}
            {money(data.expenditureTotal, data.population, false)}, eli noin{" "}
            {perCapita(data.expenditureTotal, data.population)} jokaista suomalaista kohden. Tuloja kertyi{" "}
            {money(deficit, data.population, false)} vähemmän.
          </p>
        </div>

        <section id="rahat">
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
          <BudgetColumns data={data} perPerson={perPerson} />
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
          <Simulator data={data} perPerson={perPerson} scenario={scenario} setScenario={setScenario} />
        </section>
      </main>

      <footer className="footer">
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
                Veromuutoksissa osa tuotosta menetetään käyttäytymisvaikutusten takia (ansiotulovero{" "}
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
      </footer>
    </div>
  );
}
