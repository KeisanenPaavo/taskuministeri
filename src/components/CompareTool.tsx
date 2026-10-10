import { useState } from "react";
import type { CompareData, CompareRow, CountryCode, MaybeByCountry } from "../types";
import { num } from "../format";

// Vertailu osa-alueittain: menot tehtävittäin ja lajeittain sekä tulot lajeittain.
// Data on miljoonina euroina, ja se muunnetaan valinnan mukaan % BKT:stä tai euroiksi asukasta kohden päivässä.

type CUnit = "pct" | "day";

const C_UNITS: { id: CUnit; label: string; axis: string }[] = [
  { id: "pct", label: "% BKT:stä", axis: "% BKT:stä" },
  { id: "day", label: "€ / asukas / päivä", axis: "€ asukasta kohden päivässä" },
];

const IN: Record<CountryCode, string> = { FI: "Suomessa", SE: "Ruotsissa", EE: "Virossa" };

const daysIn = (year: number) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365);

/** Luvun muotoilu: alle 10 kahdella desimaalilla, alle 100 yhdellä, muuten kokonaislukuna. */
function fmt(v: number, unit: CUnit, signed = false) {
  if (unit === "pct") return num(v, 1, signed);
  const a = Math.abs(v);
  return num(v, a < 10 ? 2 : a < 100 ? 1 : 0, signed);
}

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
  const [unit, setUnit] = useState<CUnit>("pct");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const group = data.groups.find((g) => g.id === groupId)!;
  const scale = data.scale[group.year];

  const conv = (vals: MaybeByCountry, c: CountryCode) => {
    const v = vals[c];
    if (v === null) return null;
    return unit === "pct" ? (v / scale.gdp[c]) * 100 : (v * 1e6) / scale.pop[c] / daysIn(group.year);
  };

  const max = Math.max(...group.rows.flatMap((r) => codes.map((c) => conv(r.values, c) ?? 0))) * 1.08;

  // Suurimmat erot Suomen ja naapurin välillä pääluokittain. Alaerissä maiden kirjaustavat eroavat enemmän.
  const leaves = group.rows;
  const gaps = codes
    .filter((c) => c !== "FI")
    .map((c) => {
      const diffs = leaves
        .map((r) => ({ name: r.name, d: (conv(r.values, "FI") ?? NaN) - (conv(r.values, c) ?? NaN) }))
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

  const unitShort = unit === "pct" ? "%-yks." : "€/pv";
  const lower = (s: string) => (s.charAt(0).toLowerCase() + s.slice(1)).replace(/ \(.*\)$/, "");

  const renderRow = (r: CompareRow, sub: boolean) => {
    const key = `${group.id}:${r.name}`;
    const canOpen = !sub && r.parts.length > 0;
    const isOpen = open.has(key);
    const name = canOpen ? (
      <button className="dot-name compare-open" aria-expanded={isOpen} onClick={() => toggle(key)}>
        <span className="compare-sign" aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
        {r.name}
      </button>
    ) : (
      <span className="dot-name">{r.name}</span>
    );
    return (
      <div key={key + (sub ? ":sub" : "")} className={`dot-row ${sub ? "sub" : ""}`} role="row">
        {name}
        <span className="dot-track" aria-hidden="true">
          {codes.map((c) => {
            const v = conv(r.values, c);
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
          const v = conv(r.values, c);
          return (
            <span key={c} className={`dot-val ${c === "FI" ? "fi" : ""}`}>
              {v === null ? "–" : fmt(v, unit)}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="compare">
      <h3 className="compare-title">Vertaile osa-alueittain</h3>
      <div className="compare-controls">
        <div className="toggle compare-groups" role="tablist" aria-label="Vertailtava asia">
          {data.groups.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={g.id === groupId}
              className={g.id === groupId ? "on" : ""}
              onClick={() => setGroupId(g.id)}
            >
              {g.title}
            </button>
          ))}
        </div>
        <div className="unit-picker">
          <span className="unit-label" id="compare-unit">
            Näytä
          </span>
          <div className="toggle" role="group" aria-labelledby="compare-unit">
            {C_UNITS.map((u) => (
              <button
                key={u.id}
                className={unit === u.id ? "on" : ""}
                aria-pressed={unit === u.id}
                onClick={() => setUnit(u.id)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="compare-hint">
        {group.hint} Vuosi {group.year}. Avaa rivi plusmerkistä nähdäksesi tarkemman erittelyn.
      </p>

      <ul className="compare-gaps">
        {gaps.map(({ c, more, less }) => (
          <li key={c}>
            <b>Suomi vs. {names[c]}:</b>{" "}
            {more.d > 0 && (
              <>
                Suomessa isompi: {lower(more.name)} ({fmt(more.d, unit, true)} {unitShort}).{" "}
              </>
            )}
            {less.d < 0 && (
              <>
                {IN[c]} isompi: {lower(less.name)} ({fmt(-less.d, unit, true)} {unitShort}).
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
          <span className="dot-track-head">{C_UNITS.find((u) => u.id === unit)!.axis}</span>
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
      {unit === "day" && (
        <p className="compare-hint">
          Ruotsin kruunut on muunnettu euroiksi vuoden keskikurssilla. Hintatasot eroavat maiden välillä, ja esimerkiksi
          Virossa hintataso on selvästi Suomea matalampi, joten sama euromäärä ei osta joka maassa yhtä paljon.
        </p>
      )}
    </div>
  );
}
