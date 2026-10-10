import { useMemo, useState } from "react";
import type { FinanceData } from "../types";
import { project } from "../model";
import { mrd, num } from "../format";
import {
  CARDS,
  applyCards,
  cardEffect,
  challengeNumber,
  formatDate,
  generateChallenge,
  helsinkiDate,
  loadResults,
  meetsTarget,
  saveResult,
  score,
  streak,
  type Card,
  type Challenge,
  type Result,
} from "../daily";

const pctText = (v: number, digits = 1) => `${num(Math.abs(v), digits)} %`;

/** Mittarin arvo luettavassa muodossa, esim. "Alijäämä 4,2 %". */
function valueText(c: Challenge, v: number, digits = 1) {
  if (c.metric === "debt") return `Velka ${pctText(v, digits)} BKT:stä`;
  return v < 0 ? `Alijäämä ${pctText(v, digits)} BKT:stä` : `Ylijäämä ${pctText(v, digits)} BKT:stä`;
}

function targetText(c: Challenge) {
  if (c.metric === "debt") return `Velka enintään ${pctText(c.max!)} BKT:stä vuonna ${c.year}`;
  if (c.max !== undefined) {
    return `Alijäämä tasan välillä ${num(-c.max, 1)}–${num(-c.min!, 1)} % BKT:stä vuonna ${c.year}`;
  }
  return c.min! < 0
    ? `Alijäämä enintään ${pctText(c.min!)} BKT:stä vuonna ${c.year}`
    : `Ylijäämä vähintään ${pctText(c.min!)} BKT:stä vuonna ${c.year}`;
}

const kindEmoji = (c: Card) => (c.kind === "tax" ? "🧾" : "✂️");
const starRow = (n: number) => "⭐".repeat(n) + "☆".repeat(3 - n);

