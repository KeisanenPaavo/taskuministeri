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
import { money, mrd, num, pct, perDay, type Unit } from "../format";
import { BarChart, LineChart } from "./charts";
import { verdict } from "../verdict";

interface Props {
  data: FinanceData;
  unit: Unit;
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
    name: "Korot nousevat",
    desc: "Uuden velan korko nousee 5 prosenttiin.",
    apply: { interestRate: 5 },
  },
  {
    id: "slow",
    name: "Heikko kasvu",
    desc: "Talous kasvaa vain 0,3 % vuodessa.",
    apply: { realGrowth: 0.3 },
  },
  {
    id: "boom",
    name: "Kasvuloikka",
    desc: "Talous kasvaa 2,5 % vuodessa.",
    apply: { realGrowth: 2.5 },
  },
  {
    id: "package",
    name: "Sopeutuspaketti",
    desc: "ALV +1 %-yks., valtion tuloveroasteikko +0,5 %-yks. ja menoleikkauksia hallintoon, elinkeinotukiin ja sosiaaliturvaan.",
    apply: {
      vatPp: 1,
      incomeTaxPp: 0.5,
      spending: { admin: -10, economy: -10, otherSocial: -10, unemployment: -10, family: -5 },
    },
  },
];

type GroupId = "economy" | "taxes" | "spending" | "assumptions";
const GROUPS: { id: GroupId; name: string }[] = [
  { id: "economy", name: "Talous" },
  { id: "taxes", name: "Verot" },
  { id: "spending", name: "Menot" },
  { id: "assumptions", name: "Oletukset" },
];

const MAIN_SPENDING = ["pensions", "health", "education", "defence", "unemployment", "family"];

