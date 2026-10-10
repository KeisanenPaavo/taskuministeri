import type { ByCountry, CountryCode, NeighborData } from "../types";
import { num } from "../format";
import { LineChart } from "./charts";
import CompareTool from "./CompareTool";

// Naapurit-luku: Suomi verrattuna Ruotsiin ja Viroon Eurostatin datalla.
// Kaikki luvut ovat prosentteja BKT:stä, jotta eri kokoiset taloudet ovat vertailukelpoisia.

const COLORS: Record<CountryCode, string> = {
  FI: "var(--text)",
  SE: "#1d4f8a",
  EE: "#a35f00",
};

const p1 = (v: number) => `${num(v, 1)} %`;

interface Row {
  name: string;
  values: ByCountry;
  sub?: boolean;
}

/** Yksi rivi: nimi, pisteet yhteisellä akselilla ja luvut sarakkeina. */
function DotRow({ row, max, codes }: { row: Row; max: number; codes: CountryCode[] }) {
  return (
    <div className={`dot-row ${row.sub ? "sub" : ""}`}>
      <span className="dot-name">{row.name}</span>
      <span className="dot-track" aria-hidden="true">
        {codes.map((c) => (
          <span
            key={c}
            className={`dot-mark ${c === "FI" ? "fi" : ""}`}
            style={{ left: `${(row.values[c] / max) * 100}%`, background: COLORS[c] }}
          />
        ))}
      </span>
      {codes.map((c) => (
        <span key={c} className={`dot-val ${c === "FI" ? "fi" : ""}`}>
          {num(row.values[c], 1)}
        </span>
      ))}
    </div>
  );
}

function DotTable({
  title,
  rows,
  codes,
  names,
}: {
  title: string;
  rows: Row[];
  codes: CountryCode[];
  names: Record<CountryCode, string>;
}) {
  const max = Math.max(...rows.flatMap((r) => codes.map((c) => r.values[c]))) * 1.08;
  return (
    <div className="dot-table" role="table" aria-label={title}>
      <div className="dot-row head" role="row">
        <span className="dot-name">{title}</span>
        <span className="dot-track-head">% BKT:stä</span>
        {codes.map((c) => (
          <span key={c} className="dot-val head" style={{ color: COLORS[c] }}>
            {names[c]}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <DotRow key={r.name} row={r} max={max} codes={codes} />
      ))}
    </div>
  );
}

export default function Neighbors({ n }: { n: NeighborData }) {
  const codes = n.countries.map((c) => c.code);
  const names = Object.fromEntries(n.countries.map((c) => [c.code, c.name])) as Record<CountryCode, string>;
  const m = n.main;
  const lastDebt = n.debt[n.debt.length - 1];
  const firstDebt = n.debt[0];

  // Huomiot lasketaan datasta.
  const social = n.cofog.find((c) => c.id === "social")!;
  const oldAge = n.social.find((c) => c.id === "oldAge")!;
  const socialGap = social.values.FI - social.values.SE;
  const oldAgeGap = oldAge.values.FI - oldAge.values.SE;
  const spendGap = m.expenditure.FI - m.expenditure.SE;
  const debtTimes = lastDebt.FI / lastDebt.SE;

  const keyRows: Row[] = [
    { name: `Julkiset menot ${n.mainYear}`, values: m.expenditure },
    { name: `Julkiset tulot ${n.mainYear}`, values: m.revenue },
    { name: `Verot ja maksut ${n.taxYear}`, values: m.tax },
    { name: `Velan korot ${n.mainYear}`, values: m.interest },
    {
      name: `Alijäämä ${n.mainYear}`,
      values: { FI: -m.balance.FI, SE: -m.balance.SE, EE: -m.balance.EE },
    },
  ];

  return (
    <>
      <ul className="insights">
        <li>
          <b>Sama veroaste, eri menot.</b> Suomessa ja Ruotsissa verojen ja maksujen osuus on lähes sama ({p1(m.tax.FI)}{" "}
          ja {p1(m.tax.SE)} BKT:stä vuonna {n.taxYear}), mutta Suomen julkiset menot ovat {num(spendGap, 1)} %-yksikköä
          suuremmat.
        </li>
        <li>
          <b>Ero on sosiaaliturvassa.</b> Suomi käyttää sosiaaliturvaan {num(socialGap, 1)} %-yksikköä BKT:stä enemmän
          kuin Ruotsi. Siitä {num(oldAgeGap, 1)} %-yksikköä on vanhuuden menoja eli eläkkeitä ja vanhuspalveluja.
        </li>
        <li>
          <b>Velka kääntyi eri suuntiin.</b> Vuonna {firstDebt.year} Suomen velka oli {p1(firstDebt.FI)} ja Ruotsin{" "}
          {p1(firstDebt.SE)} BKT:stä. Vuonna {lastDebt.year} Suomen velka on {num(debtTimes, 1)}-kertainen Ruotsiin
          verrattuna.
        </li>
      </ul>

      <div className="legend country-legend">
        {codes.map((c) => (
          <span key={c}>
            <i className={`legend-dot ${c === "FI" ? "fi" : ""}`} style={{ background: COLORS[c] }} />
            {names[c]}
          </span>
        ))}
      </div>

      <DotTable title="Avainluvut" rows={keyRows} codes={codes} names={names} />

      <CompareTool data={n.compare} codes={codes} names={names} colors={COLORS} />

      <div className="card chart-card neighbor-chart">
        <h4>Julkinen velka suhteessa BKT:hen</h4>
        <div className="legend">
          {codes.map((c) => (
            <span key={c}>
              <i style={{ borderColor: COLORS[c] }} />
              {names[c]}
            </span>
          ))}
        </div>
        <LineChart
          height={260}
          minY={0}
          refLine={{ value: 60, label: "EU:n viitearvo 60 %" }}
          series={codes.map((c) => ({
            label: names[c],
            color: COLORS[c],
            width: c === "FI" ? 3.5 : 2.5,
            points: n.debt.map((d) => ({ year: d.year, value: d[c] })),
          }))}
        />
      </div>

      <div className="neighbor-notes">
        <p>
          <b>Näin luvut kannattaa lukea.</b> Kaikki luvut ovat Eurostatin, jotta maat ovat vertailukelpoisia, ja ne on
          suhteutettu bruttokansantuotteeseen. Siksi Suomen luvut poikkeavat hieman sivun muista luvuista, jotka ovat
          Tilastokeskuksen tuoreimpia tietoja.
        </p>
        <p>
          <b>Puolustus:</b> kansantalouden tilinpito kirjaa asehankinnat menoiksi vasta, kun kalusto toimitetaan
          (esimerkiksi F-35-hävittäjät), ja rajaa puolustuksen kapeammin kuin Nato. Naton määritelmällä Suomen
          puolustusmenot ovat yli 2 % BKT:stä.
        </p>
        <p>
          <b>Eläkkeet:</b> maiden eläkejärjestelmät on rakennettu eri tavoin, ja osa eläkesäästöistä on julkisen
          sektorin ulkopuolella. Ero kertoo myös siitä, mitä luetaan julkiseksi taloudeksi, sekä väestön ikärakenteesta.
        </p>
        <p>
          <b>Alaerät:</b> maat kirjaavat osan menoista ja tuloista eri luokkiin. Esimerkiksi Ruotsi kirjaa koko
          peruskoulun alakouluksi, ja Ruotsin työnantajamaksuista suuri osa on tilastoissa palkkasummaveroa. Pääluokkien
          ero on luotettavampi kuin yksittäisen alaerän.
        </p>
      </div>
    </>
  );
}
