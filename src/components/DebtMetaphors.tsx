import type { FinanceData } from "../types";
import { num } from "../format";

// Velka-luvun vertauskuvat: perheen osuus ja asuntolainat, palkkakuukaudet sekä velkakalenteri.

// Kotitalouksien asuntolainakanta, Suomen Pankki (toukokuu 2026).
const MORTGAGE_STOCK_BN = 105.5;
const MORTGAGE_SOURCE = {
  label: "Suomen Pankki, toukokuu 2026",
  url: "https://www.sttinfo.fi/tiedote/72170068/kotitalouslainojen-korot-nousivat-toukokuussa-2026?publisherId=1865&lang=fi",
};
// Palkka- ja palkkiotulojen mediaani, Tilastokeskus (joulukuu 2025).
const MEDIAN_PAY = 3393;
const PAY_SOURCE = {
  label: "Tilastokeskus, joulukuu 2025",
  url: "https://stat.fi/tup/kokeelliset-tilastot/tulorekisterin_palkat_ja_palkkiot/2026-02-09/index.html",
};

const MONTHS = ["tam", "hel", "maa", "huh", "tou", "kes", "hei", "elo", "syy", "lok", "mar", "jou"];

const euros = (v: number) => `${num(Math.round(v / 100) * 100, 0)} €`;

export default function DebtMetaphors({ data }: { data: FinanceData }) {
  const perPerson = (data.debt * 1e6) / data.population;
  const family = perPerson * 4;
  const familyInterest = (((data.interest * 1e6) / data.population) * 4) / 12;
  const mortgageTimes = data.debt / 1000 / MORTGAGE_STOCK_BN;
  const payMonths = perPerson / MEDIAN_PAY;

  // Velkakalenteri: velka suhteessa BKT:hen osuutena vuodesta.
  const share = data.debtRatio / 100;
  const year = new Date().getFullYear();
  const endDate = new Date(year, 0, 1 + Math.floor(share * 365));
  const endText = endDate.toLocaleDateString("fi-FI", { day: "numeric", month: "long" });

  return (
    <div className="metaphors">
      <h3>Mihin velkaa voi verrata?</h3>
      <div className="metaphor">
        <div className="metaphor-big">{euros(family)}</div>
        <div>
          <h4>Perheen toinen asuntolaina</h4>
          <p>
            Nelihenkisen perheen osuus julkisesta velasta on {euros(family)}, ja sen korkoihin menee noin{" "}
            <b>{num(Math.round(familyInterest), 0)} € kuussa</b>. Koko julkinen velka on {num(mortgageTimes, 1)}
            -kertainen kaikkien suomalaisten asuntolainojen yhteismäärään ({num(MORTGAGE_STOCK_BN, 1)} mrd €)
            verrattuna.
          </p>
          <p className="subs-note">
            Asuntolainat:{" "}
            <a href={MORTGAGE_SOURCE.url} target="_blank" rel="noreferrer">
              {MORTGAGE_SOURCE.label}
            </a>
            .
          </p>
        </div>
      </div>

      <div className="metaphor">
        <div className="metaphor-big">{num(payMonths, 0)} kk</div>
        <div>
          <h4>Yli vuoden palkka</h4>
          <p>
            Jokaisen suomalaisen osuus velasta, {num(Math.round(perPerson / 10) * 10, 0)} €, vastaa{" "}
            <b>{num(payMonths, 0)} kuukauden</b> mediaanipalkkaa ennen veroja. Palkansaajien mediaanipalkka oli{" "}
            {num(MEDIAN_PAY, 0)} € kuussa.
          </p>
          <p className="subs-note">
            Palkka:{" "}
            <a href={PAY_SOURCE.url} target="_blank" rel="noreferrer">
              {PAY_SOURCE.label}
            </a>
            , palkka- ja palkkiotulojen mediaani.
          </p>
        </div>
      </div>

      <div className="metaphor">
        <div className="metaphor-big">{endText}</div>
        <div>
          <h4>Velkakalenteri</h4>
          <p>
            Jos koko Suomen tuotanto käytettäisiin pelkkään velan maksuun, siihen menisi vuoden alusta <b>{endText}</b>{" "}
            asti. Koko vuoden työ ja tuotanto, ei mitään muuta.
          </p>
          <div className="year-bar" aria-hidden="true">
            <i style={{ width: `${share * 100}%` }} />
            {MONTHS.map((m, k) => (
              <span key={m} style={{ left: `${(k / 12) * 100}%` }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