export default function DailyChallenge({ data }: { data: FinanceData }) {
  const today = challengeNumber(helsinkiDate());
  const [current, setCurrent] = useState(today);
  const c = useMemo(() => generateChallenge(data, current), [data, current]);
  const [results, setResults] = useState<Record<number, Result>>(loadResults);
  const saved = results[current];

  const [selected, setSelected] = useState<string[]>(saved?.cards ?? []);
  const [showResult, setShowResult] = useState(!!saved);
  const [shared, setShared] = useState(false);

  const goTo = (n: number) => {
    setCurrent(n);
    const r = results[n];
    setSelected(r?.cards ?? []);
    setShowResult(!!r);
    setShared(false);
  };

  const chosen = selected.map((id) => CARDS.find((x) => x.id === id)!);
  const row = project(data, applyCards(c.base, chosen))[c.yearIndex];
  const value = c.metric === "balance" ? row.balanceRatio : row.debtRatio;
  const reached = meetsTarget(c, value);
  const overshoot = c.max !== undefined && c.metric === "balance" && value > c.max;

  // Edistyminen lähtötilanteesta tavoitteeseen (0–1)
  const goal = c.metric === "debt" ? c.max! : c.min!;
  const progress = Math.max(0, Math.min(1, (value - c.start) / (goal - c.start)));
  const missing =
    c.metric === "balance" ? `${mrd(((c.min! - value) / 100) * row.gdp)}` : `${num(value - c.max!, 1)} %-yks.`;

  const effects = useMemo(
    () => Object.fromEntries(c.cards.map((card) => [card.id, cardEffect(data, c.base, card)])),
    [data, c],
  );

  const toggle = (id: string) => {
    if (showResult) return;
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const submit = () => {
    const r = score(c, chosen, value);
    // Säilytetään paras tulos, jos haastetta yritetään uudelleen.
    const prev = results[current];
    const best = prev && prev.stars > r.stars ? prev : r;
    saveResult(current, best);
    setResults({ ...results, [current]: best });
    setShowResult(true);
  };

  const retry = () => {
    setSelected([]);
    setShowResult(false);
    setShared(false);
  };

  const result = showResult ? score(c, chosen, value) : null;
  const currentStreak = streak(results, today);

  const share = async () => {
    if (!result) return;
    const url = `${location.origin}${location.pathname}#haaste`;
    const text = [
      `Taskuministeri #${c.number} ♠ ${c.theme.emoji} ${c.theme.name}`,
      `${starRow(result.stars)} ${chosen.length}/${c.maxMoves} korttia`,
      chosen.map(kindEmoji).join(""),
      `${valueText(c, c.start).split(" BKT")[0]} → ${pctText(value)}`,
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "Taskuministeri: päivän haaste", text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShared(true);
      }
    } catch {
      /* käyttäjä perui jakamisen */
    }
  };

  return (
    <div className="card daily">
      <div className="daily-top">
        <button
          className="daily-nav"
          onClick={() => goTo(current - 1)}
          disabled={current <= 1}
          aria-label="Edellinen haaste"
        >
          ‹
        </button>
        <div className="daily-title">
          <span>♠ Päivän haaste #{c.number}</span>
          <small>
            {current === today ? "Tänään" : formatDate(c.date)}
            {results[current] && ` · ${starRow(results[current].stars)}`}
            {currentStreak > 0 && ` · 🔥 ${currentStreak} pv putki`}
          </small>
        </div>
        <button
          className="daily-nav"
          onClick={() => goTo(current + 1)}
          disabled={current >= today}
          aria-label="Seuraava haaste"
        >
          ›
        </button>
      </div>

      <div className="daily-theme">
        <span className="daily-theme-emoji">{c.theme.emoji}</span>
        <div>
          <h3>{c.theme.name}</h3>
          <p>{c.theme.intro(data)}</p>
        </div>
      </div>

      <ul className="daily-rules">
        <li>
          🎯 <b>Tavoite:</b> {targetText(c)}
        </li>
        <li>
          🃏 <b>Kortteja:</b> enintään {c.maxMoves}
        </li>
        {c.forbidden && (
          <li>
            🚫 <b>Rajoite:</b> {CARDS.find((x) => x.id === c.forbidden)?.name} ei ole sallittu
          </li>
        )}
      </ul>

      <div className={`daily-meter ${reached ? "ok" : overshoot ? "over" : ""} ${showResult ? "done" : ""}`}>
        <div className="daily-meter-row">
          <span>{valueText(c, value, 2)}</span>
          <b>{reached ? "✓ Tavoite saavutettu" : overshoot ? "Liian iso sopeutus!" : `Puuttuu ${missing}`}</b>
        </div>
        <div className="daily-meter-bar">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="daily-cards">
        {c.cards.map((card) => {
          const forbidden = card.id === c.forbidden;
          const on = selected.includes(card.id);
          const full = selected.length >= c.maxMoves && !on;
          return (
            <button
              key={card.id}
              className={`daily-card ${on ? "on" : ""} ${forbidden ? "forbidden" : ""} ${card.kind}`}
              onClick={() => toggle(card.id)}
              disabled={forbidden || full || showResult}
              aria-pressed={on}
            >
              <span className="dc-emoji">{forbidden ? "🚫" : card.emoji}</span>
              <span className="dc-name">{card.name}</span>
              <span className="dc-effect">{forbidden ? "Kielletty tänään" : `+${mrd(effects[card.id])}`}</span>
              {on && <span className="dc-check">✓</span>}
            </button>
          );
        })}
      </div>

      {!showResult ? (
        <div className="daily-actions">
          <span className="daily-count">
            {selected.length}/{c.maxMoves} korttia valittu
          </span>
          <button className="btn primary" onClick={submit} disabled={selected.length === 0}>
            Hyväksy budjetti →
          </button>
        </div>
      ) : (
        result && (
          <div className="daily-result">
            <div className="daily-stars">{starRow(result.stars)}</div>
            <ul>
              <li className={result.target ? "ok" : "no"}>
                {result.target ? "✓" : "✗"} {targetText(c)}
              </li>
              <li className={result.parHit ? "ok" : "no"}>
                {result.parHit ? "✓" : "✗"} Pienin mahdollinen korttimäärä: {c.par} {c.par === 1 ? "kortti" : "korttia"}{" "}
                (sinulla {chosen.length})
              </li>
              <li className={result.bonusHit ? "ok" : "no"}>
                {result.bonusHit ? "✓" : "✗"} Salainen ehto: {c.bonus ? c.bonus.text : "ei tänään"}
              </li>
            </ul>
            <div className="game-actions">
              <button className="btn primary" onClick={share}>
                {shared ? "✓ Kopioitu, liitä viestiin" : "📣 Jaa tulos"}
              </button>
              <button className="btn" onClick={retry}>
                ↺ Yritä uudelleen
              </button>
            </div>
            <p className="daily-next">
              {current === today ? "Uusi haaste julkaistaan keskiyöllä. " : ""}
              Vinkki: aiempia haasteita voi pelata nuolista ‹ ›.
            </p>
          </div>
        )
      )}
    </div>
  );
}
