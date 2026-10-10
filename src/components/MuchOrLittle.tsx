import { useEffect, useState } from "react";
import type { FinanceData } from "../types";
import { num, perCapita, perDay, pct } from "../format";

// "Onko se paljon vai vähän?" -vastaus otsikon alla. Kaikki luvut lasketaan datasta.

const SECONDS_PER_YEAR = 365 * 24 * 3600;

const euros = (v: number) => `${num(Math.round(v), 0)} €`;

// Vertailukohdat: suoratoistotilaukset kuukaudessa ja tölkin pantti päivässä (hinnat lokakuu 2026).
// Päivitä, kun hinnat muuttuvat.
interface Yardstick {
  id: string;
  name: string;
  price: number;
  period: "month" | "day";
  /** Ruudun leveys pikseleinä; tölkit ovat kapeita pystyruutuja. */
  boxW: number;
  heading: string;
  note: React.ReactNode;
  /** Monikko ja yksikkö lukujen perään, esim. "Netflix-tilausta". */
  many: string;
  /** Vertailtavat menoerät; oletuksena pienimmät erät. */
  rows?: string[];
}

export const CAN_DEPOSIT = 0.15;

const YARDSTICKS: Yardstick[] = [
  {
    id: "netflix",
    name: "Netflix",
    price: 15.99,
    period: "month",
    boxW: 22,
    heading: "Jos valtio laskuttaisi kuukausitilauksena",
    many: "Netflix-tilausta",
    note: (
      <>
        Yksi ruutu on yksi{" "}
        <a href="https://www.netflix.com/fi/" target="_blank" rel="noreferrer">
          Netflix Standard
        </a>{" "}
        -tilaus, 15,99 €/kk (hinta lokakuussa 2026).
      </>
    ),
  },
  {
    id: "spotify",
    name: "Spotify",
    price: 12.99,
    period: "month",
    boxW: 22,
    heading: "Jos valtio laskuttaisi kuukausitilauksena",
    many: "Spotify-tilausta",
    note: (
      <>
        Yksi ruutu on yksi{" "}
        <a href="https://www.spotify.com/fi/premium/" target="_blank" rel="noreferrer">
          Spotify Premium Yksilö
        </a>{" "}
        -tilaus, 12,99 €/kk (hinta lokakuussa 2026).
      </>
    ),
  },
  {
    id: "coffee",
    name: "Kahvi",
    price: 3,
    period: "day",
    boxW: 14,
    heading: "Jos valtio laskuttaisi kahvikupeissa",
    many: "kahvikuppia",
    rows: ["defence", "interest", "culture", "education", "health", "pensions"],
    note: <>Yksi ruutu on yksi kahvilakahvi, noin 3 € (havainnollistava hinta, kahvilasta riippuen noin 2–3 €).</>,
  },
  {
    id: "can",
    name: "Tölkki",
    price: CAN_DEPOSIT,
    period: "day",
    boxW: 7,
    heading: "Jos valtio laskuttaisi tölkkipanteissa",
    many: "tölkkiä",
    note: (
      <>
        Yksi ruutu on yksi palautettu tölkki, pantti 0,15 € (
        <a
          href="https://www.palpa.fi/kuluttajille/millaisia-pakkauksia-voi-palauttaa/"
          target="_blank"
          rel="noreferrer"
        >
          Palpa
        </a>
        ).
      </>
    ),
  },
];

// Pienimmät menoerät, joita on hauska verrata arkisiin hintoihin.
const SUB_ROWS = ["environment", "order", "defence", "interest", "unemployment", "culture"];

