import { useState } from "react";
import type { FinanceData, Item } from "../types";
import { EXPENDITURE_COLORS, REVENUE_COLORS, textOn } from "../colors";
import { money, pct, perCapita } from "../format";

interface Props {
  data: FinanceData;
  perPerson: boolean;
}

type Selected = { kind: "revenue" | "expenditure" | "deficit"; item: Item };

const STACK_HEIGHT = 620;

export default function BudgetColumns({ data, perPerson }: Props) {
  const [sel, setSel] = useState<Selected | null>(null);
  const max = Math.max(data.revenueTotal, data.expenditureTotal);
  const deficit = data.expenditureTotal - data.revenueTotal;
  const fmt = (v: number) => money(v, data.population, perPerson);

  const deficitItem: Item = {
    id: "deficit",
    name: "Otettu velaksi",
    value: deficit,
    desc: "Menot olivat tuloja suuremmat. Erotus katettiin ottamalla lisää velkaa, jonka korot maksetaan tulevina vuosina.",
  };

  const segment = (kind: Selected["kind"], item: Item, color?: string) => {
    const h = (item.value / max) * STACK_HEIGHT;
    const size = h < 12 ? "tiny" : h < 24 ? "small" : "";
    const isSel = sel?.item.id === item.id;
    return (
      <button
        key={item.id}
        className={`seg ${size} ${isSel ? "sel" : ""} ${kind === "deficit" ? "deficit" : ""}`}
        style={{
          flex: `${item.value} 1 0px`,
          background: color,
          color: color ? textOn(color) : undefined,
        }}
        title={`${item.name}: ${fmt(item.value)}`}
        onClick={() => setSel(isSel ? null : { kind, item })}
        aria-pressed={isSel}
      >
        <span className="n">{item.name}</span>
        <span className="v">{fmt(item.value)}</span>
      </button>
    );
  };

  const revenueItems = [...data.revenue].reverse();
  const expItems = [...data.expenditure].sort((a, b) => a.value - b.value);

  return (
    <div className="card budget">
      <div>
        <div className="col-head">
          Tulot <span>{fmt(data.revenueTotal)}</span>
        </div>
        <div className={`stack ${sel ? "has-sel" : ""}`} style={{ height: STACK_HEIGHT }}>
          {max > data.revenueTotal + Math.max(deficit, 0) && (
            <div style={{ flex: `${max - data.revenueTotal - Math.max(deficit, 0)} 1 0px` }} />
          )}
          {deficit > 0 && segment("deficit", deficitItem)}
          {revenueItems.map((r) => segment("revenue", r, REVENUE_COLORS[r.id]))}
        </div>
      </div>
      <div>
        <div className="col-head">
          Menot <span>{fmt(data.expenditureTotal)}</span>
        </div>
        <div className={`stack ${sel ? "has-sel" : ""}`} style={{ height: STACK_HEIGHT }}>
          {max > data.expenditureTotal && <div style={{ flex: `${max - data.expenditureTotal} 1 0px` }} />}
          {expItems.map((e) => segment("expenditure", e, EXPENDITURE_COLORS[e.id]))}
        </div>
      </div>
      <Detail data={data} sel={sel} perPerson={perPerson} />
    </div>
  );
}

function Detail({
  data,
  sel,
  perPerson,
}: {
  data: FinanceData;
  sel: Selected | null;
  perPerson: boolean;
}) {
  const perDay = (v: number) => perCapita(v / 365, data.population);
  if (!sel) {
    const deficit = data.expenditureTotal - data.revenueTotal;
    return (
      <div className="detail">
        <div className="hint">
          👆 Klikkaa mitä tahansa palaa nähdäksesi, mitä se sisältää.
        </div>
        <div>
          <div className="muted">Jokaista suomalaista kohden vuodessa</div>
          <div className="everyday" style={{ marginTop: 8 }}>
            <div>
              <b>{perCapita(data.revenueTotal, data.population)}</b>
              <span>tuloja</span>
            </div>
            <div>
              <b>{perCapita(data.expenditureTotal, data.population)}</b>
              <span>menoja</span>
            </div>
            <div>
              <b style={{ color: "var(--bad)" }}>{perCapita(deficit, data.population)}</b>
              <span>uutta velkaa</span>
            </div>
            <div>
              <b>{perDay(data.expenditureTotal)}</b>
              <span>menoja päivässä</span>
            </div>
          </div>
        </div>
        <p className="muted">
          Luvut kattavat koko julkisen talouden: valtion, kunnat, hyvinvointialueet, Kelan ja
          työeläkelaitokset. Vuoden {data.baseYear} luvut ovat ennakkotietoja.
        </p>
      </div>
    );
  }

  const { kind, item } = sel;
  const total = kind === "revenue" ? data.revenueTotal : data.expenditureTotal;
  const share = (item.value / total) * 100;
  const color =
    kind === "revenue"
      ? REVENUE_COLORS[item.id]
      : kind === "expenditure"
        ? EXPENDITURE_COLORS[item.id]
        : "var(--deficit)";
  const kindLabel = kind === "revenue" ? "tuloista" : "menoista";

  return (
    <div className="detail">
      <div>
        <div className="muted">
          <span className="dot" style={{ background: color }} />
          {kind === "revenue" ? "Tulo" : kind === "expenditure" ? "Meno" : "Alijäämä"}
        </div>
        <h3>{item.name}</h3>
      </div>
      <div>
        <div className="big">{money(item.value, data.population, perPerson)}</div>
        <div className="muted">
          {perPerson
            ? `${money(item.value, data.population, false)} yhteensä`
            : `${perCapita(item.value, data.population)} jokaista suomalaista kohden`}
        </div>
      </div>
      {kind !== "deficit" ? (
        <div>
          <div className="muted" style={{ marginBottom: 6 }}>
            {pct(share)} kaikista {kindLabel}
          </div>
          <div className="share-bar">
            <div style={{ width: `${share}%`, background: color }} />
          </div>
        </div>
      ) : (
        <div className="muted">{pct((item.value / data.gdp) * 100)} bruttokansantuotteesta</div>
      )}
      <p>{item.desc}</p>
      {kind === "expenditure" && item.id !== "interest" && data.cofogYear !== data.baseYear && (
        <p className="muted">
          Menojen jakauma perustuu vuoden {data.cofogYear} tietoihin, skaalattuna vuoden{" "}
          {data.baseYear} kokonaismenoihin.
        </p>
      )}
    </div>
  );
}
