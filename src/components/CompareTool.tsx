import { useRef, useState } from "react";
import { track } from "../track";
import type { CompareData, CompareRow, CountryCode } from "../types";
import { num } from "../format";
import { LineChart } from "./charts";

// Vertailu osa-alueittain: yleiskuva, menot tehtävittäin ja lajeittain sekä tulot lajeittain.
// Data on miljoonina euroina, ja se muunnetaan prosenteiksi kyseisen vuoden BKT:stä.

const IN: Record<CountryCode, string> = { FI: "Suomessa", SE: "Ruotsissa", EE: "Virossa" };

const fmt = (v: number, signed = false) => num(v, 1, signed);

// Aikajanan viitearvot.
const REF_LINES: Record<string, { value: number; label: string }> = {
  debt: { value: 60, label: "EU:n viitearvo 60 %" },
  deficit: { value: 3, label: "EU:n alijäämäraja 3 %" },
};

/** Oletuksena aikajanalla velka, jos ryhmässä on velkarivi. */
const defaultPick = (rows: CompareRow[]) =>
  Math.max(
    0,
    rows.findIndex((r) => r.id === "debt"),
  );

export default function CompareTool({
  data,
  codes,
  names,
  colors,
}: {
  data: CompareData;
  codes: CountryCode[];
  names: Record<CountryCode, string>;
  colors: Record<CountryCode, string>;
}) {
  const [groupId, setGroupId] = useState(data.groups[0].id);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const group = data.groups.find((g) => g.id === groupId)!;
  const [pick, setPick] = useState(() => defaultPick(data.groups[0].rows));

  /** Milj. € → % kyseisen vuoden BKT:stä. */
  const convAt = (v: number | null, c: CountryCode, year: number) =>
    v === null ? null : (v / data.scale[year].gdp[c]) * 100;
  const convRow = (r: CompareRow, c: CountryCode) => convAt(r.values[c], c, r.year ?? group.year);

  // Aikajanalle valittavat erät: pääluokat ja niiden alaerät.
  const options = group.rows.flatMap((r) => [{ row: r, sub: false }, ...r.parts.map((p) => ({ row: p, sub: true }))]);
  const picked = options[Math.min(pick, options.length - 1)].row;
  // Aikajana on taulukon yläpuolella: tuodaan se näkyviin, jos se on vieritetty pois.
  const timelineRef = useRef<HTMLDivElement>(null);
  const pickRow = (r: CompareRow) => {
    setPick(options.findIndex((o) => o.row === r));
    track("Vertailu: aikajana", { era: r.name });
    const el = timelineRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const max = Math.max(...group.rows.flatMap((r) => codes.map((c) => convRow(r, c) ?? 0))) * 1.08;

  // Suurimmat erot Suomen ja naapurin välillä pääluokittain. Alaerissä maiden kirjaustavat eroavat enemmän.
  const leaves = group.rows;
  const gaps = codes
    .filter((c) => c !== "FI")
    .map((c) => {
      const diffs = leaves
        .map((r) => ({ name: r.name, d: (convRow(r, "FI") ?? NaN) - (convRow(r, c) ?? NaN) }))
        .filter((x) => Number.isFinite(x.d));
      const more = diffs.reduce((a, b) => (b.d > a.d ? b : a));
      const less = diffs.reduce((a, b) => (b.d < a.d ? b : a));
      return { c, more, less };
    });

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandable = group.rows.filter((r) => r.parts.length > 0).map((r) => `${group.id}:${r.name}`);
  const allOpen = expandable.length > 0 && expandable.every((k) => open.has(k));

  const unitShort = "%-yks.";
  const lower = (s: string) => (s.charAt(0).toLowerCase() + s.slice(1)).replace(/ \(.*\)$/, "");

  const renderRow = (r: CompareRow, sub: boolean) => {
    const key = `${group.id}:${r.name}`;
    const canOpen = !sub && r.parts.length > 0;
    const isOpen = open.has(key);
    const name = canOpen ? (
      <button
        className="dot-name compare-open"
        aria-expanded={isOpen}
        onClick={() => {
          toggle(key);
          pickRow(r);
        }}
      >
        <span className="compare-sign" aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
        {r.name}
      </button>
    ) : (
      <span className="dot-name">{r.name}</span>
    );
    return (
      <div
        key={key + (sub ? ":sub" : "")}
        className={`dot-row compare-row ${sub ? "sub" : ""} ${picked === r ? "picked" : ""}`}
        role="row"
        title="Näytä aikajanalla"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest(".compare-open")) pickRow(r);
        }}
      >
        {name}
        <span className="dot-track" aria-hidden="true">
          {codes.map((c) => {
            const v = convRow(r, c);
            return v === null ? null : (
              <span
                key={c}
                className={`dot-mark ${c === "FI" ? "fi" : ""}`}
                style={{ left: `${(Math.max(0, v) / max) * 100}%`, background: colors[c] }}
              />
            );
          })}
        </span>
        {codes.map((c) => {
          const v = convRow(r, c);
          return (
            <span key={c} className={`dot-val ${c === "FI" ? "fi" : ""}`}>
              {v === null ? "–" : fmt(v)}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="compare">
      <h3 className="compare-title">Vertaile itse</h3>
      <div className="compare-controls">
        <div className="toggle compare-groups" role="tablist" aria-label="Vertailtava asia">
          {data.groups.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={g.id === groupId}
              className={g.id === groupId ? "on" : ""}
              onClick={() => {
                setGroupId(g.id);
                setPick(defaultPick(g.rows));
                track("Vertailu: välilehti", { ryhma: g.title });
              }}
            >
              {g.title}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-timeline" ref={timelineRef}>
        <div className="compare-timeline-head">
          <label htmlFor="compare-pick" className="unit-label">
            Aikajanalla
          </label>
          <select id="compare-pick" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
            {options.map((o, i) => (
              <option key={i} value={i}>
                {o.sub ? "\u2003" : ""}
                {o.row.name}
              </option>
            ))}
          </select>
        </div>
        <h4>
          {picked.name}, {data.from}–{group.year}
        </h4>
        <div className="legend">
          {codes.map((c) => (
            <span key={c}>
              <i style={{ borderColor: colors[c] }} />
              {names[c]}
            </span>
          ))}
        </div>
        <LineChart
          height={240}
          minY={0}
          unit="%"
          refLine={picked.id ? REF_LINES[picked.id] : undefined}
          series={codes.map((c) => ({
            label: names[c],
            color: colors[c],
            width: c === "FI" ? 3.5 : 2.5,
            points: picked.hist[c]
              .map((v, i) => ({ year: data.from + i, value: convAt(v, c, data.from + i) }))
              .filter((p): p is { year: number; value: number } => p.value !== null),
          }))}
        />
        <p className="compare-hint">
          Osuus BKT:stä kasvaa myös silloin, kun talous supistuu: vuosien 2009 ja 2020 piikit johtuvat osin BKT:n
          pudotuksesta.
        </p>
      </div>
      <p className="compare-hint">
        {group.hint} Vuosi {group.year}. Plusmerkki avaa tarkemman erittelyn. Valitse rivi, niin näet sen kehityksen
        aikajanalla taulukon yllä.
      </p>

      <ul className="compare-gaps">
        {gaps.map(({ c, more, less }) => (
          <li key={c}>
            <b>Suomi vs. {names[c]}:</b>{" "}
            {more.d > 0 && (
              <>
                Suomessa isompi: {lower(more.name)} ({fmt(more.d, true)} {unitShort}).{" "}
              </>
            )}
            {less.d < 0 && (
              <>
                {IN[c]} isompi: {lower(less.name)} ({fmt(-less.d, true)} {unitShort}).
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="dot-table" role="table" aria-label={`${group.title} ${group.year}`}>
        <div className="dot-row head" role="row">
          <span className="dot-name">
            {group.title} {group.year}
          </span>
          <span className="dot-track-head">% BKT:stä</span>
          {codes.map((c) => (
            <span key={c} className="dot-val head" style={{ color: colors[c] }}>
              {names[c]}
            </span>
          ))}
        </div>
        {group.rows.flatMap((r) => [
          renderRow(r, false),
          ...(open.has(`${group.id}:${r.name}`) ? r.parts.map((p) => renderRow(p, true)) : []),
        ])}
      </div>
      {expandable.length > 0 && (
        <button
          className="btn compare-all"
          onClick={() =>
            setOpen((prev) => {
              const next = new Set(prev);
              for (const k of expandable) {
                if (allOpen) next.delete(k);
                else next.add(k);
              }
              return next;
            })
          }
        >
          {allOpen ? "Sulje erittelyt" : "Avaa kaikki erittelyt"}
        </button>
      )}
    </div>
  );
}
