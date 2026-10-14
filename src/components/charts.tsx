import { useEffect, useRef, useState, type ReactNode } from "react";
import { num } from "../format";

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

interface Series {
  points: { year: number; value: number }[];
  color: string;
  dashed?: boolean;
  width?: number;
  label: string;
}

interface LineChartProps {
  series: Series[];
  height?: number;
  unit?: string;
  refLine?: { value: number; label: string };
  splitYear?: number; // ennusteen alku
  minY?: number;
  /** Tekstivastine ruudunlukijoille; oletuksena kuvaus muodostetaan sarjojen alku- ja loppuarvoista. */
  desc?: string;
}

/** Esim. "Suomi: 44 % vuonna 2000, 88 % vuonna 2025." */
function describeLines(series: Series[], unit: string) {
  const u = unit === "%" ? " %" : ` ${unit}`;
  return series
    .filter((s) => s.points.length > 0)
    .map((s) => {
      const a = s.points[0];
      const b = s.points[s.points.length - 1];
      return `${s.label}: ${num(a.value, 0)}${u} vuonna ${a.year}, ${num(b.value, 0)}${u} vuonna ${b.year}.`;
    })
    .join(" ");
}

const M = { top: 12, right: 14, bottom: 26, left: 40 };

export function LineChart({ series, height = 260, unit = "%", refLine, splitYear, minY, desc }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points);
  const years = all.map((p) => p.year);
  const x0 = Math.min(...years);
  const x1 = Math.max(...years);
  const values = all.map((p) => p.value).concat(refLine ? [refLine.value] : []);
  const yMin = minY ?? Math.min(0, ...values);
  const yMax = Math.max(...values) * 1.08;
  const ticks = niceTicks(yMin, yMax);
  const top = Math.max(yMax, ticks[ticks.length - 1]);

  const iw = Math.max(width - M.left - M.right, 10);
  const ih = height - M.top - M.bottom;
  const sx = (y: number) => M.left + ((y - x0) / (x1 - x0 || 1)) * iw;
  const sy = (v: number) => M.top + ih - ((v - yMin) / (top - yMin || 1)) * ih;

  const xTicks = niceTicks(x0, x1, Math.max(2, Math.floor(iw / 70)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const yr = Math.round(x0 + ((e.clientX - rect.left - M.left) / iw) * (x1 - x0));
    setHover(Math.min(x1, Math.max(x0, yr)));
  };

  const hoverValues =
    hover === null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => p.year === hover) }))
          .filter((x): x is { s: Series; p: { year: number; value: number } } => !!x.p);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg
        width={width}
        height={height}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "pan-y" }}
        role="img"
        aria-label={desc ?? describeLines(series, unit)}
      >
        {splitYear !== undefined && (
          <rect
            x={sx(splitYear)}
            y={M.top}
            width={Math.max(sx(x1) - sx(splitYear), 0)}
            height={ih}
            fill="var(--surface-2)"
            opacity={0.6}
          />
        )}
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
              <text x={M.left - 6} y={sy(t) + 4} textAnchor="end">
                {num(t, 0)}
                {/* Pitkä yksikkö (esim. mrd €) kerrotaan otsikossa, jotta akseli pysyy kapeana. */}
                {unit.length <= 1 ? unit : ""}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={height - 6} textAnchor="middle">
              {t}
            </text>
          ))}
        </g>
        {splitYear !== undefined && (
          <text x={sx(splitYear) + 6} y={M.top + 14} fontSize={11} fill="var(--muted)">
            Ennuste →
          </text>
        )}
        {refLine && (
          <g>
            <line
              x1={M.left}
              x2={M.left + iw}
              y1={sy(refLine.value)}
              y2={sy(refLine.value)}
              stroke="var(--muted)"
              strokeDasharray="2 4"
            />
            <text x={M.left + 4} y={sy(refLine.value) - 5} fontSize={11} fill="var(--muted)">
              {refLine.label}
            </text>
          </g>
        )}
        {yMin < 0 && <line x1={M.left} x2={M.left + iw} y1={sy(0)} y2={sy(0)} stroke="var(--faint)" />}
        {series.map((s) => (
          <path
            key={s.label}
            d={s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.year)},${sy(p.value)}`).join("")}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 2.5}
            strokeDasharray={s.dashed ? "5 5" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={M.top} y2={M.top + ih} stroke="var(--faint)" />
            {hoverValues.map(({ s, p }) => (
              <circle
                key={s.label}
                cx={sx(p.year)}
                cy={sy(p.value)}
                r={4}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && hoverValues.length > 0 && (
        <Tooltip x={sx(hover)} width={width}>
          <b>{hover}</b>
          {hoverValues.map(({ s, p }) => (
            <div key={s.label}>
              <span className="dot" style={{ background: s.color }} />
              {s.label}:{" "}
              <b>
                {num(p.value, 1)} {unit}
              </b>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = x > width / 2;
  return (
    <div
      className="tip card"
      style={{
        position: "absolute",
        top: 8,
        left: left ? undefined : x + 12,
        right: left ? width - x + 12 : undefined,
        padding: "8px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

interface BarChartProps {
  bars: { year: number; value: number; base?: number }[];
  height?: number;
  unit?: string;
  refLine?: { value: number; label: string };
  fmt?: (v: number) => string;
  /** Tekstivastine ruudunlukijoille. */
  desc?: string;
}

export function BarChart({ bars, height = 200, unit = "%", refLine, fmt, desc }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const vals = bars.flatMap((b) => [b.value, b.base ?? 0]).concat(refLine ? [refLine.value] : [], [0]);
  const lo = Math.min(...vals) * 1.15;
  const hi = Math.max(...vals, 0.5) * 1.15;
  const ticks = niceTicks(lo, hi, 4);
  const yMin = Math.min(lo, ticks[0]);
  const yMax = Math.max(hi, ticks[ticks.length - 1]);

  const iw = Math.max(width - M.left - M.right, 10);
  const ih = height - M.top - M.bottom;
  const sy = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const bw = iw / bars.length;
  const format = fmt ?? ((v: number) => `${num(v, 1, true)} ${unit}`);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block" }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={
          desc ??
          (bars.length
            ? `Vuodet ${bars[0].year}–${bars[bars.length - 1].year}: ${bars.map((b) => `${b.year} ${format(b.value)}`).join(", ")}.`
            : "")
        }
      >
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
              <text x={M.left - 6} y={sy(t) + 4} textAnchor="end">
                {num(t, 0)}
                {unit}
              </text>
            </g>
          ))}
        </g>
        {refLine && (
          <g>
            <line
              x1={M.left}
              x2={M.left + iw}
              y1={sy(refLine.value)}
              y2={sy(refLine.value)}
              stroke="var(--muted)"
              strokeDasharray="2 4"
            />
            <text x={M.left + iw - 4} y={sy(refLine.value) + 13} fontSize={11} fill="var(--muted)" textAnchor="end">
              {refLine.label}
            </text>
          </g>
        )}
        {bars.map((b, i) => {
          const x = M.left + i * bw;
          const pad = Math.min(bw * 0.18, 8);
          const color = b.value >= 0 ? "var(--good)" : "var(--deficit)";
          return (
            <g key={b.year} onPointerEnter={() => setHover(i)}>
              <rect x={x} y={M.top} width={bw} height={ih} fill="transparent" />
              {b.base !== undefined && (
                <rect
                  x={x + pad}
                  y={Math.min(sy(b.base), sy(0))}
                  width={bw - pad * 2}
                  height={Math.abs(sy(b.base) - sy(0))}
                  fill="none"
                  stroke="var(--baseline)"
                  strokeDasharray="3 3"
                  rx={3}
                />
              )}
              <rect
                x={x + pad + 3}
                y={Math.min(sy(b.value), sy(0))}
                width={Math.max(bw - pad * 2 - 6, 2)}
                height={Math.max(Math.abs(sy(b.value) - sy(0)), 1)}
                fill={color}
                opacity={hover === null || hover === i ? 0.9 : 0.5}
                rx={3}
              />
              {(bars.length <= 12 || i % 2 === 0) && (
                <text
                  x={x + bw / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="axis"
                  fontSize={11}
                  fill="var(--faint)"
                >
                  {bw < 40 ? `’${String(b.year).slice(2)}` : b.year}
                </text>
              )}
            </g>
          );
        })}
        <line x1={M.left} x2={M.left + iw} y1={sy(0)} y2={sy(0)} stroke="var(--faint)" />
      </svg>
      {hover !== null && (
        <Tooltip x={M.left + (hover + 0.5) * bw} width={width}>
          <b>{bars[hover].year}</b>
          <div>
            Sinun valintasi: <b>{format(bars[hover].value)}</b>
          </div>
          {bars[hover].base !== undefined && <div>Ilman muutoksia: {format(bars[hover].base!)}</div>}
        </Tooltip>
      )}
    </div>
  );
}
