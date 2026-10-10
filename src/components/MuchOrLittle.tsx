import { useEffect, useState } from "react";
import type { FinanceData } from "../types";
import { num, perCapita, perDay, pct } from "../format";

// "Onko se paljon vai vähän?" -vastaus otsikon alla. Kaikki luvut lasketaan datasta.

const SECONDS_PER_YEAR = 365 * 24 * 3600;

const euros = (v: number) => `${num(Math.round(v), 0)} €`;

// Suoratoistotilausten hinnat Suomessa (lokakuu 2026). Päivitä, kun hinnat muuttuvat.
const SUBSCRIPTIONS = [
  { id: "netflix", name: "Netflix", plan: "Standard", price: 15.99, url: "https://www.netflix.com/fi/" },
  { id: "spotify", name: "Spotify", plan: "Premium Yksilö", price: 12.99, url: "https://www.spotify.com/fi/premium/" },
];

// Pienimmät menoerät, joita on hauska verrata tilaushintaan.
const SUB_ROWS = ["environment", "order", "defence", "interest", "unemployment", "culture"];

function SubscriptionCompare({ data }: { data: FinanceData }) {
  const [subId, setSubId] = useState(SUBSCRIPTIONS[0].id);
  const sub = SUBSCRIPTIONS.find((x) => x.id === subId)!;
  const month = (millions: number) => (millions * 1e6) / data.population / 12;
  const total = month(data.expenditureTotal);
  const rows = SUB_ROWS.map((id) => data.expenditure.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ name: e.name, eur: month(e.value) }))
    .sort((a, b) => a.eur - b.eur);
  const count = (v: number) => num(v / sub.price, v / sub.price < 10 ? 1 : 0);

  return (
    <div className="subs">
      <div className="subs-head">
        <h3>Jos valtio laskuttaisi kuukausitilauksena</h3>
        <div className="toggle" role="group" aria-label="Vertailtava tilaus">
          {SUBSCRIPTIONS.map((x) => (
            <button
              key={x.id}
              className={x.id === subId ? "on" : ""}
              aria-pressed={x.id === subId}
              onClick={() => setSubId(x.id)}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <p className="subs-lead">
        Kaikki julkiset palvelut maksavat <b>{euros(total)} kuukaudessa</b> jokaista suomalaista kohden. Se on{" "}
        <b>
          {count(total)} {sub.name}-tilausta
        </b>
        . Pienemmät erät mahtuvat muutamaan tilaukseen:
      </p>
      <ul className="subs-rows">
        {rows.map((r) => {
          const n = r.eur / sub.price;
          return (
            <li key={r.name}>
              <span className="subs-name">{r.name}</span>
              <span className="subs-boxes" aria-hidden="true">
                {Array.from({ length: Math.ceil(n) }, (_, i) => (
                  <i key={i} style={{ width: `${Math.min(1, n - i) * 22}px` }} />
                ))}
              </span>
              <span className="subs-val">
                {num(r.eur, 0)} €/kk · <b>{count(r.eur)} ×</b>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="subs-note">
        Yksi ruutu on yksi{" "}
        <a href={sub.url} target="_blank" rel="noreferrer">
          {sub.name} {sub.plan}
        </a>{" "}
        -tilaus, {num(sub.price, 2)} €/kk (hinta lokakuussa 2026). Menot on jaettu tasan kaikkien asukkaiden kesken.
      </p>
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

      <SubscriptionCompare data={data} />

      <p className="much-ticker" aria-live="off">
        Sivulla {mins}:{String(secs).padStart(2, "0")} · julkinen sektori on sillä aikaa käyttänyt{" "}
        <b>{euros(perSecond * elapsed)}</b> ja ottanut velkaa <b className="neg">{euros(debtPerSecond * elapsed)}</b>.
      </p>
    </div>
  );
}
