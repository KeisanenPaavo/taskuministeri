import { useEffect, useMemo, useRef, useState } from "react";
import type { FinanceData } from "../types";
import {
  CORPORATE_RATE,
  DEFAULT_SCENARIO,
  VAT_GENERAL_RATE,
  perPointStatic,
  project,
  spendingEffects,
  taxEffects,
  type Scenario,
} from "../model";
import { EXPENDITURE_COLORS } from "../colors";
import { money, mrd, num, pct } from "../format";
import { BarChart, LineChart } from "./charts";

interface Props {
  data: FinanceData;
  perPerson: boolean;
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
}

interface Preset {
  id: string;
  name: string;
  desc: string;
  apply: Partial<Scenario>;
}

const PRESETS: Preset[] = [
  { id: "none", name: "Ei muutoksia", desc: "Verot ja menot pysyvät ennallaan.", apply: {} },
  {
    id: "rates",
    name: "📈 Korot nousevat",
    desc: "Uuden velan korko nousee 5 prosenttiin.",
    apply: { interestRate: 5 },
  },
  {
    id: "slow",
    name: "🐌 Heikko kasvu",
    desc: "Talous kasvaa vain 0,3 % vuodessa.",
    apply: { realGrowth: 0.3 },
  },
  {
    id: "boom",
    name: "🚀 Kasvuloikka",
    desc: "Talous kasvaa 2,5 % vuodessa.",
    apply: { realGrowth: 2.5 },
  },
  {
    id: "package",
    name: "✂️ Sopeutuspaketti",
    desc: "ALV +1 %-yks., valtion tuloveroasteikko +0,5 %-yks. ja menoleikkauksia hallintoon, elinkeinotukiin ja sosiaaliturvaan.",
    apply: {
      vatPp: 1,
      incomeTaxPp: 0.5,
      spending: { admin: -10, economy: -10, otherSocial: -10, unemployment: -10, family: -5 },
    },
  },
];

const MAIN_SPENDING = ["pensions", "health", "education", "defence", "unemployment", "family"];

