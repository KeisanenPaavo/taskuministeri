import { useMemo, useState } from "react";
import type { FinanceData } from "../types";
import { EXPENDITURE_COLORS } from "../colors";
import { num } from "../format";

// "Sata euroa" -peli: pelaaja jakaa 100 € julkisia menoja haluamallaan tavalla
// ja näkee sitten, miten Suomi oikeasti jakaa ne.

interface Group {
  id: string;
  name: string;
  emoji: string;
  ids: string[]; // datan menoerät
  persona: string; // arvonimi, jos pelaaja painottaa tätä eniten
}

const GROUPS: Group[] = [
  { id: "pensions", name: "Eläkkeet ja vanhuspalvelut", emoji: "👵", ids: ["pensions"], persona: "Eläkeläisten ystävä" },
  { id: "health", name: "Terveydenhuolto", emoji: "🏥", ids: ["health"], persona: "Terveyden puolustaja" },
  { id: "education", name: "Koulutus", emoji: "🎓", ids: ["education"], persona: "Sivistysvaltion rakentaja" },
  { id: "family", name: "Perheet ja lapset", emoji: "👶", ids: ["family"], persona: "Lapsiperheiden asianajaja" },
  {
    id: "social",
    name: "Sairaus, työttömyys ja muu sosiaaliturva",
    emoji: "🤝",
    ids: ["sickness", "unemployment", "otherSocial"],
    persona: "Turvaverkon kutoja",
  },
  { id: "economy", name: "Elinkeinot ja liikenne", emoji: "🚆", ids: ["economy"], persona: "Infran rakentaja" },
  {
    id: "security",
    name: "Puolustus ja turvallisuus",
    emoji: "🛡️",
    ids: ["defence", "order"],
    persona: "Turvallisuuden vartija",
  },
  {
    id: "culture",
    name: "Kulttuuri, liikunta ja ympäristö",
    emoji: "🎭",
    ids: ["culture", "environment"],
    persona: "Kulttuurin ja luonnon puolustaja",
  },
  { id: "admin", name: "Hallinto ja tutkimus", emoji: "🏛️", ids: ["admin"], persona: "Virkakoneiston arkkitehti" },
];

const TOTAL = 100;
const MAX = 50;

