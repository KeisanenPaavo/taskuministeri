import type { FinanceData } from "../types";
import { EXPENDITURE_COLORS, textOn } from "../colors";
import { num } from "../format";

// Työviikko julkisen talouden kautta: 40 tunnin viikko vastaa koko kansantaloutta (BKT).
// Julkiset menot jaetaan viikolle suurimmasta pienimpään, ja viikolle merkitään kohdat,
// joissa verot ja kaikki tulot on maksettu.

const DAYS = ["Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai"];
const SHORT = ["ma", "ti", "ke", "to", "pe"];
const HOURS_PER_DAY = 8;
const START_HOUR = 8;
const WEEK = DAYS.length * HOURS_PER_DAY;

/** Viikon tunti (0–40) → "ke klo 12.55". */
function clock(h: number) {
  const day = Math.min(DAYS.length - 1, Math.floor(h / HOURS_PER_DAY));
  const inDay = h - day * HOURS_PER_DAY;
  const total = Math.round((START_HOUR + inDay) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return { day: SHORT[day], time: `${hh}.${String(mm).padStart(2, "0")}` };
}
const when = (h: number) => {
  const c = clock(h);
  return `${c.day} klo ${c.time}`;
};

export default function WorkWeek({ data }: { data: FinanceData }) {
  const taxes = data.revenue.filter((r) => r.id !== "otherRevenue").reduce((s, r) => s + r.value, 0);
  const taxEnd = (taxes / data.gdp) * WEEK;
  const revenueEnd = (data.revenueTotal / data.gdp) * WEEK;
  const spendEnd = (data.expenditureTotal / data.gdp) * WEEK;

  let at = 0;
  const segments = [...data.expenditure]
    .sort((a, b) => b.value - a.value)
    .map((e) => {
      const hours = (e.value / data.gdp) * WEEK;
      const seg = { id: e.id, name: e.name, from: at, to: at + hours, color: EXPENDITURE_COLORS[e.id] ?? "#555" };
      at += hours;
      return seg;
    });

  // Veronmaksun vapaapäivä: sama osuus vuodesta.
  const year = new Date().getFullYear();
  const freeDay = new Date(year, 0, 1 + Math.floor((taxes / data.gdp) * 365));
  const freeDayText = freeDay.toLocaleDateString("fi-FI", { day: "numeric", month: "long" });

  // Päivän palkin osat: leikataan segmentit päivän rajoihin.
  const dayParts = (d: number) => {
    const s = d * HOURS_PER_DAY;
    const e = s + HOURS_PER_DAY;
    return segments
      .filter((g) => g.to > s && g.from < e)
      .map((g) => ({ ...g, a: Math.max(g.from, s) - s, b: Math.min(g.to, e) - s }));
  };
  const pctOf = (h: number) => `${(h / HOURS_PER_DAY) * 100}%`;

  const markers = [
    { h: taxEnd, label: `Verot maksettu ${when(taxEnd)}`, cls: "tax" },
    { h: revenueEnd, label: `Kaikki tulot käytetty ${when(revenueEnd)}`, cls: "rev" },
  ];

  return (
    <div className="week">
      <h3>Sinun työviikkosi</h3>
      <p className="week-lead">
        Ajatellaan, että koko Suomen talous on yksi 40 tunnin työviikko. Verot ja maksut ovat{" "}
        {num((taxes / data.gdp) * 100, 0)} % siitä, joten keskivertosuomalainen tekee töitä yhteiseen kassaan{" "}
        <b>{when(taxEnd)}</b> asti. Vuositasolla veronmaksun vapaapäivä olisi <b>{freeDayText}</b>.
      </p>

      <details className="week-why">
        <summary>Mistä {num((taxes / data.gdp) * 100, 0)} % tulee?</summary>
        <p>
          Luku on verojen ja sosiaaliturvamaksujen yhteissumma suhteessa bruttokansantuotteeseen eli kaikkeen, mitä
          Suomessa vuodessa tuotetaan. Vuonna {data.baseYear} veroja ja maksuja kertyi {num(taxes / 1000, 1)} mrd € ja
          BKT oli {num(data.gdp / 1000, 1)} mrd €. Tätä kutsutaan veroasteeksi. Se on keskiarvo koko taloudesta, ei
          kenenkään yksittäisen ihmisen veroprosentti: mukana ovat myös yritysten maksamat verot ja työnantajien maksut,
          ja jokaisen oma osuus riippuu tuloista ja kulutuksesta.
        </p>
        <table className="week-why-table">
          <thead>
            <tr>
              <th>Vero tai maksu</th>
              <th>mrd €</th>
              <th>% BKT:stä</th>
              <th>Työaikaa viikossa</th>
            </tr>
          </thead>
          <tbody>
            {data.revenue
              .filter((r) => r.id !== "otherRevenue")
              .map((r) => {
                const share = r.value / data.gdp;
                const min = Math.round(share * WEEK * 60);
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{num(r.value / 1000, 1)}</td>
                    <td>{num(share * 100, 1)} %</td>
                    <td>
                      {Math.floor(min / 60)} h {String(min % 60).padStart(2, "0")} min
                    </td>
                  </tr>
                );
              })}
            <tr className="total">
              <td>Yhteensä</td>
              <td>{num(taxes / 1000, 1)}</td>
              <td>{num((taxes / data.gdp) * 100, 1)} %</td>
              <td>
                {Math.floor((taxes / data.gdp) * WEEK)} h{" "}
                {String(Math.round((((taxes / data.gdp) * WEEK) % 1) * 60)).padStart(2, "0")} min
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Muut julkiset tulot, kuten myyntitulot, asiakasmaksut sekä eläkerahastojen korko- ja osinkotulot (
          {num((data.revenue.find((r) => r.id === "otherRevenue")?.value ?? 0) / 1000, 1)} mrd €), eivät ole veroja.
          Siksi ne näkyvät viikolla erikseen pisteviivaan asti. Eurostat saa Suomen veroasteeksi saman 42 %, ja se on
          Ruotsin tasolla (luku 4).
        </p>
      </details>

      <div className="week-grid" role="img" aria-label="Työviikko jaettuna julkisiin menoihin">
        <div className="week-axis" aria-hidden="true">
          <span />
          <div className="week-ticks">
            {[8, 10, 12, 14, 16].map((h) => (
              <span key={h} style={{ left: pctOf(h - START_HOUR) }}>
                {h}
              </span>
            ))}
          </div>
        </div>
        {DAYS.map((name, d) => {
          const s = d * HOURS_PER_DAY;
          return (
            <div className="week-day" key={name}>
              <span className="week-name">{SHORT[d]}</span>
              <div className="week-bar">
                {dayParts(d).map((p) => (
                  <i
                    key={p.id}
                    title={`${p.name}: ${when(p.from)} – ${when(p.to)}`}
                    style={{ left: pctOf(p.a), width: pctOf(p.b - p.a), background: p.color, color: textOn(p.color) }}
                  >
                    {p.b - p.a > 1.4 && p.a === Math.max(p.from, s) - s ? <span>{p.name}</span> : null}
                  </i>
                ))}
                {revenueEnd < s + HOURS_PER_DAY && spendEnd > s && (
                  <b
                    className="week-debt"
                    style={{
                      left: pctOf(Math.max(revenueEnd, s) - s),
                      width: pctOf(Math.min(spendEnd, s + HOURS_PER_DAY) - Math.max(revenueEnd, s)),
                    }}
                  />
                )}
                {markers
                  .filter((m) => m.h >= s && m.h < s + HOURS_PER_DAY)
                  .map((m) => (
                    <em key={m.cls} className={`week-mark ${m.cls}`} style={{ left: pctOf(m.h - s) }} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="week-legend">
        <li>
          <em className="week-mark tax" /> Verot ja maksut maksettu {when(taxEnd)}
        </li>
        <li>
          <em className="week-mark rev" /> Myös muut tulot (esim. maksut ja korot) käytetty {when(revenueEnd)}
        </li>
        <li>
          <b className="week-debt" /> Velaksi katettu osuus ({when(revenueEnd)} – {when(spendEnd)}). Velka ei kohdistu
          mihinkään tiettyyn menoon.
        </li>
      </ul>

      <ol className="week-list">
        {segments.map((g) => (
          <li key={g.id}>
            <span className="dot" style={{ background: g.color }} />
            <span>{g.name}</span>
            <span className="week-time">
              {when(g.from)} – {clock(g.to).day === clock(g.from).day ? clock(g.to).time : when(g.to)}
            </span>
          </li>
        ))}
      </ol>
      <p className="subs-note">
        40 tunnin viikko vastaa bruttokansantuotetta vuonna {data.baseYear}. Menot on järjestetty suurimmasta
        pienimpään. Julkisiin menoihin kuuluu myös tulonsiirtoja, kuten eläkkeitä, jotka palaavat kotitalouksille.
        Viikon loppuosa ({when(spendEnd)} alkaen) jää muuhun talouteen.
      </p>
    </div>
  );
}
