import type { CountryCode, NeighborData } from "../types";
import { num } from "../format";
import CompareTool from "./CompareTool";
import Cite from "./Cite";

// Naapurit-luku: Suomi verrattuna Ruotsiin ja Viroon Eurostatin datalla.
// Kaikki luvut ovat prosentteja BKT:stä, jotta eri kokoiset taloudet ovat vertailukelpoisia.

const COLORS: Record<CountryCode, string> = {
  FI: "var(--text)",
  SE: "#1d4f8a",
  EE: "#a35f00",
};

const p1 = (v: number) => `${num(v, 1)} %`;

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

  return (
    <>
      <ul className="insights">
        <li>
          <b>Sama veroaste, eri menot.</b> Suomessa ja Ruotsissa verojen ja maksujen osuus on lähes sama ({p1(m.tax.FI)}{" "}
          ja {p1(m.tax.SE)} BKT:stä vuonna {n.taxYear}), mutta Suomen julkiset menot ovat {num(spendGap, 1)} %-yksikköä
          suuremmat.
          <Cite ids={["gov_10a_taxag", "gov_10a_main"]} />
        </li>
        <li>
          <b>Ero on sosiaaliturvassa.</b> Suomi käyttää sosiaaliturvaan {num(socialGap, 1)} %-yksikköä BKT:stä enemmän
          kuin Ruotsi. Siitä {num(oldAgeGap, 1)} %-yksikköä on vanhuuden menoja eli eläkkeitä ja vanhuspalveluja.
          <Cite ids={["gov_10a_exp"]} />
        </li>
        <li>
          <b>Velka kääntyi eri suuntiin.</b> Vuonna {firstDebt.year} Suomen velka oli {p1(firstDebt.FI)} ja Ruotsin{" "}
          {p1(firstDebt.SE)} BKT:stä. Vuonna {lastDebt.year} Suomen velka on {num(debtTimes, 1)}-kertainen Ruotsiin
          verrattuna.
          <Cite ids={["gov_10dd_edpt1"]} />
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

      <CompareTool data={n.compare} codes={codes} names={names} colors={COLORS} />

      <details className="more-info">
        <summary>Näin luvut kannattaa lukea</summary>
        <div className="neighbor-notes">
          <p>
            <b>Vertailukelpoisuus.</b> Kaikki luvut ovat Eurostatin, jotta maat ovat vertailukelpoisia, ja ne on
            suhteutettu bruttokansantuotteeseen. Siksi Suomen luvut poikkeavat hieman sivun muista luvuista, jotka ovat
            Tilastokeskuksen tuoreimpia tietoja.
          </p>
          <p>
            <b>Puolustus.</b> Kansantalouden tilinpito kirjaa asehankinnat menoiksi vasta, kun kalusto toimitetaan
            (esimerkiksi F-35-hävittäjät), ja rajaa puolustuksen kapeammin kuin Nato. Naton määritelmällä Suomen
            puolustusmenot ovat yli 2 % BKT:stä.
          </p>
          <p>
            <b>Eläkkeet.</b> Maiden eläkejärjestelmät on rakennettu eri tavoin, ja osa eläkesäästöistä on julkisen
            sektorin ulkopuolella. Ero kertoo myös siitä, mitä luetaan julkiseksi taloudeksi, sekä väestön ikärakenteesta.
          </p>
          <p>
            <b>Alaerät.</b> Maat kirjaavat osan menoista ja tuloista eri luokkiin. Esimerkiksi Ruotsi kirjaa koko
            peruskoulun alakouluksi, ja Ruotsin työnantajamaksuista suuri osa on tilastoissa palkkasummaveroa.
            Pääluokkien ero on luotettavampi kuin yksittäisen alaerän.
          </p>
        </div>
      </details>
    </>
  );
}