export function SubscriptionCompare({ data }: { data: FinanceData }) {
  const [ysId, setYsId] = useState(YARDSTICKS[0].id);
  const ys = YARDSTICKS.find((x) => x.id === ysId)!;
  const monthly = ys.period === "month";
  // Euroa per asukas kuukaudessa tai päivässä.
  const per = (millions: number) => (millions * 1e6) / data.population / (monthly ? 12 : 365);
  const deficit = per(data.expenditureTotal - data.revenueTotal);
  const total = per(data.expenditureTotal);
  const rows = (ys.rows ?? SUB_ROWS)
    .map((id) => data.expenditure.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ name: e.name, eur: per(e.value), bad: false }))
    .sort((a, b) => a.eur - b.eur);
  rows.push({ name: "Otettiin velaksi", eur: deficit, bad: true });
  const count = (v: number) => {
    const n = v / ys.price;
    return num(n, n < 10 ? 1 : 0);
  };
  const eur = (v: number) => (monthly ? `${num(v, 0)} €/kk` : `${num(v, v < 10 ? 2 : 1)} €/pv`);
  const periodText = monthly ? "kuukaudessa" : "päivässä";

  return (
    <div className="subs">
      <div className="subs-head">
        <h3>{ys.heading}</h3>
        <div className="toggle" role="group" aria-label="Vertailukohta">
          {YARDSTICKS.map((x) => (
            <button
              key={x.id}
              className={x.id === ysId ? "on" : ""}
              aria-pressed={x.id === ysId}
              onClick={() => setYsId(x.id)}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <p className="subs-lead">
        Kaikki julkiset palvelut maksavat{" "}
        <b>
          {monthly ? euros(total) : `${num(total, 1)} €`} {periodText}
        </b>{" "}
        jokaista suomalaista kohden.{" "}
        {ys.id === "can" ? (
          <>
            Se vastaa <b>{count(total)} tölkin panttia joka päivä</b>. Jotta velkaa ei tarvitsisi ottaa, jokaisen
            suomalaisen pitäisi palauttaa lisäksi <b>{num(Math.round(deficit / ys.price), 0)} tölkkiä joka päivä</b>.
          </>
        ) : ys.id === "coffee" ? (
          <>
            Se on <b>{count(total)} kahvikupillista joka päivä</b>, ja niistä {count(deficit)} juotiin velaksi.
          </>
        ) : (
          <>
            Se on{" "}
            <b>
              {count(total)} {ys.many}
            </b>
            . Velaksi siitä otettiin <b>{count(deficit)} tilausta</b> kuussa.
          </>
        )}
      </p>
      <ul className={`subs-rows ${ys.id === "can" ? "cans" : ""}`}>
        {rows.map((r) => {
          const n = r.eur / ys.price;
          return (
            <li key={r.name} className={r.bad ? "bad" : ""}>
              <span className="subs-name">{r.name}</span>
              <span className="subs-boxes" aria-hidden="true">
                {Array.from({ length: Math.ceil(n) }, (_, i) => (
                  <i key={i} style={{ width: `${Math.min(1, n - i) * ys.boxW}px` }} />
                ))}
              </span>
              <span className="subs-val">
                {eur(r.eur)} · <b>{count(r.eur)} ×</b>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="subs-note">{ys.note} Menot on jaettu tasan kaikkien asukkaiden kesken.</p>
    </div>
  );
}

export default function MuchOrLittle({ data }: { data: FinanceData }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  const deficit = data.expenditureTotal - data.revenueTotal;
  const perSecond = (data.expenditureTotal * 1e6) / SECONDS_PER_YEAR;
  const debtPerSecond = (deficit * 1e6) / SECONDS_PER_YEAR;
  const share = (data.expenditureTotal / data.gdp) * 100;
  const val = (id: string) => data.expenditure.find((e) => e.id === id)?.value ?? 0;
  const day = (v: number) => perDay(v, data.population).replace("/pv", "");

  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <div className="much">
      <div className="much-cols">
        <div className="much-col">
          <h2 className="much-head">Paljon</h2>
          <ul>
            <li>
              <b>{euros(perSecond)} sekunnissa,</b> joka ikinen sekunti, yöllä ja juhannuksena.
            </li>
            <li>
              <b>{pct(share, 0)} kaikesta,</b> mitä Suomessa tuotetaan vuodessa, kulkee julkisen kassan kautta.
            </li>
            <li>
              Tasan jaettuna jokainen suomalainen vauvasta vaariin saisi{" "}
              <b>{perCapita(data.expenditureTotal, data.population)}</b> vuodessa.
            </li>
          </ul>
        </div>

        <div className="much-col">
          <h2 className="much-head">Vähän</h2>
          <ul>
            <li>
              <b>{day(data.expenditureTotal)} päivässä</b> per suomalainen. Sillä saat koulut, sairaalat, poliisin, tiet
              ja eläkkeet.
            </li>
            <li>
              Koko puolustus maksaa <b>{day(val("defence"))} päivässä</b> per suomalainen.
            </li>
            <li>
              Kirjastot, museot, liikuntapaikat ja Yle yhteensä <b>{day(val("culture"))} päivässä</b>.
            </li>
          </ul>
        </div>
      </div>

      <p className="much-ticker" aria-live="off">
        Sivulla {mins}:{String(secs).padStart(2, "0")} · julkinen sektori on sillä aikaa käyttänyt{" "}
        <b>{euros(perSecond * elapsed)}</b> ja ottanut velkaa <b className="neg">{euros(debtPerSecond * elapsed)}</b>.
      </p>
    </div>
  );
}
