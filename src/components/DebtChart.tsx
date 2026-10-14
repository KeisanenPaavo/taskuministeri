import { useState } from "react";
import type { FinanceData } from "../types";
import { num } from "../format";
import { LineChart } from "./charts";

// Velka-luvun avauskaavio: julkinen velka vuosittain, miljardeina tai suhteessa BKT:hen.

type Mode = "mrd" | "pct";

export default function DebtChart({ data }: { data: FinanceData }) {
  const [mode, setMode] = useState<Mode>("mrd");
  const h = data.history;
  const first = h[0];
  const last = h[h.length - 1];
  const pct = mode === "pct";

  return (
    <div className="card chart-card debt-chart">
      <div className="debt-chart-head">
        <h4>
          Julkinen velka {first.year}–{last.year}
          {pct ? ", % BKT:stä" : ", miljardia euroa"}
        </h4>
        <div className="toggle" role="group" aria-label="Velan yksikkö">
          <button className={!pct ? "on" : ""} aria-pressed={!pct} onClick={() => setMode("mrd")}>
            Miljardeina
          </button>
          <button className={pct ? "on" : ""} aria-pressed={pct} onClick={() => setMode("pct")}>
            % BKT:stä
          </button>
        </div>
      </div>
      <LineChart
        height={260}
        minY={0}
        unit={pct ? "%" : "mrd €"}
        refLine={pct ? { value: 60, label: "EU:n viitearvo 60 %" } : undefined}
        desc={
          pct
            ? `Julkinen velka nousi ${num(first.debtRatio, 0)} %:sta ${num(last.debtRatio, 0)} %:iin bruttokansantuotteesta vuosina ${first.year}–${last.year}. EU:n viitearvo on 60 %.`
            : `Julkinen velka kasvoi ${num(first.debt / 1000, 0)} miljardista ${num(last.debt / 1000, 0)} miljardiin euroon vuosina ${first.year}–${last.year}.`
        }
        series={[
          {
            label: "Julkinen velka",
            color: "var(--deficit)",
            width: 3.5,
            points: h.map((p) => ({ year: p.year, value: pct ? p.debtRatio : p.debt / 1000 })),
          },
        ]}
      />
      <p className="compare-hint">
        {pct
          ? `Velka suhteessa BKT:hen kertoo, kuinka raskas velka on talouden kokoon nähden: ${num(first.debtRatio, 0)} % vuonna ${first.year}, ${num(last.debtRatio, 0)} % vuonna ${last.year}.`
          : `Velka on kasvanut ${num(first.debt / 1000, 0)} miljardista ${num(last.debt / 1000, 0)} miljardiin euroon. Euromäärät ovat käyvin hinnoin, joten kasvuun sisältyy myös inflaatio.`}
      </p>
    </div>
  );
}