export default function HundredEuros({ data }: { data: FinanceData }) {
  // Todellinen jako sadasta eurosta. Korot ovat pakollinen meno, joka lukitaan.
  const { actual, interest } = useMemo(() => {
    const val = (id: string) => data.expenditure.find((e) => e.id === id)?.value ?? 0;
    const interest = Math.round((val("interest") / data.expenditureTotal) * TOTAL);
    const actual: Record<string, number> = {};
    for (const g of GROUPS) {
      actual[g.id] = (g.ids.reduce((a, id) => a + val(id), 0) / data.expenditureTotal) * TOTAL;
    }
    return { actual, interest };
  }, [data]);

  const budget = TOTAL - interest;
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [revealed, setRevealed] = useState(false);
  const [shared, setShared] = useState(false);

  const used = GROUPS.reduce((a, g) => a + (alloc[g.id] ?? 0), 0);
  const left = budget - used;

  const set = (id: string, v: number) => {
    const current = alloc[id] ?? 0;
    setAlloc({ ...alloc, [id]: Math.max(0, Math.min(v, current + left)) });
  };

  const spreadRest = () => {
    const next = { ...alloc };
    const per = Math.floor(left / GROUPS.length);
    let extra = left - per * GROUPS.length;
    for (const g of GROUPS) {
      next[g.id] = (next[g.id] ?? 0) + per + (extra-- > 0 ? 1 : 0);
    }
    setAlloc(next);
  };

  const restart = () => {
    setAlloc({});
    setRevealed(false);
    setShared(false);
  };

  // Tulokset: yhtäläisyys = 100 − puolet absoluuttisten erojen summasta
  // (0 = täysin eri jako, 100 = täsmälleen sama kuin Suomessa).
  const diffs = GROUPS.map((g) => ({ g, mine: alloc[g.id] ?? 0, real: actual[g.id] })).map((x) => ({
    ...x,
    diff: x.mine - x.real,
  }));
  const similarity = Math.max(0, Math.round(TOTAL - diffs.reduce((a, x) => a + Math.abs(x.diff), 0) / 2));
  const most = [...diffs].sort((a, b) => b.diff - a.diff)[0];
  const least = [...diffs].sort((a, b) => a.diff - b.diff)[0];
  const persona = most.diff > 2 ? most.g.persona : "Realisti";

  const share = async () => {
    const url = `${location.origin}${location.pathname}#peli`;
    const text = `Jaoin 100 € julkisia menoja Taskuministerissä. Minun Suomeni on ${similarity} % sama kuin oikea Suomi. Arvonimeni: ${persona} ${most.g.emoji}. Miten sinä jakaisit?`;
    try {
      if (navigator.share) await navigator.share({ title: "Taskuministeri: Sata euroa", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShared(true);
      }
    } catch {
      /* käyttäjä perui jakamisen */
    }
  };

  return (
    <div className="card game hundred">
      {!revealed ? (
        <>
          <h3 className="game-q">Miten sinä käyttäisit 100 €?</h3>
          <p className="hundred-lead">
            Jokaisesta sadasta julkisesta eurosta <b>{interest} €</b> menee ensin velan korkoihin. Ne on pakko maksaa.
            Jaa loput <b>{budget} €</b> niin kuin itse haluaisit. Sen jälkeen näet, miten Suomi oikeasti jakaa ne.
          </p>

          <div className={`pot ${left === 0 ? "full" : ""}`}>
            <div className="pot-bar">
              <div className="pot-locked" style={{ width: `${interest}%` }} title="Velan korot" />
              {GROUPS.map((g) => (
                <div
                  key={g.id}
                  style={{ width: `${alloc[g.id] ?? 0}%`, background: EXPENDITURE_COLORS[g.ids[0]] }}
                  title={`${g.name}: ${alloc[g.id] ?? 0} €`}
                />
              ))}
            </div>
            <div className="pot-text">
              {left > 0 ? (
                <>
                  Jaettavana vielä <b>{left} €</b>
                </>
              ) : (
                <>✓ Kaikki {budget} € jaettu</>
              )}
            </div>
          </div>

          <div className="alloc-list">
            <div className="alloc-row locked">
              <span className="alloc-emoji">💸</span>
              <span className="alloc-name">
                Velan korot <small>pakollinen</small>
              </span>
              <span className="alloc-lock">🔒</span>
              <b className="alloc-val">{interest} €</b>
            </div>
            {GROUPS.map((g) => {
              const v = alloc[g.id] ?? 0;
              return (
                <div className="alloc-row" key={g.id}>
                  <span className="alloc-emoji">{g.emoji}</span>
                  <span className="alloc-name">{g.name}</span>
                  <input
                    type="range"
                    min={0}
                    max={MAX}
                    step={1}
                    value={v}
                    aria-label={g.name}
                    onChange={(e) => set(g.id, Number(e.target.value))}
                    style={{ ["--fill" as string]: `${(v / MAX) * 100}%`, ["--from" as string]: "0%" }}
                  />
                  <span className="alloc-steps">
                    <button onClick={() => set(g.id, v - 1)} aria-label={`Vähennä: ${g.name}`} disabled={v === 0}>
                      −
                    </button>
                    <button onClick={() => set(g.id, v + 1)} aria-label={`Lisää: ${g.name}`} disabled={left === 0}>
                      +
                    </button>
                  </span>
                  <b className="alloc-val">{v} €</b>
                </div>
              );
            })}
          </div>

          <div className="game-actions" style={{ marginTop: 16 }}>
            {left > 0 && used > 0 && (
              <button className="btn" onClick={spreadRest}>
                Jaa loput {left} € tasan
              </button>
            )}
            <button className="btn primary" onClick={() => setRevealed(true)} disabled={left !== 0}>
              {left === 0 ? "Näytä, miten Suomi jakaa →" : `Jaa vielä ${left} €`}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="hundred-result">
            <div className="game-score">
              {similarity}
              <span> %</span>
            </div>
            <p>Sinun Suomesi on {similarity}-prosenttisesti sama kuin oikea Suomi.</p>
            <h3>
              {most.g.emoji} {persona}
            </h3>
            <p className="muted">
              {most.diff > 2 ? (
                <>
                  <b>{most.g.name}</b>: annoit {num(most.mine, 0)} €, Suomi käyttää {num(most.real, 0)} €.{" "}
                </>
              ) : (
                <>Jakosi on hyvin lähellä todellisuutta. </>
              )}
              {least.diff < -2 && (
                <>
                  Suurin yllätys: <b>{least.g.name}</b> vie todellisuudessa {num(least.real, 0)} €, sinä annoit{" "}
                  {num(least.mine, 0)} €.
                </>
              )}
            </p>
          </div>

          <div className="compare-legend">
            <span>
              <i className="mine" /> Sinun jakosi
            </span>
            <span>
              <i className="real" /> Suomi oikeasti
            </span>
          </div>
          <div className="compare-list">
            <CompareRow emoji="💸" name="Velan korot" mine={interest} real={interest} color={EXPENDITURE_COLORS.interest} />
            {[...diffs]
              .sort((a, b) => b.real - a.real)
              .map(({ g, mine, real }) => (
                <CompareRow
                  key={g.id}
                  emoji={g.emoji}
                  name={g.name}
                  mine={mine}
                  real={real}
                  color={EXPENDITURE_COLORS[g.ids[0]]}
                />
              ))}
          </div>

          <div className="game-actions" style={{ marginTop: 20 }}>
            <button className="btn primary" onClick={share}>
              {shared ? "✓ Kopioitu, liitä viestiin" : "📣 Haasta kaveri"}
            </button>
            <button className="btn" onClick={restart}>
              ↺ Jaa uudestaan
            </button>
            <a className="btn" href="#rahat">
              Katso tarkemmin →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function CompareRow({
  emoji,
  name,
  mine,
  real,
  color,
}: {
  emoji: string;
  name: string;
  mine: number;
  real: number;
  color: string;
}) {
  // Erotus näytetään samoista pyöristetyistä luvuista, jotka näkyvät rivillä.
  const diff = Math.round(mine) - Math.round(real);
  const scale = (v: number) => `${(v / MAX) * 100}%`;
  return (
    <div className="compare-row">
      <div className="compare-head">
        <span>
          {emoji} {name}
        </span>
        <span>
          <b>{num(mine, 0)} €</b> / {num(real, 0)} €
          {diff !== 0 && (
            <em className={diff > 0 ? "more" : "less"}>
              {diff > 0 ? "+" : "−"}
              {num(Math.abs(diff), 0)}
            </em>
          )}
        </span>
      </div>
      <div className="compare-bars">
        <div className="bar-mine" style={{ width: scale(mine), background: color }} />
        <div className="bar-real" style={{ width: scale(real), borderColor: color }} />
      </div>
    </div>
  );
}
