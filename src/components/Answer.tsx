import type { FinanceData } from "../types";
import { num } from "../format";
import { COFFEE_PRICE, NETFLIX_PRICE } from "./MuchOrLittle";

// Jutun loppu: vastaus otsikon kysymykseen "Onko miljardi paljon vai vähän?".
// Miljardi jaetaan jokaiselle suomalaiselle päivässä (kahvikupit) ja kuukaudessa (Netflix-tilaukset).

const FRACTIONS = ["", "", "puolikas", "kolmasosa", "neljäsosa", "viidesosa", "kuudesosa", "seitsemäsosa"];

/** Kuinka monta kappaletta, luettavassa muodossa: "kuudesosa kahvikupista", "melkein yksi", "26". */
function count(n: number, one: string, partitive: string, elative: string) {
  if (n < 0.85) {
    const k = Math.round(1 / n);
    return k < FRACTIONS.length ? `${FRACTIONS[k]} ${elative}` : `alle ${FRACTIONS[FRACTIONS.length - 1]} ${elative}`;
  }
  if (n < 1) return `melkein yksi ${one}`;
  if (n < 1.15) return `yksi ${one}`;
  return `${num(n, n < 10 ? 1 : 0)} ${partitive}`;
}

const euros = (v: number) => (v < 1 ? `${num(v * 100, 0)} senttiä` : `${num(v, v < 10 ? 2 : 0)} €`);
/** Taulukossa lyhyempi muoto: 0,49 €. */
const short = (v: number) => `${num(v, v < 10 ? 2 : 0)} €`;

export default function Answer({ data }: { data: FinanceData }) {
  const per = (millions: number) => {
    const total = millions * 1e6;
    const day = total / data.population / 365;
    const month = total / data.population / 12;
    return {
      day,
      month,
      cups: count(day / COFFEE_PRICE, "kahvikuppi", "kahvikuppia", "kahvikupista"),
      netflix: count(month / NETFLIX_PRICE, "Netflix-tilaus", "Netflix-tilausta", "Netflix-tilauksesta"),
    };
  };
  const one = per(1000);
  const all = per(data.expenditureTotal);
  const deficit = data.expenditureTotal - data.revenueTotal;
  const debt = per(deficit);
  const bn = Math.round(data.expenditureTotal / 1000);

  const cols = [
    { title: "Yksi miljardi", v: one },
    { title: "10 miljardia", v: per(10_000) },
    { title: `Kaikki ${bn} miljardia`, v: all },
  ];

  return (
    <>
      <p className="section-lead">
        Miljardi euroa on jokaista suomalaista kohden {euros(one.day)} päivässä eli {one.cups}. Kuukaudessa se on{" "}
        {euros(one.month)} eli {one.netflix}.
      </p>
      <table className="answer" aria-label="Summat jokaista suomalaista kohden">
        <thead>
          <tr>
            <td />
            {cols.map((c) => (
              <th key={c.title} scope="col">
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Päivässä</th>
            {cols.map((c) => (
              <td key={c.title}>
                <span className="answer-big">{short(c.v.day)}</span>
                <span className="answer-like">{c.v.cups}</span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Kuussa</th>
            {cols.map((c) => (
              <td key={c.title}>
                <span className="answer-big">{short(c.v.month)}</span>
                <span className="answer-like">{c.v.netflix}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="story-text">
        Velaksi otettiin {num(deficit / 1000, 1)} miljardia euroa, {euros(debt.month)} kuussa eli {debt.netflix}{" "}
        jokaista suomalaista kohden.
      </p>
      <p className="answer-close">
        <b>No, onko se miljardi paljon vai vähän?</b> Miljardi vuodessa on noin Netflix-tilauksen verran kuukaudessa
        jokaista suomalaista kohden, kulki hän sitten rattaissa, Skodalla tai rollaattorilla.
      </p>
      <p className="answer-note">
        Asukasluku {num(data.population / 1e6, 2)} miljoonaa. Kahvikuppi {num(COFFEE_PRICE, 0)} €, Netflix Standard{" "}
        {num(NETFLIX_PRICE, 2)} €/kk.
      </p>
    </>
  );
}
