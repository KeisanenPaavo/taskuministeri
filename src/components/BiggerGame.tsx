import { useEffect, useMemo, useState } from "react";
import type { FinanceData, Item } from "../types";
import { EXPENDITURE_COLORS, REVENUE_COLORS } from "../colors";
import { mrd, num, perDay } from "../format";
import { track, trackOnce } from "../track";

// "Kumpi on isompi?" -peli. Parit on valittu käsin niin, että niissä on yllätyksiä,
// mutta oikea vastaus ja erotukset lasketaan aina datasta.

const ROUNDS = 10;
/** Liian tasaväkiset parit (ero alle tämän) jätetään pois, koska ne olisivat arpapeliä. */
const MIN_DIFF = 0.03;

const PAIRS: [string, string][] = [
  ["interest", "defence"],
  ["education", "pensions"],
  ["vat", "incomeTax"],
  ["corporateTax", "unemployment"],
  ["health", "education"],
  ["deficit", "family"],
  ["excise", "culture"],
  ["family", "unemployment"],
  ["order", "culture"],
  ["socialContrib", "vat"],
  ["admin", "health"],
  ["economy", "education"],
  ["otherTax", "defence"],
  ["environment", "defence"],
  ["deficit", "education"],
  ["corporateTax", "defence"],
  ["interest", "order"],
];

type Kind = "Tulo" | "Meno" | "Velka";
interface Entry extends Item {
  kind: Kind;
  color: string;
}

interface Question {
  a: Entry;
  b: Entry;
}

const RANKS: { min: number; title: string; text: string }[] = [
  { min: 10, title: "Taskuministeri", text: "Täydet pisteet! Miljardit ovat sinulle selvää kauraa." },
  { min: 8, title: "Valtiosihteeri", text: "Hienoa! Tunnet Suomen talouden mittasuhteet paremmin kuin useimmat." },
  { min: 5, title: "Erityisavustaja", text: "Hyvä alku. Muutama luku pääsi yllättämään." },
  { min: 0, title: "Kesäharjoittelija", text: "Miljardit ovat vaikeita. Siksi tämä sivu on olemassa!" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildEntries(d: FinanceData): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const r of d.revenue) out[r.id] = { ...r, kind: "Tulo", color: REVENUE_COLORS[r.id] };
  for (const e of d.expenditure) out[e.id] = { ...e, kind: "Meno", color: EXPENDITURE_COLORS[e.id] };
  out.deficit = {
    id: "deficit",
    name: "Uusi velka",
    value: d.expenditureTotal - d.revenueTotal,
    desc: "Se osa menoista, jota tulot eivät kattaneet ja joka otettiin velaksi.",
    kind: "Velka",
    color: "var(--deficit)",
  };
  return out;
}

function newGame(entries: Record<string, Entry>): Question[] {
  const valid = PAIRS.filter(([x, y]) => {
    const a = entries[x];
    const b = entries[y];
    if (!a || !b) return false;
    return Math.abs(a.value - b.value) / Math.max(a.value, b.value) >= MIN_DIFF;
  });
  return shuffle(valid)
    .slice(0, ROUNDS)
    .map(([x, y]) => (Math.random() < 0.5 ? { a: entries[x], b: entries[y] } : { a: entries[y], b: entries[x] }));
}

/** Osuus kokonaisuudesta selkokielellä, esim. "10,8 % kaikista julkisista menoista". */
function shareText(e: Entry, d: FinanceData) {
  if (e.kind === "Tulo") return `${num((e.value / d.revenueTotal) * 100, 1)} % kaikista julkisista tuloista`;
  if (e.kind === "Meno") return `${num((e.value / d.expenditureTotal) * 100, 1)} % kaikista julkisista menoista`;
  return `${num((e.value / d.expenditureTotal) * 100, 1)} % menoista rahoitettiin velalla`;
}