export default function Simulator({ data, unit, scenario: s, setScenario }: Props) {
  const [allSpending, setAllSpending] = useState(false);
  const [tab, setTab] = useState<GroupId>("economy");
  const [hints, setHints] = useState(false);
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
  // Kuinka paljon +0,5 %-yks. nopeampi kasvu muuttaisi velkasuhdetta viimeisenä vuonna.
  const growthLesson = useMemo(() => {
    const faster = project(data, { ...s, realGrowth: s.realGrowth + 0.5 });
    return result[result.length - 1].debtRatio - faster[faster.length - 1].debtRatio;
  }, [data, s, result]);
  // Tavoite: velkasuhde ei nouse nykyisestä. Kuinka paljon pysyviä säästöjä tai lisätuloja (milj. € perusvuoden
  // tasolla) se vaatisi oletusoletuksilla? Haetaan puolitushaulla mallin yleisellä menomuutoksella.
  const target = data.debtRatio;
  const needed = useMemo(() => {
    const base = { ...DEFAULT_SCENARIO, spendingTrend: s.spendingTrend, behavioral: s.behavioral };
    const ratioWith = (saving: number) => {
      const r = project(data, { ...base, extraSpending: -saving });
      return r[r.length - 1].debtRatio;
    };
    let lo = 0;
    let hi = 100_000;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (ratioWith(mid) <= target) hi = mid;
      else lo = mid;
    }
    return hi;
  }, [data, target, s.spendingTrend, s.behavioral]);
  // Jakaminen: tulos tekstinä ja linkki skenaarioon. Mobiilissa käytetään laitteen jakovalikkoa.
  const [copied, setCopied] = useState(false);
  const changed =
    JSON.stringify(normalize(s)) !==
    JSON.stringify(normalize({ ...DEFAULT_SCENARIO, spendingTrend: s.spendingTrend, behavioral: s.behavioral }));
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
  const fmt = (v: number, signed = false) => money(v, data.population, unit, signed);
  // Muutoksen vaikutus vuodessa (perusvuoden tasolla)
  const fmtEffect = (v: number) => money(v, data.population, unit, true);

  const history = data.history.filter((h) => h.year >= 2000);
  const anchor = { year: data.baseYear, value: data.debtRatio };
  const diff = last.debtRatio - lastBase.debtRatio;
  const gap = lastBase.debtRatio - target;
  const progress = gap > 0 ? (lastBase.debtRatio - last.debtRatio) / gap : 1;
  const reached = last.debtRatio <= target + 0.05;
  const shareHeadline = reached
    ? `Pysäytit velan kasvun: velka ${last.year} on ${pct(last.debtRatio, 0)} BKT:stä.`
    : progress < 0
      ? `Velka ${last.year}: ${pct(last.debtRatio, 0)} BKT:stä. Uskallatko jakaa?`
      : `Pääsit ${num(Math.max(0, progress) * 100, 0)} % tavoitteesta: velka ${last.year} on ${pct(last.debtRatio, 0)}.`;
  const shareScenario = async () => {
    const text =
      `Olen ${told.title}. ` +
      (reached
        ? `Pysäytin Suomen velan kasvun Taskuministerissä: velka ${last.year} ${pct(last.debtRatio, 0)} BKT:stä (ilman muutoksia ${pct(lastBase.debtRatio, 0)}). Pystytkö parempaan?`
        : `Taskuministerissä pääsin ${num(Math.max(0, progress) * 100, 0)} % tavoitteesta: velka ${last.year} ${pct(last.debtRatio, 0)} BKT:stä. Pystytkö parempaan?`);
    const url = location.href;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Taskuministeri", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* jako peruttiin tai leikepöytä ei käytettävissä */
    }
  };

  const perYear = unit === "total" ? " vuodessa" : "";
  const D = DEFAULT_SCENARIO;
  const changedCount: Record<GroupId, number> = {
    economy: [s.realGrowth !== D.realGrowth, s.interestRate !== D.interestRate, s.inflation !== D.inflation].filter(
      Boolean,
    ).length,
    taxes: [s.incomeTaxPp, s.vatPp, s.corporateTaxPp, s.excisePct].filter((v) => v !== 0).length,
    spending: Object.values(s.spending).filter((v) => v !== 0).length,
    assumptions: [s.spendingTrend !== D.spendingTrend, s.behavioral !== D.behavioral].filter(Boolean).length,
  };
  const resetGroup = (g: GroupId) => {
    if (g === "economy") update({ realGrowth: D.realGrowth, interestRate: D.interestRate, inflation: D.inflation });
    if (g === "taxes") update({ incomeTaxPp: 0, vatPp: 0, corporateTaxPp: 0, excisePct: 0 });
    if (g === "spending") update({ spending: {} });
    if (g === "assumptions") update({ spendingTrend: D.spendingTrend, behavioral: D.behavioral });
  };
  const lead = {
    economy: `Asiat, joihin päättäjät eivät suoraan pysty vaikuttamaan. Esimerkiksi +0,5 %-yks. nopeampi kasvu pienentäisi velkaa vuonna ${last.year} noin ${num(growthLesson, 0)} %-yks.`,
    taxes: "Veronkorotus parantaa taloutta (vihreä), kevennys heikentää (punainen).",
    spending:
      "Muutos prosentteina menoluokan nykytasosta. Leikkaus parantaa taloutta (vihreä), lisäys heikentää (punainen).",
    assumptions: "Mallin taustaoletukset. Niitä ei yleensä tarvitse muuttaa.",
  }[tab];

  const allSpendCount = data.expenditure.filter((e) => e.id !== "interest").length;
  const spendList = data.expenditure
    .filter((e) => e.id !== "interest")
    .sort((a, b) => b.value - a.value)
    .filter((e) => allSpending || MAIN_SPENDING.includes(e.id) || (s.spending[e.id] ?? 0) !== 0);

  const effects = [
    { label: "Valtion tulovero", v: tax.incomeTax, kind: "tax" as const },
    { label: "Arvonlisävero", v: tax.vat, kind: "tax" as const },
    { label: "Yhteisövero", v: tax.corporateTax, kind: "tax" as const },
    { label: "Valmisteverot", v: tax.excise, kind: "tax" as const },
    ...data.expenditure.map((e) => ({ label: e.name, v: -spend[e.id], kind: "spend" as const })),
  ].filter((e) => Math.abs(e.v) > 0.5);
  const totalEffect = effects.reduce((a, e) => a + e.v, 0);
  const told = verdict({
    effects,
    growthDelta: s.realGrowth - DEFAULT_SCENARIO.realGrowth,
    interestDelta: s.interestRate - DEFAULT_SCENARIO.interestRate,
    population: data.population,
    year: last.year,
    debt: last.debtRatio,
    baseDebt: lastBase.debtRatio,
    target,
    progress,
    growthLesson,
  });

  return (
    <>
      <div className={`goal ${reached ? "done" : progress < 0 ? "worse" : ""}`}>
        <p className="step">Tehtäväsi</p>
        <h3>Pysäytä velan kasvu</h3>
        <p className="goal-text">
          Ilman muutoksia velka nousee {pct(data.debtRatio, 0)}:sta <b>{pct(lastBase.debtRatio, 0)}:iin</b> BKT:stä
          vuoteen {last.year} mennessä. Jotta se pysyisi nykytasolla, tarvitaan noin{" "}
          <b>
            {mrd(needed)} ({perDay(needed, data.population)} asukasta kohden)
          </b>{" "}
          pysyviä säästöjä tai lisätuloja vuodessa, tai nopeampaa talouskasvua.
        </p>
        <div className="goal-meter" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }} />
        </div>
        <p className="goal-status" aria-live="polite">
          {reached
            ? `✓ Tavoite saavutettu: velka on vuonna ${last.year} ${pct(last.debtRatio, 0)} BKT:stä.`
            : progress < 0
              ? `✗ Valintasi kasvattavat velkaa: ${pct(last.debtRatio, 0)} BKT:stä vuonna ${last.year}.`
              : `${num(Math.max(0, progress) * 100, 0)} % tavoitteesta · velka ${last.year}: ${pct(last.debtRatio, 0)} BKT:stä`}
        </p>
      </div>

      <p className="step">1 · Valitse lähtötilanne (valinnainen)</p>
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
          <p className="step">2 · Tee päätökset</p>
          <div className="panel">
            <div className="panel-tabs" role="tablist" aria-label="Säätimet">
              {GROUPS.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={tab === g.id}
                  className={tab === g.id ? "on" : ""}
                  onClick={() => setTab(g.id)}
                >
                  {g.name}
                  {changedCount[g.id] > 0 && <span className="badge">{changedCount[g.id]}</span>}
                </button>
              ))}
            </div>

            <div className="panel-body" role="tabpanel">
              <div className="panel-head">
                <p className="gl">{lead}</p>
                <div className="panel-actions">
                  <button className="reset" aria-pressed={hints} onClick={() => setHints(!hints)}>
                    {hints ? "Piilota selitykset" : "Näytä selitykset"}
                  </button>
                  {changedCount[tab] > 0 && (
                    <button className="reset" onClick={() => resetGroup(tab)}>
                      ↺ Palauta {GROUPS.find((g) => g.id === tab)!.name.toLowerCase()}
                    </button>
                  )}
                </div>
              </div>

              {tab === "economy" && (
                <div className="panel-sliders">
                  <Slider
                    label="Talouskasvu vuodessa"
                    value={s.realGrowth}
                    min={-1}
                    max={4}
                    step={0.1}
                    base={DEFAULT_SCENARIO.realGrowth}
                    format={(v) => pct(v, 1)}
                    hint="Kasvu tuo lisää verotuloja, mutta menot eivät kasva samaa tahtia."
                    showHint={hints}
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
                    hint={`Korkomenot ${last.year}: ${fmt(last.interest)}${perYear}. Vanha velka siirtyy uuteen korkoon vähitellen.`}
                    showHint={hints}
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
                    showHint={hints}
                    onChange={(v) => update({ inflation: v })}
                  />
                </div>
              )}

              {tab === "taxes" && (
                <div className="panel-sliders">
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
                    showHint={hints}
                    onChange={(v) => update({ incomeTaxPp: v })}
                  />
                  <Slider
                    label="Arvonlisävero"
                    value={s.vatPp}
                    min={-4}
                    max={4}
                    step={0.5}
                    base={0}
                    format={(v) => `${num(VAT_GENERAL_RATE + v, 1)} %`}
                    effect={tax.vat}
                    fmtEffect={fmtEffect}
                    hint={`Yleinen kanta, nyt 25,5 %. 1 %-yks. ≈ ${mrd(perPoint.vat)} (HE 61/2024). Nostaa useimpien tuotteiden hintoja.`}
                    showHint={hints}
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
                    showHint={hints}
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
                    showHint={hints}
                    onChange={(v) => update({ excisePct: v })}
                  />
                </div>
              )}

              {tab === "spending" && (
                <div className="panel-sliders">
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
                      hint={`Nyt ${fmt(e.value)}${perYear}.`}
                      showHint={hints}
                      onChange={(v) => setSpend(e.id, v)}
                    />
                  ))}
                  <button className="more" onClick={() => setAllSpending(!allSpending)}>
                    {allSpending ? "Näytä vain suurimmat" : `Näytä kaikki menoluokat (${allSpendCount})`}
                  </button>
                </div>
              )}

              {tab === "assumptions" && (
                <div className="panel-sliders">
                  <Slider
                    label="Menojen luontainen kasvu"
                    value={s.spendingTrend}
                    min={0}
                    max={3}
                    step={0.1}
                    base={DEFAULT_SCENARIO.spendingTrend}
                    format={(v) => `${pct(v, 1)}/v`}
                    hint="Kuinka paljon menot kasvavat hintojen nousun lisäksi esim. väestön ikääntymisen takia."
                    showHint={hints}
                    onChange={(v) => update({ spendingTrend: v })}
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.behavioral}
                      onChange={(e) => update({ behavioral: e.target.checked })}
                    />
                    <span>
                      Huomioi käyttäytymisvaikutukset
                      <small>
                        Esim. korkeampi vero vähentää hieman työntekoa tai kulutusta, joten osa lisätuotosta jää
                        saamatta.
                      </small>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="results">
          <p className="step">3 · Katso tulos</p>
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
              <div className="label">
                {first.balance < 0 ? "Alijäämä" : "Ylijäämä"} {first.year}
              </div>
              <div className="value">{fmt(Math.abs(first.balance))}</div>
              <div className="sub">{pct(first.balanceRatio, 1, true)} BKT:stä</div>
            </div>
            <div className={`card kpi ${last.balance < 0 ? "bad" : "good"}`}>
              <div className="label">
                {last.balance < 0 ? "Alijäämä" : "Ylijäämä"} {last.year}
              </div>
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
              <span>
                <i style={{ borderColor: "var(--text)" }} />
                Toteutunut
              </span>
              <span>
                <i className="dash" style={{ borderColor: "var(--baseline)" }} />
                Ilman muutoksia
              </span>
              <span>
                <i style={{ borderColor: "var(--accent)" }} />
                Sinun valintasi
              </span>
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
              <span>
                <i style={{ borderColor: "var(--deficit)" }} />
                Sinun valintasi
              </span>
              <span>
                <i className="dash" style={{ borderColor: "var(--baseline)" }} />
                Ilman muutoksia
              </span>
            </div>
            <BarChart
              height={190}
              refLine={{ value: -3, label: "EU:n alijäämäraja −3 %" }}
              bars={result.map((r, i) => ({ year: r.year, value: r.balanceRatio, base: baseline[i].balanceRatio }))}
            />
          </div>

          {changed && (
            <div className="verdict" aria-live="polite">
              <p className="step">Taskuministerin päätöstiedote</p>
              <h4>
                Olet <span>{told.title}</span>
              </h4>
              {told.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          )}

          <div className={`share-cta ${changed ? "" : "idle"}`}>
            <div className="share-copy">
              <b>{changed ? shareHeadline : "Löydätkö keinon pysäyttää velan kasvun?"}</b>
              <span>
                {changed
                  ? "Lähetä linkki kaverille: pystyykö hän parempaan?"
                  : "Tee ensin päätöksiä, niin voit jakaa oman ratkaisusi."}
              </span>
            </div>
            <button className="btn primary share-btn" onClick={shareScenario} disabled={!changed}>
              {copied ? "✓ Linkki kopioitu" : "Jaa ratkaisusi →"}
            </button>
          </div>

          {effects.length > 0 && (
            <div className="card breakdown">
              <h4>
                Muutostesi vaikutus{" "}
                {unit === "total" ? "vuodessa" : unit === "year" ? "per asukas vuodessa" : "per asukas päivässä"}{" "}
                (nykyrahassa)
              </h4>
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
          Tavoitteesta
          <b style={{ color: reached ? "var(--good)" : progress < 0 ? "var(--bad)" : undefined }}>
            {reached ? "✓" : `${num(Math.max(0, progress) * 100, 0)} %`}
          </b>
        </div>
      </div>
    </>
  );
}

function normalize(s: Scenario) {
  const spending = Object.fromEntries(
    Object.entries(s.spending)
      .filter(([, v]) => v !== 0)
      .sort(),
  );
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
  showHint?: boolean;
  effect?: number;
  fmtEffect?: (v: number) => string;
  dot?: string;
}

/** Tiivis säädin: nimi, arvo ja vaikutus yhdellä rivillä, liukusäädin alla. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  base,
  format,
  onChange,
  hint,
  showHint,
  effect,
  fmtEffect,
  dot,
}: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  const from = ((base - min) / (max - min)) * 100;
  const changed = Math.abs(value - base) > 1e-9;
  const showEffect = changed && effect !== undefined && fmtEffect && Math.abs(effect) > 0.5;
  return (
    <div className={`slider ${changed ? "changed" : ""}`} title={showHint ? undefined : hint}>
      <div className="row">
        <label>
          {dot && <span className="dot" style={{ background: dot }} />}
          {label}
        </label>
        {showEffect && <span className={`effect ${effect > 0 ? "good" : "bad"}`}>{fmtEffect(effect)}</span>}
        <span className="val">{format(value)}</span>
        {changed && (
          <button className="undo" onClick={() => onChange(base)} aria-label={`Palauta ${label}`} title="Palauta">
            ↺
          </button>
        )}
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
      {showHint && hint && <p className="slider-hint">{hint}</p>}
    </div>
  );
}