export default function Simulator({ data, perPerson, scenario: s, setScenario }: Props) {
  const [allSpending, setAllSpending] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  // Mobiilin alapalkki näytetään vain, kun simulaattori on näkyvissä.
  const simRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!simRef.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(simRef.current);
    return () => io.disconnect();
  }, []);

  const baseline = useMemo(
    () => project(data, { ...DEFAULT_SCENARIO, spendingTrend: s.spendingTrend, behavioral: s.behavioral }),
    [data, s.spendingTrend, s.behavioral],
  );
  const result = useMemo(() => project(data, s), [data, s]);
  const tax = taxEffects(data, s);
  const spend = spendingEffects(data, s);
  const perPoint = perPointStatic(data);

  const update = (patch: Partial<Scenario>) => setScenario({ ...s, ...patch });
  const setSpend = (id: string, v: number) => update({ spending: { ...s.spending, [id]: v } });

  const activePreset = PRESETS.find((p) => {
    const target = { ...DEFAULT_SCENARIO, ...p.apply, spendingTrend: s.spendingTrend, behavioral: s.behavioral };
    return JSON.stringify(normalize(target)) === JSON.stringify(normalize(s));
  });

  const last = result[result.length - 1];
  const lastBase = baseline[baseline.length - 1];
  const first = result[0];
  const fmt = (v: number, signed = false) => money(v, data.population, perPerson, signed);
  // Muutoksen vaikutus vuodessa (perusvuoden tasolla)
  const fmtEffect = (v: number) => money(v, data.population, perPerson, true);

  const history = data.history.filter((h) => h.year >= 2000);
  const anchor = { year: data.baseYear, value: data.debtRatio };
  const diff = last.debtRatio - lastBase.debtRatio;

  const spendList = data.expenditure
    .filter((e) => e.id !== "interest")
    .sort((a, b) => b.value - a.value)
    .filter((e) => allSpending || MAIN_SPENDING.includes(e.id) || (s.spending[e.id] ?? 0) !== 0);

  const effects = [
    { label: "Valtion tulovero", v: tax.incomeTax },
    { label: "Arvonlisävero", v: tax.vat },
    { label: "Yhteisövero", v: tax.corporateTax },
    { label: "Valmisteverot", v: tax.excise },
    ...data.expenditure.map((e) => ({ label: e.name, v: -spend[e.id] })),
  ].filter((e) => Math.abs(e.v) > 0.5);
  const totalEffect = effects.reduce((a, e) => a + e.v, 0);

  return (
    <>
      <div className="presets" style={{ marginBottom: 16 }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip ${activePreset?.id === p.id ? "on" : ""}`}
            title={p.desc}
            onClick={() =>
              setScenario({ ...DEFAULT_SCENARIO, ...p.apply, spendingTrend: s.spendingTrend, behavioral: s.behavioral })
            }
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="sim" ref={simRef}>
        <div className="controls">
          <div className="card group">
            <h3>🌍 Talous</h3>
            <p className="gl">Asiat, joihin päättäjät eivät suoraan pysty vaikuttamaan.</p>
            <Slider
              label="Talouskasvu vuodessa"
              value={s.realGrowth}
              min={-1}
              max={4}
              step={0.1}
              base={DEFAULT_SCENARIO.realGrowth}
              format={(v) => pct(v, 1)}
              hint="Kun talous kasvaa, verotuloja kertyy enemmän."
              onChange={(v) => update({ realGrowth: v })}
            />
            <Slider
              label="Korko uudelle velalle"
              value={s.interestRate}
              min={0}
              max={7}
              step={0.1}
              base={DEFAULT_SCENARIO.interestRate}
              format={(v) => pct(v, 1)}
              hint={`Korkomenot ${last.year}: ${fmt(last.interest)} vuodessa`}
              onChange={(v) => update({ interestRate: v })}
            />
            <Slider
              label="Inflaatio"
              value={s.inflation}
              min={0}
              max={6}
              step={0.1}
              base={DEFAULT_SCENARIO.inflation}
              format={(v) => pct(v, 1)}
              hint="Hintojen nousu kasvattaa sekä tuloja että menoja."
              onChange={(v) => update({ inflation: v })}
            />
          </div>

          <div className="card group">
            <h3>🧾 Verot</h3>
            <p className="gl">Veronkorotus parantaa taloutta (vihreä), kevennys heikentää (punainen).</p>
            <Slider
              label="Valtion tuloveroasteikko"
              value={s.incomeTaxPp}
              min={-3}
              max={3}
              step={0.5}
              base={0}
              format={(v) => `${num(v, 1, true)} %-yks.`}
              effect={tax.incomeTax}
              fmtEffect={fmtEffect}
              hint={`Muutos jokaiseen veroasteikon portaaseen. Pienituloisimmat eivät maksa valtion tuloveroa. 1 %-yks. ≈ ${mrd(perPoint.incomeTax)} (VM).`}
              onChange={(v) => update({ incomeTaxPp: v })}
            />
            <Slider
              label="Arvonlisävero (yleinen kanta)"
              value={s.vatPp}
              min={-4}
              max={4}
              step={0.5}
              base={0}
              format={(v) => `${num(VAT_GENERAL_RATE + v, 1)} %`}
              effect={tax.vat}
              fmtEffect={fmtEffect}
              hint={`Nyt 25,5 %. 1 %-yks. ≈ ${mrd(perPoint.vat)} (HE 61/2024). Nostaa useimpien tuotteiden hintoja.`}
              onChange={(v) => update({ vatPp: v })}
            />
            <Slider
              label="Yhteisövero"
              value={s.corporateTaxPp}
              min={-5}
              max={5}
              step={1}
              base={0}
              format={(v) => `${num(CORPORATE_RATE + v, 0)} %`}
              effect={tax.corporateTax}
              fmtEffect={fmtEffect}
              hint={`Nyt 20 %. 1 %-yks. ≈ ${mrd(perPoint.corporateTax)} ennen dynaamisia vaikutuksia.`}
              onChange={(v) => update({ corporateTaxPp: v })}
            />
            <Slider
              label="Valmisteverot"
              value={s.excisePct}
              min={-30}
              max={30}
              step={5}
              base={0}
              format={(v) => pct(v, 0, true)}
              effect={tax.excise}
              fmtEffect={fmtEffect}
              hint="Polttoaineet, sähkö, alkoholi, tupakka, makeat juomat."
              onChange={(v) => update({ excisePct: v })}
            />
          </div>

          <div className="card group">
            <h3>🏥 Menot</h3>
            <p className="gl">Leikkaus parantaa taloutta (vihreä), lisäys heikentää (punainen).</p>
            {spendList.map((e) => (
              <Slider
                key={e.id}
                label={e.name}
                dot={EXPENDITURE_COLORS[e.id]}
                value={s.spending[e.id] ?? 0}
                min={-25}
                max={25}
                step={1}
                base={0}
                format={(v) => pct(v, 0, true)}
                effect={-spend[e.id]}
                fmtEffect={fmtEffect}
                hint={`Nyt ${fmt(e.value)} vuodessa`}
                onChange={(v) => setSpend(e.id, v)}
              />
            ))}
            <button className="more" onClick={() => setAllSpending(!allSpending)}>
              {allSpending ? "Näytä vähemmän" : "Näytä kaikki menoluokat"}
            </button>
          </div>

          <div className="card group">
            <h3>
              ⚙️ Oletukset
              <button className="reset" onClick={() => setAdvanced(!advanced)} style={{ marginLeft: "auto" }}>
                {advanced ? "Piilota" : "Näytä"}
              </button>
            </h3>
            <p className="gl">Mallin taustaoletukset, joita voit muuttaa.</p>
            {advanced && (
              <>
                <Slider
                  label="Menojen luontainen kasvu"
                  value={s.spendingTrend}
                  min={0}
                  max={3}
                  step={0.1}
                  base={DEFAULT_SCENARIO.spendingTrend}
                  format={(v) => `${pct(v, 1)}/v`}
                  hint="Kuinka paljon menot kasvavat hintojen nousun lisäksi esim. väestön ikääntymisen takia."
                  onChange={(v) => update({ spendingTrend: v })}
                />
                <label style={{ display: "flex", gap: 8, fontSize: 14, padding: "8px 0 12px", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={s.behavioral}
                    onChange={(e) => update({ behavioral: e.target.checked })}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    Huomioi käyttäytymisvaikutukset
                    <br />
                    <span className="gl" style={{ fontSize: 12, color: "var(--muted)" }}>
                      Esim. korkeampi vero vähentää hieman työntekoa tai kulutusta, joten osa
                      lisätuotosta jää saamatta.
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="results">
          <div className="card headline">
            <div className="big">
              Vuonna {last.year} julkinen velka olisi <b>{pct(last.debtRatio, 0)}</b> bruttokansantuotteesta.
            </div>
            <div className="muted">
              {Math.abs(diff) < 0.5
                ? `Nyt ${pct(data.debtRatio, 0)}. Jos mitään ei muuteta, velkasuhde jatkaa kasvuaan.`
                : `Ilman muutoksia ${pct(lastBase.debtRatio, 0)}, eli valintasi ${
                    diff < 0 ? "pienentävät" : "kasvattavat"
                  } velkasuhdetta ${num(Math.abs(diff), 0)} prosenttiyksikköä.`}
            </div>
          </div>

          <div className="mini-kpis">
            <div className={`card kpi ${first.balance < 0 ? "bad" : "good"}`}>
              <div className="label">{first.balance < 0 ? "Alijäämä" : "Ylijäämä"} {first.year}</div>
              <div className="value">{fmt(Math.abs(first.balance))}</div>
              <div className="sub">{pct(first.balanceRatio, 1, true)} BKT:stä</div>
            </div>
            <div className={`card kpi ${last.balance < 0 ? "bad" : "good"}`}>
              <div className="label">{last.balance < 0 ? "Alijäämä" : "Ylijäämä"} {last.year}</div>
              <div className="value">{fmt(Math.abs(last.balance))}</div>
              <div className="sub">{pct(last.balanceRatio, 1, true)} BKT:stä</div>
            </div>
            <div className="card kpi">
              <div className="label">Korkomenot {last.year}</div>
              <div className="value">{fmt(last.interest)}</div>
              <div className="sub">{pct((last.interest / last.revenue) * 100, 1)} kaikista tuloista</div>
            </div>
          </div>

          <div className="card chart-card">
            <h4>Julkinen velka suhteessa BKT:hen</h4>
            <div className="legend">
              <span><i style={{ borderColor: "var(--text)" }} />Toteutunut</span>
              <span><i className="dash" style={{ borderColor: "var(--baseline)" }} />Ilman muutoksia</span>
              <span><i style={{ borderColor: "var(--accent)" }} />Sinun valintasi</span>
            </div>
            <LineChart
              height={250}
              splitYear={data.baseYear}
              refLine={{ value: 60, label: "EU:n viitearvo 60 %" }}
              minY={0}
              series={[
                {
                  label: "Toteutunut",
                  color: "var(--text)",
                  points: history.map((h) => ({ year: h.year, value: h.debtRatio })),
                },
                {
                  label: "Ilman muutoksia",
                  color: "var(--baseline)",
                  dashed: true,
                  width: 2,
                  points: [anchor, ...baseline.map((r) => ({ year: r.year, value: r.debtRatio }))],
                },
                {
                  label: "Sinun valintasi",
                  color: "var(--accent)",
                  width: 3.5,
                  points: [anchor, ...result.map((r) => ({ year: r.year, value: r.debtRatio }))],
                },
              ]}
            />
          </div>

          <div className="card chart-card">
            <h4>Vuosittainen yli-/alijäämä suhteessa BKT:hen</h4>
            <div className="legend">
              <span><i style={{ borderColor: "var(--deficit)" }} />Sinun valintasi</span>
              <span><i className="dash" style={{ borderColor: "var(--baseline)" }} />Ilman muutoksia</span>
            </div>
            <BarChart
              height={190}
              refLine={{ value: -3, label: "EU:n alijäämäraja −3 %" }}
              bars={result.map((r, i) => ({ year: r.year, value: r.balanceRatio, base: baseline[i].balanceRatio }))}
            />
          </div>

          {effects.length > 0 && (
            <div className="card breakdown">
              <h4>Muutostesi vaikutus vuodessa (nykyrahassa)</h4>
              <ul>
                {effects.map((e) => (
                  <li key={e.label}>
                    <span>{e.label}</span>
                    <span className={`effect ${e.v > 0 ? "good" : "bad"}`}>{fmtEffect(e.v)}</span>
                  </li>
                ))}
                <li className="total">
                  <span>Yhteensä</span>
                  <span className={`effect ${totalEffect > 0 ? "good" : "bad"}`}>{fmtEffect(totalEffect)}</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className={`mobile-bar ${inView ? "" : "hidden"}`}>
        <div>
          Velka {last.year}
          <b>{pct(last.debtRatio, 0)}</b>
        </div>
        <div>
          Saldo {first.year}
          <b style={{ color: first.balance < 0 ? "var(--bad)" : "var(--good)" }}>{pct(first.balanceRatio, 1, true)}</b>
        </div>
        <div>
          Muutokset
          <b style={{ color: totalEffect >= 0 ? "var(--good)" : "var(--bad)" }}>{mrd(totalEffect, true)}</b>
        </div>
      </div>
    </>
  );
}

function normalize(s: Scenario) {
  const spending = Object.fromEntries(Object.entries(s.spending).filter(([, v]) => v !== 0).sort());
  return { ...s, spending };
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  base: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
  effect?: number;
  fmtEffect?: (v: number) => string;
  dot?: string;
}

function Slider({ label, value, min, max, step, base, format, onChange, hint, effect, fmtEffect, dot }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  const from = ((base - min) / (max - min)) * 100;
  const changed = Math.abs(value - base) > 1e-9;
  return (
    <div className="slider">
      <div className="row">
        <label>
          {dot && <span className="dot" style={{ background: dot }} />}
          {label}
        </label>
        <span className="val">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(base)}
        style={{ ["--fill" as string]: `${fill}%`, ["--from" as string]: `${from}%` }}
      />
      <div className="meta">
        <span>{hint}</span>
        {changed && effect !== undefined && fmtEffect && Math.abs(effect) > 0.5 ? (
          <span className={`effect ${effect > 0 ? "good" : "bad"}`}>{fmtEffect(effect)}/v</span>
        ) : changed ? (
          <button className="reset" onClick={() => onChange(base)}>
            ↺ palauta
          </button>
        ) : null}
      </div>
    </div>
  );
}
