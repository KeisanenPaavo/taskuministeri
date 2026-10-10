import { useEffect, useState } from "react";
import type { FinanceData } from "../types";
import { num, perCapita, perDay, pct } from "../format";

// "Onko se paljon vai vähän?" -vastaus otsikon alla. Kaikki luvut lasketaan datasta.

const SECONDS_PER_YEAR = 365 * 24 * 3600;

const euros = (v: number) => `${num(Math.round(v), 0)} €`;

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
