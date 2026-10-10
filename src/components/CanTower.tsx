import type { FinanceData } from "../types";
import { num } from "../format";
import { CAN_DEPOSIT } from "./MuchOrLittle";

// Velka per asukas tölkkipantteina ja tölkkitornina. 0,33 litran tölkki on noin 11,5 cm korkea.
const CAN_HEIGHT_M = 0.115;

const LANDMARKS = [
  { name: "Mount Everest", km: 8.849 },
  { name: "Matkustajakoneen lentokorkeus", km: 11 },
];

export default function CanTower({ data }: { data: FinanceData }) {
  const perPerson = (data.debt * 1e6) / data.population;
  const cans = perPerson / CAN_DEPOSIT;
  const km = (cans * CAN_HEIGHT_M) / 1000;
  const everests = km / LANDMARKS[0].km;
  const rows = [...LANDMARKS.map((l) => ({ ...l, tower: false })), { name: "Sinun tölkkitornisi", km, tower: true }];
  const max = Math.max(...rows.map((r) => r.km));

  return (
    <div className="can-tower">
      <h3>Velka tölkkeinä</h3>
      <p>
        Jokaisen suomalaisen osuus julkisesta velasta on <b>{num(Math.round(perPerson / 10) * 10, 0)} €</b>. Sen
        maksamiseen tarvittaisiin <b>{num(Math.round(cans / 100) * 100, 0)} tölkin pantit</b>. Pinottuna 0,33 litran
        tölkit nousisivat <b>{num(km, 0)} kilometrin</b> korkeuteen, {num(everests, 1)} kertaa Mount Everestin
        korkeudelle ja selvästi lentokoneiden yläpuolelle.
      </p>
      <ul className="tower-bars">
        {rows.map((r) => (
          <li key={r.name} className={r.tower ? "tower" : ""}>
            <span className="tower-name">{r.name}</span>
            <span className="tower-track" aria-hidden="true">
              <i style={{ width: `${(r.km / max) * 100}%` }} />
            </span>
            <span className="tower-val">{num(r.km, r.km < 20 ? 1 : 0)} km</span>
          </li>
        ))}
      </ul>
      <p className="subs-note">
        Pantti 0,15 € tölkiltä (
        <a
          href="https://www.palpa.fi/kuluttajille/millaisia-pakkauksia-voi-palauttaa/"
          target="_blank"
          rel="noreferrer"
        >
          Palpa
        </a>
        ), tölkin korkeus noin 11,5 cm. Velka vuoden {data.baseYear} lopussa jaettuna tasan kaikkien asukkaiden kesken.
      </p>
    </div>
  );
}