/** Vastauksen jälkeen näytettävä selitys: mitä erä sisältää ja mistä se koostuu. */
function Explain({ entry: e, data }: { entry: Entry; data: FinanceData }) {
  const parts = (e.parts ?? [])
    .filter((p) => p.name !== "Muut")
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  return (
    <div className="explain">
      <div className="explain-head">
        <div>
          <b>{e.name}</b>
          <small>{shareText(e, data)}</small>
        </div>
      </div>
      <p>{e.desc}</p>
      {parts.length > 1 && (
        <ul>
          {parts.map((p) => (
            <li key={p.name}>
              <div className="part-row">
                <span>{p.name}</span>
                <b>{perDay(p.value, data.population)}</b>
              </div>
              <div className="part-bar">
                <div style={{ width: `${(p.value / e.value) * 100}%`, background: e.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BiggerGame({ data }: { data: FinanceData }) {
  const entries = useMemo(() => buildEntries(data), [data]);
  const [questions, setQuestions] = useState(() => newGame(entries));
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [shared, setShared] = useState(false);

  const done = round >= questions.length;
  const q = questions[round];
  const day = (v: number) => perDay(v, data.population);

  const pick = (id: string) => {
    if (picked || !q) return;
    setPicked(id);
    trackOnce("Arvaa: aloitti");
    const winner = q.a.value > q.b.value ? q.a : q.b;
    const right = id === winner.id;
    if (right) setScore((s) => s + 1);
    if (round === questions.length - 1) track("Arvaa: pelasi loppuun", { pisteet: score + (right ? 1 : 0) });
  };
  const next = () => {
    setPicked(null);
    setRound((r) => r + 1);
  };
  const restart = () => {
    setQuestions(newGame(entries));
    setRound(0);
    setPicked(null);
    setScore(0);
    setShared(false);
  };

  // Näppäimistö: ← / → valitsee, Enter siirtyy eteenpäin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.getElementById("peli");
      if (!el || done) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      if (!picked && e.key === "ArrowLeft") pick(q.a.id);
      else if (!picked && e.key === "ArrowRight") pick(q.b.id);
      else if (picked && e.key === "Enter") next();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  if (done) {
    const rank = RANKS.find((r) => score >= r.min)!;
    const url = `${location.origin}${location.pathname}#peli`;
    const text = `Sain ${score}/${questions.length} Taskuministerin "Kumpi on isompi?" -pelissä (${rank.title}). Tunnetko Suomen talouden paremmin?`;
    const share = async () => {
      track("Arvaa: jakoi");
      try {
        if (navigator.share) await navigator.share({ title: "Taskuministeri", text, url });
        else {
          await navigator.clipboard.writeText(`${text} ${url}`);
          setShared(true);
        }
      } catch {
        /* käyttäjä perui jakamisen */
      }
    };
    return (
      <div className="card game game-end">
        <div className="game-score">
          {score}
          <span>/{questions.length}</span>
        </div>
        <h3>{rank.title}</h3>
        <p>{rank.text}</p>
        <div className="game-actions">
          <a className="btn primary" href="#paljon">
            Jatka: paljon vai vähän? →
          </a>
          <button className="btn" onClick={share}>
            {shared ? "Kopioitu, liitä viestiin" : "Haasta kaveri"}
          </button>
          <button className="btn" onClick={restart}>
            ↺ Pelaa uudestaan
          </button>
        </div>
      </div>
    );
  }

  const winner = q.a.value > q.b.value ? q.a : q.b;
  const loser = winner === q.a ? q.b : q.a;
  const correct = picked === winner.id;
  const max = Math.max(q.a.value, q.b.value);
  const ratio = winner.value / loser.value;

  return (
    <div className="card game">
      <div className="game-top">
        <span className="game-progress">
          Kysymys {round + 1}/{questions.length}
        </span>
        <div className="game-dots" aria-hidden>
          {questions.map((_, i) => (
            <i key={i} className={i < round ? "done" : i === round ? "now" : ""} />
          ))}
        </div>
        <span className="game-points">Pisteet {score}</span>
      </div>

      <h3 className="game-q">Kumpi on isompi?</h3>

      <div className="game-choices">
        {[q.a, q.b].map((e, i) => {
          const state = !picked ? "" : e.id === winner.id ? "win" : "lose";
          return (
            <button
              key={e.id}
              className={`choice ${state} ${picked === e.id ? "picked" : ""}`}
              onClick={() => pick(e.id)}
              disabled={!!picked}
              aria-label={`${e.name} (${i === 0 ? "vasen" : "oikea"})`}
            >
              <span className="choice-kind">{e.kind}</span>
              <span className="choice-name">{e.name}</span>
              {!picked && <span className="choice-sub">{e.desc}</span>}
              {picked && (
                <span className="choice-reveal">
                  <span className="choice-bar">
                    <span style={{ width: `${(e.value / max) * 100}%`, background: e.color }} />
                  </span>
                  <b>{day(e.value)}</b>
                  <small>per suomalainen · {mrd(e.value)} vuodessa</small>
                </span>
              )}
              {picked && e.id === winner.id && <span className="choice-badge">Isompi</span>}
            </button>
          );
        })}
      </div>

      {picked ? (
        <div className={`game-feedback ${correct ? "ok" : "no"}`}>
          <div>
            <b>{correct ? "Oikein." : "Väärin."}</b> {winner.name}:{" "}
            {ratio >= 1.5 ? `noin ${num(ratio, 1)} kertaa niin paljon` : `${num((ratio - 1) * 100, 0)} % enemmän`} kuin{" "}
            {loser.name.toLowerCase()}. Ero on {day(winner.value - loser.value)} jokaista suomalaista kohden.
          </div>
          <button className="btn primary" onClick={next} autoFocus>
            {round + 1 < questions.length ? "Seuraava →" : "Katso tulos →"}
          </button>
        </div>
      ) : null}

      {picked && (
        <div className="game-explain">
          {[q.a, q.b].map((e) => (
            <Explain key={e.id} entry={e} data={data} />
          ))}
        </div>
      )}

      {picked ? null : <p className="game-hint">Valitse kortti. Vinkki: näppäimistöllä ← ja →.</p>}
    </div>
  );
}
