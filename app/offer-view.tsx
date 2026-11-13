"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ANTT_REFERENCE_YEAR, anttKmPerLiterCenti, blendedKmPerLiterCenti, formatKmPerLiter, isPlausibleKmPerLiter, measureConsumption, validateFuelRecords, type ConsumptionGroup, type FuelRecord } from "@/lib/fuel";
import { analyzeOffer, costPerKmFromYear, type Decision, type OfferResult } from "@/lib/offer";
import { buildOfferInput, emptyOfferForm, formatBp, formatBRL, formatLiters, parseKm, parseLiters, parseMoney, type OfferForm } from "@/lib/offer-form";

// Só o que é do caminhão e do jeito de trabalhar fica guardado neste aparelho.
// O que é da oferta (frete, quilômetros, pedágio, duração) começa vazio a cada análise.
const STORAGE_KEY = "rota-financeira:analise-de-frete:v1";
const REMEMBERED_TEXT = ["kplEmpty", "kplLoaded", "kplAvg", "diesel", "vehicleKm", "vehicleKmAll", "fixedDay", "commission", "margin", "arlaPct", "arlaPrice", "moneyCost", "advance", "balanceDays", "axles"] as const;

const ANTT_CALCULATOR = "https://calculadorafrete.antt.gov.br/";
const FUEL_STORAGE_KEY = "rota-financeira:consumo-medido:v1";

type StoredFuel = FuelRecord & { id: string };

function loadFuelRecords(): StoredFuel[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(FUEL_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    const records = saved.filter((item): item is StoredFuel =>
      typeof item === "object" && item !== null && typeof (item as StoredFuel).id === "string",
    );
    return validateFuelRecords(records).length === 0 ? records : [];
  } catch {
    return [];
  }
}

const TONES: Record<Decision, { title: string; box: string; icon: typeof Calculator }> = {
  compensa: { title: "Compensa", box: "border-emerald-300 bg-emerald-50 text-emerald-950", icon: CircleCheck },
  abaixo_da_meta: { title: "Abaixo da sua meta", box: "border-amber-300 bg-amber-50 text-amber-950", icon: TriangleAlert },
  prejuizo: { title: "Dá prejuízo", box: "border-red-300 bg-red-50 text-red-950", icon: CircleX },
  sem_frete: { title: "Informe o frete", box: "border-slate-300 bg-slate-50 text-slate-800", icon: Calculator },
};

function resultText(value: number) {
  return value < 0 ? "text-red-700" : value > 0 ? "text-emerald-800" : "text-slate-700";
}

function subtitle(result: OfferResult, targetBp: number, marginMissing: boolean, tight: boolean) {
  const target = marginMissing ? "" : ` (sua meta: ${formatBp(targetBp)})`;
  switch (result.decision) {
    case "compensa":
      return tight
        ? `Compensa, mas fica apertado se os custos subirem. Margem de ${formatBp(result.marginBp)}${target}.`
        : `Margem de ${formatBp(result.marginBp)}${target}.`;
    case "abaixo_da_meta":
      return `Dá lucro de ${formatBRL(result.resultCents)}, mas a margem é ${formatBp(result.marginBp)} e você quer ${formatBp(targetBp)}.`;
    case "prejuizo":
      return `Nesse valor você perde ${formatBRL(-result.resultCents)}.`;
    default:
      return "Digite o valor do frete, ou a tarifa e o peso, para ver o resultado.";
  }
}

function plainPercent(bp: number) {
  return `${(bp / 100).toString().replace(".", ",")}%`;
}

/** Preço do diesel que o frete aguenta, sempre arredondado para baixo (não prometer folga que não existe). */
function dieselLimit(maxMilli: number, currentMilli: number) {
  const increase = Math.round(((maxMilli - currentMilli) * 100) / currentMilli);
  return `até ${formatBRL(Math.floor(maxMilli / 10))}/L (mais ${increase}%)`;
}

function NumField({ field, label, value, onChange, error, hint, numeric, disabled }: {
  field: string; label: string; value: string; onChange: (value: string) => void;
  error?: string; hint?: string; numeric?: boolean; disabled?: boolean;
}) {
  const id = `offer-${field}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-[#34443e]">{label}</label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        inputMode={numeric ? "numeric" : "decimal"}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={`mt-2 h-12 rounded-xl bg-white text-base ${error ? "border-red-500" : ""}`}
      />
      {error ? <p id={`${id}-note`} className="mt-1 text-sm text-red-700">{error}</p> : hint ? <p id={`${id}-note`} className="mt-1 text-xs text-[#718078]">{hint}</p> : null}
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-[#34443e]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[#0d5c43]" />
      {label}
    </label>
  );
}

function AxlesSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="offer-axles" className="text-sm font-semibold text-[#34443e]">Eixos do conjunto</label>
      <select
        id="offer-axles"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-base"
      >
        {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => <option key={count} value={String(count)}>{count} eixos</option>)}
      </select>
      <p className="mt-1 text-xs text-[#718078]">Conte os eixos do cavalo e da carreta juntos. Cavalo 6x4 com carreta de 3 eixos = 6.</p>
    </div>
  );
}

/** Rendimento de referência da ANTT por eixos: ponto de partida para quem ainda não mediu o seu. */
function AnttReference({ axles, onUse, loadedOnly }: { axles: string; onUse: (kmPerLiterCenti: number) => void; loadedOnly?: boolean }) {
  const reference = anttKmPerLiterCenti(Number(axles));
  return (
    <div className="rounded-xl bg-[#f3f6f4] p-4 text-sm sm:col-span-2">
      {reference === null ? (
        <p>A ANTT não tem referência para {axles} eixos. Informe o consumo do seu caminhão.</p>
      ) : (
        <>
          <p>
            Referência da ANTT para {axles} eixos: <b>{formatKmPerLiter(reference)} km/L</b> (pesquisa de {ANTT_REFERENCE_YEAR}, média de muitos caminhões).
            Isso não é o consumo do seu caminhão: use até você medir o seu.
          </p>
          <button type="button" onClick={() => onUse(reference)} className="mt-2 min-h-11 rounded-lg bg-[#10251f] px-4 text-sm font-bold text-white">
            Usar a referência da ANTT ({formatKmPerLiter(reference)} km/L)
          </button>
          {loadedOnly ? <p className="mt-2 text-xs text-[#718078]">Para o trecho vazio, meça o seu consumo: a ANTT não separa vazio e carregado.</p> : null}
        </>
      )}
    </div>
  );
}

function GroupRow({ label, group, note }: { label: string; group: ConsumptionGroup | null; note?: string }) {
  if (!group) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <span className="font-semibold">{label}</span>
        <span className="block text-xs text-[#718078]">
          {group.cycles} {group.cycles === 1 ? "ciclo" : "ciclos"} · {new Intl.NumberFormat("pt-BR").format(group.km)} km{note ? ` · ${note}` : ""}
        </span>
        {!isPlausibleKmPerLiter(group.kmPerLiterCenti) ? <span className="block text-xs font-semibold text-red-700">Esse rendimento está fora do normal: confira o odômetro e os litros.</span> : null}
      </div>
      <span className="shrink-0 font-black tabular-nums">{formatKmPerLiter(group.kmPerLiterCenti)} km/L</span>
    </div>
  );
}

/** Comentário que só abre se a pessoa clicar, para não poluir a tela de quem já sabe. */
function HelpNote({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={`rounded-xl bg-[#f3f6f4] p-4 text-sm ${className}`}>
      <summary className="min-h-11 cursor-pointer font-bold">{title}</summary>
      <div className="mt-2 space-y-2 text-[#34443e]">{children}</div>
    </details>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Row({ label, detail, value, strong }: { label: string; detail?: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${strong ? "border-t border-black/10 pt-3 font-bold" : ""}`}>
      <div className="min-w-0"><span>{label}</span>{detail ? <span className="block text-xs font-normal text-[#718078]">{detail}</span> : null}</div>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

const LEG_LABELS = ["Vazio até a coleta", "Carregado", "Volta vazio"];

function loadRemembered(): OfferForm {
  const form = emptyOfferForm();
  if (typeof window === "undefined") return form;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    for (const key of REMEMBERED_TEXT) {
      if (typeof saved[key] === "string") form[key] = saved[key] as string;
    }
    if (saved.commissionBase === "gross" || saved.commissionBase === "net") form.commissionBase = saved.commissionBase;
    if (saved.mode === "quick" || saved.mode === "detailed") form.mode = saved.mode;
    if (typeof saved.arlaUse === "boolean") form.arlaUse = saved.arlaUse;
  } catch {
    // armazenamento bloqueado ou conteúdo inválido: começa vazio
  }
  return form;
}

export function OfferView() {
  // Esta tela só abre depois do clique no menu, nunca vem pronta do servidor: ler aqui é seguro.
  const [form, setForm] = useState<OfferForm>(loadRemembered);
  const [fuelRecords, setFuelRecords] = useState<StoredFuel[]>(loadFuelRecords);
  const [fuelOdometer, setFuelOdometer] = useState("");
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelFull, setFuelFull] = useState(true);
  const [fuelState, setFuelState] = useState<"loaded" | "empty">("loaded");
  const [fuelError, setFuelError] = useState<string | null>(null);
  const [fuelUsed, setFuelUsed] = useState<string | null>(null);
  const [yearSpend, setYearSpend] = useState("");
  const [yearKm, setYearKm] = useState("");
  const set = <K extends keyof OfferForm>(key: K) => (value: OfferForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    try {
      const remembered: Record<string, string | boolean> = { commissionBase: form.commissionBase, arlaUse: form.arlaUse, mode: form.mode };
      for (const key of REMEMBERED_TEXT) remembered[key] = form[key];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
    } catch {
      // sem armazenamento: a análise continua funcionando
    }
  }, [form]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FUEL_STORAGE_KEY, JSON.stringify(fuelRecords));
    } catch {
      // sem armazenamento: a medição continua nesta tela
    }
  }, [fuelRecords]);

  const consumption = useMemo(() => (validateFuelRecords(fuelRecords).length === 0 ? measureConsumption(fuelRecords) : null), [fuelRecords]);

  function addFuelRecord() {
    const odometer = parseKm(fuelOdometer);
    const liters = parseLiters(fuelLiters);
    if (odometer.error || liters.error) return setFuelError(odometer.error ?? liters.error);
    if (odometer.value === null || liters.value === null) return setFuelError("Informe o odômetro e os litros.");
    const next = [...fuelRecords, { id: `${Date.now()}-${fuelRecords.length}`, odometerKm: odometer.value, litersMilli: liters.value, full: fuelFull, state: fuelState }];
    const errors = validateFuelRecords(next);
    if (errors.length > 0) return setFuelError(errors[0]);
    setFuelError(null);
    setFuelRecords(next);
    setFuelOdometer("");
    setFuelLiters("");
  }

  function useMeasured() {
    if (!consumption) return;
    const { loaded, empty, overall } = consumption;
    if (form.mode === "detailed") {
      if (loaded) set("kplLoaded")(formatKmPerLiter(loaded.kmPerLiterCenti));
      if (empty) set("kplEmpty")(formatKmPerLiter(empty.kmPerLiterCenti));
      setFuelUsed(
        loaded && empty ? "Preenchi o consumo carregado e o vazio com o que você mediu."
          : loaded ? "Preenchi só o carregado. Para o vazio, ainda falta medir."
          : empty ? "Preenchi só o vazio. Para o carregado, ainda falta medir."
          : "Ainda não há medida só de carregado ou só de vazio.",
      );
      return;
    }
    const kmLoaded = parseKm(form.kmLoaded).value ?? 0;
    const kmEmpty = parseKm(form.kmEmptyTo).value ?? 0;
    const blended = loaded && empty ? blendedKmPerLiterCenti(kmLoaded, loaded.kmPerLiterCenti, kmEmpty, empty.kmPerLiterCenti) : null;
    if (blended !== null) {
      set("kplAvg")(formatKmPerLiter(blended));
      setFuelUsed(`Média desta viagem, com ${kmLoaded} km carregado e ${kmEmpty} km vazio.`);
    } else if (overall) {
      set("kplAvg")(formatKmPerLiter(overall.kmPerLiterCenti));
      setFuelUsed("Média geral das suas medidas. Informe os km carregado e vazio e meça os dois para uma média mais certa para esta viagem.");
    }
  }

  const built = useMemo(() => buildOfferInput(form), [form]);
  const outcome = useMemo(() => {
    if (!built.input) return { result: null as OfferResult | null, tooBig: false };
    try {
      return { result: analyzeOffer(built.input), tooBig: false };
    } catch {
      return { result: null, tooBig: true };
    }
  }, [built]);
  const result = outcome.result;
  const input = built.input;
  const tone = result ? TONES[result.decision] : null;
  const ToneIcon = tone?.icon ?? Calculator;
  const hasErrors = Object.keys(built.errors).length > 0;
  const contractorToll = form.tollPayer === "contractor";
  const quick = form.mode === "quick";
  const yearSpendCents = parseMoney(yearSpend);
  const yearKmValue = parseKm(yearKm);
  const yearCostPerKm =
    yearSpendCents.value !== null && yearKmValue.value !== null && !yearSpendCents.error && !yearKmValue.error
      ? costPerKmFromYear(yearSpendCents.value, yearKmValue.value)
      : null;

  const needed = result && input && result.targetPriceCents !== null && !built.marginMissing && result.grossFreightCents > 0
    ? result.targetPriceCents - result.grossFreightCents
    : null;

  const showNotices = result ? result.notices.filter((notice) => notice.code !== "PISO_NAO_CALCULADO") : [];
  const showDieselSlack = result && input && input.dieselPriceMilli && result.fuelCostCents !== null && result.grossFreightCents > 0;

  return (
    <section className="space-y-5 pb-32 lg:pb-0">
      <div>
        <h2 className="text-2xl font-black">Esse frete compensa?</h2>
        <p className="mt-1 text-[#718078]">Preencha o que você sabe antes de aceitar. O que faltar aparece como pendência, nunca como zero.</p>
        <div className="mt-3 inline-flex rounded-xl bg-[#e3e9e6] p-1" role="group" aria-label="Quanto detalhe você quer">
          {([["quick", "Rápido"], ["detailed", "Detalhado"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={form.mode === mode}
              onClick={() => set("mode")(mode)}
              className={`min-h-11 rounded-lg px-5 text-sm font-bold transition ${form.mode === mode ? "bg-[#10251f] text-white shadow-sm" : "text-[#4a5a52]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[#718078]">
          {quick
            ? "Modo rápido: um consumo médio e um custo por km que já inclui parcela, seguro, pneus e manutenção. Dá um preço bem próximo do real com poucos números."
            : "Modo detalhado: consumo vazio e carregado, custo fixo por dia, ARLA, piso da ANTT, prazo de pagamento e mais."}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
          <section className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-lg font-bold">O frete</h3>
            <div className="mb-4 inline-flex rounded-xl bg-[#eef2f0] p-1" role="group" aria-label="Como o frete é cobrado">
              {([["fixed", "Valor fechado"], ["perTon", "Por tonelada"]] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={form.freightMode === mode}
                  onClick={() => set("freightMode")(mode)}
                  className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition ${form.freightMode === mode ? "bg-white text-[#10251f] shadow-sm" : "text-[#5d6d65]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {form.freightMode === "fixed" ? (
                <NumField field="freight" label="Valor do frete (R$)" value={form.freight} onChange={set("freight")} error={built.errors.freight} />
              ) : (
                <>
                  <NumField field="rate" label="Valor por tonelada (R$)" value={form.rate} onChange={set("rate")} error={built.errors.rate} />
                  <NumField field="weightKg" label="Peso carregado (kg)" value={form.weightKg} onChange={set("weightKg")} error={built.errors.weightKg} numeric hint="Em quilos, o peso que foi carregado. 50 toneladas = 50.000." />
                </>
              )}
            </div>
            <HelpNote title="Entenda o frete" className="mt-4">
              <p><b>O que é:</b> o valor que o contratante paga para você levar a carga da origem até o destino.</p>
              <p><b>Como é combinado:</b> por tonelada (tarifa × peso) ou por valor fechado da viagem.</p>
              <p><b>Peso:</b> o frete é calculado pelo peso carregado. É o peso que vale para cobrar.</p>
              <p><b>O frete tem que pagar:</b> o diesel, o pedágio (se for seu), o custo do caminhão, a comissão e ainda deixar a sua margem.</p>
              <p><b>Se a volta é vazia,</b> o frete da ida também paga a volta. Por isso a tela pede os km vazios.</p>
              <p><b>Fora do frete:</b> o vale-pedágio, em regra, vem do contratante à parte. Descontos e taxas do contratante saem do frete antes de você receber.</p>
              <p><b>Quanto cai na conta:</b> o frete menos os descontos. No seu caso, 80% cai logo no início e 20% na descarga.</p>
            </HelpNote>
          </section>

          <Card title="A viagem">
            {quick ? (
              <>
                <AxlesSelect value={form.axles} onChange={set("axles")} />
                <div />
                <NumField field="kmLoaded" label="Km carregado" value={form.kmLoaded} onChange={set("kmLoaded")} error={built.errors.kmLoaded} numeric />
                <NumField field="kmEmptyTo" label="Km vazio (até a coleta e na volta)" value={form.kmEmptyTo} onChange={set("kmEmptyTo")} error={built.errors.kmEmptyTo} numeric hint="Some o que o caminhão roda sem carga. Se já tem carga de volta, só a ida até a coleta." />
                <NumField field="kplAvg" label="Consumo médio (km/L)" value={form.kplAvg} onChange={set("kplAvg")} error={built.errors.kplAvg} hint="Média da viagem toda, com carga e vazio." />
                <NumField field="diesel" label="Preço do diesel (R$/L)" value={form.diesel} onChange={set("diesel")} error={built.errors.diesel} />
                <AnttReference axles={form.axles} onUse={(centi) => set("kplAvg")(formatKmPerLiter(centi))} />
              </>
            ) : (
              <>
                <AxlesSelect value={form.axles} onChange={set("axles")} />
                <div />
                <NumField field="kmEmptyTo" label="Km até a coleta (vazio)" value={form.kmEmptyTo} onChange={set("kmEmptyTo")} error={built.errors.kmEmptyTo} numeric />
                <NumField field="kmLoaded" label="Km carregado" value={form.kmLoaded} onChange={set("kmLoaded")} error={built.errors.kmLoaded} numeric />
                <NumField field="kmEmptyBack" label="Km de volta (vazio)" value={form.kmEmptyBack} onChange={set("kmEmptyBack")} error={built.errors.kmEmptyBack} numeric hint="Deixe em branco se já tem carga de volta." />
                <NumField field="days" label="Duração prevista (dias)" value={form.days} onChange={set("days")} error={built.errors.days} hint="Inclua a espera para carregar e descarregar, e a volta." />
                <NumField field="kplEmpty" label="Consumo vazio (km/L)" value={form.kplEmpty} onChange={set("kplEmpty")} error={built.errors.kplEmpty} />
                <NumField field="kplLoaded" label="Consumo carregado (km/L)" value={form.kplLoaded} onChange={set("kplLoaded")} error={built.errors.kplLoaded} />
                <NumField field="diesel" label="Preço do diesel (R$/L)" value={form.diesel} onChange={set("diesel")} error={built.errors.diesel} />
                <AnttReference axles={form.axles} onUse={(centi) => set("kplLoaded")(formatKmPerLiter(centi))} loadedOnly />
              </>
            )}
          </Card>

          <details className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
            <summary className="min-h-11 cursor-pointer text-lg font-bold">Medir meu consumo (odômetro e litros)</summary>
            <div className="mt-3 space-y-4 text-sm">
              <p className="text-[#34443e]">
                Encha o tanque até o máximo e anote o odômetro e os litros: esse primeiro cheio só marca o ponto de partida.
                No próximo abastecimento, encha até o máximo de novo e anote. O app divide os km rodados pelos litros repostos e separa o que foi carregado do que foi vazio.
                Se parar para abastecer no meio sem encher o tanque, marque “Encheu o tanque até o máximo” como desligado e anote do mesmo jeito.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumField field="fuelOdometer" label="Odômetro (km)" value={fuelOdometer} onChange={setFuelOdometer} numeric />
                <NumField field="fuelLiters" label="Litros abastecidos" value={fuelLiters} onChange={setFuelLiters} />
                <div>
                  <label htmlFor="offer-fuelState" className="text-sm font-semibold text-[#34443e]">Como foi o trecho até aqui</label>
                  <select
                    id="offer-fuelState"
                    value={fuelState}
                    onChange={(event) => setFuelState(event.target.value === "empty" ? "empty" : "loaded")}
                    className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-base"
                  >
                    <option value="loaded">Carregado</option>
                    <option value="empty">Vazio</option>
                  </select>
                </div>
                <div className="flex items-end"><CheckField label="Encheu o tanque até o máximo" checked={fuelFull} onChange={setFuelFull} /></div>
              </div>
              {fuelError ? <p className="font-semibold text-red-700">{fuelError}</p> : null}
              <button type="button" onClick={addFuelRecord} className="min-h-11 rounded-lg bg-[#10251f] px-4 text-sm font-bold text-white">Adicionar abastecimento</button>

              {fuelRecords.length > 0 ? (
                <ul className="divide-y divide-black/10 rounded-xl bg-[#f3f6f4]">
                  {[...fuelRecords].sort((a, b) => a.odometerKm - b.odometerKm).map((record, index) => (
                    <li key={record.id} className="flex items-center justify-between gap-3 px-4 py-2">
                      <span>
                        {new Intl.NumberFormat("pt-BR").format(record.odometerKm)} km · {formatLiters(record.litersMilli)} · {record.full ? "cheio" : "parcial"} · {record.state === "loaded" ? "carregado" : "vazio"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover abastecimento ${index + 1}`}
                        onClick={() => setFuelRecords((current) => current.filter((item) => item.id !== record.id))}
                        className="min-h-11 min-w-11 rounded-lg text-lg font-bold text-red-700"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div data-testid="consumption-report" className="rounded-xl bg-[#f3f6f4] p-4">
                {consumption && consumption.overall ? (
                  <>
                    <GroupRow label="Carregado" group={consumption.loaded} />
                    <GroupRow label="Vazio" group={consumption.empty} />
                    <GroupRow label="Misto" group={consumption.mixed} note="carregado e vazio juntos, não dá para separar" />
                    <GroupRow label="Geral" group={consumption.overall} />
                    <button type="button" onClick={useMeasured} className="mt-3 min-h-11 rounded-lg bg-[#0d5c43] px-4 text-sm font-bold text-white">Usar no cálculo</button>
                    {fuelUsed ? <p className="mt-2 text-xs text-[#34443e]">{fuelUsed}</p> : null}
                  </>
                ) : (
                  <p>Ainda não dá para medir: precisa de dois abastecimentos com o tanque cheio. Os parciais do meio entram na conta.</p>
                )}
              </div>
              <p className="text-xs text-[#718078]">Os abastecimentos ficam guardados só neste aparelho. Não são enviados para lugar nenhum.</p>
            </div>
          </details>

          <Card title="Custos da viagem">
            <div>
              <label htmlFor="offer-tollPayer" className="text-sm font-semibold text-[#34443e]">Quem paga o pedágio?</label>
              <select
                id="offer-tollPayer"
                value={form.tollPayer}
                onChange={(event) => set("tollPayer")(event.target.value === "contractor" ? "contractor" : "me")}
                className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-base"
              >
                <option value="me">Eu pago</option>
                <option value="contractor">O contratante dá o vale-pedágio</option>
              </select>
              {contractorToll ? <p className="mt-1 text-xs text-[#718078]">Em regra o contratante paga o vale-pedágio (Lei 10.209/2001). Confira o valor.</p> : null}
            </div>
            <div>
              <NumField field="toll" label="Pedágio (R$)" value={form.noToll && !contractorToll ? "" : form.toll} onChange={set("toll")} error={built.errors.toll} disabled={form.noToll && !contractorToll} hint={contractorToll ? "Só para conferir se o vale cobre a rota." : undefined} />
              {!contractorToll ? <CheckField label="Esta rota não tem pedágio" checked={form.noToll} onChange={set("noToll")} /> : null}
            </div>
            {quick ? (
              <div className="sm:col-span-2">
                <NumField field="vehicleKmAll" label="Custo do caminhão por km, tudo incluso (R$/km)" value={form.vehicleKmAll} onChange={set("vehicleKmAll")} error={built.errors.vehicleKmAll} hint="Parcela, seguro, IPVA, pneus e manutenção, divididos pelos km rodados. Não inclui diesel nem comissão." />
                <HelpNote title="O que entra no custo por km?" className="mt-3">
                  <p><b>Entra:</b> parcela, seguro, IPVA, pneus e manutenção, divididos pelos km que o caminhão roda.</p>
                  <p><b>Não entra:</b> o diesel (a tela já calcula à parte) e a comissão do motorista (tem campo próprio).</p>
                </HelpNote>
                <details className="mt-3 rounded-xl bg-[#f3f6f4] p-4">
                  <summary className="min-h-11 cursor-pointer text-sm font-bold">Não sei meu custo por km</summary>
                  <p className="mt-2 text-xs text-[#718078]">Some o que você gastou no último ano com parcela, seguro, IPVA, pneus e manutenção. Não some diesel nem comissão. Depois divida pelos km rodados no ano.</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <NumField field="yearSpend" label="Gasto no ano com parcela, seguro, IPVA, pneus e manutenção (R$)" value={yearSpend} onChange={setYearSpend} error={yearSpendCents.error ?? undefined} />
                    <NumField field="yearKm" label="Km rodados no ano" value={yearKm} onChange={setYearKm} error={yearKmValue.error ?? undefined} numeric />
                  </div>
                  {yearCostPerKm !== null ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="text-sm font-bold">{formatBRL(yearCostPerKm)} por km</p>
                      <button
                        type="button"
                        onClick={() => set("vehicleKmAll")((yearCostPerKm / 100).toFixed(2).replace(".", ","))}
                        className="min-h-11 rounded-lg bg-[#10251f] px-4 text-sm font-bold text-white"
                      >
                        Usar esse valor
                      </button>
                    </div>
                  ) : null}
                </details>
              </div>
            ) : (
              <>
              <NumField field="vehicleKm" label="Custo por km do caminhão (R$/km)" value={form.vehicleKm} onChange={set("vehicleKm")} error={built.errors.vehicleKm} hint="Pneus, manutenção e desgaste por km rodado." />
              <NumField field="fixedDay" label="Custo fixo por dia (R$/dia)" value={form.fixedDay} onChange={set("fixedDay")} error={built.errors.fixedDay} hint="Parcela, seguro, IPVA, depreciação, rastreador, salário. Deixe em branco se ainda não sabe: o app só avisa que ele não entrou na conta." />
              <HelpNote title="O que é o custo fixo?" className="sm:col-span-2">
                <p>É o gasto do caminhão que existe mesmo com o caminhão parado: você paga rodando ou não.</p>
                <p><b>Entra:</b> parcela, seguro, IPVA e licenciamento, rastreador, salário fixo do motorista e depreciação (o quanto o caminhão perde de valor com o tempo).</p>
                <p><b>Não entra:</b> diesel e pedágio, pneus e manutenção (isso é o custo por km) nem a comissão.</p>
                <p><b>Ainda não sabe?</b> Deixe em branco: o app avisa que o custo fixo não entrou na conta e não trava a análise. Com o uso, o dono passa a ter esse número. No modo rápido, o custo por km já inclui o fixo.</p>
                <p><b>Como achar o valor por dia:</b> some o que paga por mês e divida pelos dias do mês em que o caminhão trabalha, por exemplo 25. Dividir por 30 deixa o custo por dia menor que o real.</p>
              </HelpNote>
              <NumField field="extras" label="Outros custos (R$)" value={form.extras} onChange={set("extras")} error={built.errors.extras} hint="Alimentação, chapa, estacionamento…" />
              <div className="sm:col-span-2">
              <CheckField label="Meu caminhão usa ARLA 32" checked={form.arlaUse} onChange={set("arlaUse")} />
              {form.arlaUse ? (
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <NumField field="arlaPct" label="ARLA 32: consumo (% do diesel)" value={form.arlaPct} onChange={set("arlaPct")} error={built.errors.arlaPct} hint="Quanto de ARLA o caminhão gasta para cada 100 L de diesel. Confira no seu painel ou nas notas." />
                  <NumField field="arlaPrice" label="Preço do ARLA 32 (R$/L)" value={form.arlaPrice} onChange={set("arlaPrice")} error={built.errors.arlaPrice} />
                </div>
              ) : null}
              </div>
              </>
            )}
          </Card>

          {quick ? (
            <Card title="Como você recebe">
              <NumField field="advance" label="Adiantamento (%)" value={form.advance} onChange={set("advance")} error={built.errors.advance} hint="Parte do frete que cai logo no início. O resto cai na descarga. Hoje: 80% e 20%." />
            </Card>
          ) : null}

          <Card title="Comissão e meta">
            <NumField field="commission" label="Comissão do motorista (%)" value={form.commission} onChange={set("commission")} error={built.errors.commission} hint="Em branco se você não paga comissão." />
            <NumField field="margin" label="Margem que você quer (%)" value={form.margin} onChange={set("margin")} error={built.errors.margin} hint="Quanto do frete você quer que sobre, depois de todos os custos. Quem define é o dono." />
          </Card>

          {!quick ? <details className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
            <summary className="min-h-11 cursor-pointer text-lg font-bold">Mais opções</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="offer-commissionBase" className="text-sm font-semibold text-[#34443e]">Base da comissão</label>
                <select
                  id="offer-commissionBase"
                  value={form.commissionBase}
                  onChange={(event) => set("commissionBase")(event.target.value === "net" ? "net" : "gross")}
                  className="mt-2 h-12 w-full rounded-xl border border-input bg-white px-3 text-base"
                >
                  <option value="gross">Frete bruto</option>
                  <option value="net">Frete menos os descontos</option>
                </select>
              </div>
              <NumField field="discounts" label="Descontos já combinados (R$)" value={form.discounts} onChange={set("discounts")} error={built.errors.discounts} hint="Retenções ou abatimentos definitivos, com documento." />
              <NumField field="otherPct" label="Outros percentuais sobre o frete (%)" value={form.otherPct} onChange={set("otherPct")} error={built.errors.otherPct} hint="Só se você sabe o que incide no seu caso." />

              <div className="sm:col-span-2 border-t border-black/10 pt-4">
                <p className="text-sm font-bold">Pagamento</p>
                <p className="text-xs text-[#718078]">Quanto você recebe adiantado e quando chega o saldo.</p>
              </div>
              <NumField field="advance" label="Adiantamento (%)" value={form.advance} onChange={set("advance")} error={built.errors.advance} hint="Parte do frete que cai logo no início. Hoje: 80%. O resto cai no prazo abaixo." />
              <NumField field="balanceDays" label="Prazo para receber o saldo (dias)" value={form.balanceDays} onChange={set("balanceDays")} error={built.errors.balanceDays} numeric hint="0 se recebe na descarga." />
              <NumField field="moneyCost" label="Custo do seu dinheiro (% ao mês)" value={form.moneyCost} onChange={set("moneyCost")} error={built.errors.moneyCost} hint="O que custa ficar sem esse dinheiro (juros do financiamento, por exemplo). Em branco para não contar." />

              <div className="sm:col-span-2 border-t border-black/10 pt-4">
                <p className="text-sm font-bold">Piso mínimo da ANTT</p>
                <p className="text-xs text-[#718078]">
                  Copie os coeficientes da <a href={ANTT_CALCULATOR} target="_blank" rel="noopener noreferrer" className="underline">calculadora oficial</a> para o seu tipo de carga e de caminhão. Eles mudam com o tempo, por isso não ficam guardados aqui.
                </p>
              </div>
              <NumField field="ccd" label="CCD do piso ANTT (R$/km)" value={form.ccd} onChange={set("ccd")} error={built.errors.ccd} hint="Custo de deslocamento por km." />
              <NumField field="cc" label="CC do piso ANTT (R$)" value={form.cc} onChange={set("cc")} error={built.errors.cc} hint="Custo de carga e descarga." />

              <div className="sm:col-span-2 border-t border-black/10 pt-4">
                <p className="text-sm font-bold">Folga de segurança</p>
                <p className="text-xs text-[#718078]">Mostra o resultado se os custos ficarem maiores do que você previu.</p>
              </div>
              <NumField field="safety" label="Folga nos custos (%)" value={form.safety} onChange={set("safety")} error={built.errors.safety} hint="Em branco usa 10%. Digite 0 para não calcular." />
            </div>
          </details> : null}
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div data-testid="offer-result" aria-live="polite" className="space-y-4">
            {hasErrors || outcome.tooBig || !result || !tone || !input ? (
              <div className="rounded-[22px] border border-red-300 bg-red-50 p-5 text-red-950">
                <p className="text-xl font-black">{outcome.tooBig ? "Algum valor está grande demais" : "Corrija os campos em vermelho"}</p>
                <p className="mt-1 text-sm">{outcome.tooBig ? "Confira se não digitou números a mais." : "Enquanto houver número digitado errado, nada é calculado."}</p>
              </div>
            ) : (
              <>
                <div className={`rounded-[22px] border-2 p-5 ${tone.box} ${result.complete ? "" : "border-dashed"}`}>
                  <div className="flex items-start gap-3">
                    <ToneIcon className="mt-1 size-7 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-2xl font-black">{tone.title}</p>
                      {!result.complete && result.decision !== "sem_frete" ? <p className="mt-1 inline-block rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wide">Resultado provisório</p> : null}
                      <p className="mt-2 text-sm">{subtitle(result, input.targetMarginBp, built.marginMissing, result.robustness === "apertado")}</p>
                    </div>
                  </div>
                  {built.marginMissing && result.decision !== "sem_frete" ? <p className="mt-3 text-sm">Você não definiu a margem que quer. Por enquanto só aviso se há prejuízo.</p> : null}
                </div>

                {result.pending.length > 0 ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 text-amber-950">
                    <p className="flex items-center gap-2 font-bold"><Info className="size-5" aria-hidden />Para o resultado ficar completo</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.pending.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
                  </div>
                ) : null}

                {showNotices.length > 0 ? (
                  <div className="rounded-[22px] border border-sky-200 bg-sky-50 p-5 text-sky-950">
                    <p className="flex items-center gap-2 font-bold"><TriangleAlert className="size-5" aria-hidden />Atenção</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{showNotices.map((item) => <li key={item.code}>{item.message}</li>)}</ul>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Resultado", formatBRL(result.resultCents), resultText(result.resultCents), "o que sobra depois de todos os custos"],
                    ["Margem", formatBp(result.marginBp), resultText(result.resultCents), "a parte do frete que sobra para você"],
                    ["Resultado por km", result.resultPerKmCents === null ? "—" : formatBRL(result.resultPerKmCents), resultText(result.resultPerKmCents ?? 0), "por km rodado, vazio e carregado"],
                    ["Receita por km", result.revenuePerKmCents === null ? "—" : formatBRL(result.revenuePerKmCents), "", "frete ÷ todos os km, vazio e carregado"],
                    ...(result.resultPerDayCents !== null ? [["Resultado por dia", formatBRL(result.resultPerDayCents), resultText(result.resultPerDayCents), "por dia de viagem, com a espera"]] : []),
                  ].map(([label, value, cls, hint]) => (
                    <div key={label} className="rounded-2xl border border-black/[.05] bg-white p-4 shadow-sm">
                      <p className="text-xs text-[#718078]">{label}</p>
                      <p className={`mt-1 text-lg font-black tabular-nums ${cls}`}>{value}</p>
                      <p className="mt-1 text-[11px] leading-tight text-[#718078]">{hint}</p>
                    </div>
                  ))}
                </div>

                {input.safetyBp > 0 && result.decision !== "sem_frete" ? (
                  <div className={`rounded-[22px] border p-5 text-sm ${result.robustness === "apertado" ? "border-amber-300 bg-amber-50 text-amber-950" : result.robustness === "folga" ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-black/[.05] bg-white shadow-sm"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">Se os custos ficarem {plainPercent(input.safetyBp)} maiores</h3>
                      {result.robustness ? <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wide">{result.robustness === "folga" ? "Com folga" : "Apertado"}</span> : null}
                    </div>
                    <p className="mt-2">
                      {result.robustness === "folga"
                        ? `Mesmo com custos ${plainPercent(input.safetyBp)} maiores, a margem seria ${formatBp(result.stressMarginBp)}, ainda acima da sua meta.`
                        : result.robustness === "apertado"
                          ? `Atenção: com custos ${plainPercent(input.safetyBp)} maiores a margem cai para ${formatBp(result.stressMarginBp)}, abaixo da sua meta.`
                          : `Com custos ${plainPercent(input.safetyBp)} maiores o resultado seria ${formatBRL(result.stressResultCents)}.`}
                    </p>
                    <Row label="Resultado no pior caso" detail={`Margem ${formatBp(result.stressMarginBp)}`} value={formatBRL(result.stressResultCents)} />
                    <p className="text-xs opacity-80">Isso é um teste de segurança com a folga que você escolheu, não uma previsão. Só encarece os custos que você informou.</p>
                  </div>
                ) : null}

                <div className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
                  <h3 className="mb-1 text-lg font-bold">Quanto cobrar</h3>
                  <Row label="Frete mínimo para empatar" detail="O menor frete em que você não perde dinheiro" value={result.breakEvenCents === null ? "—" : formatBRL(result.breakEvenCents)} />
                  {!built.marginMissing ? <Row label="Frete para a sua meta" detail="O frete que deixa a margem que você quer" value={result.targetPriceCents === null ? "—" : formatBRL(result.targetPriceCents)} /> : null}
                  {needed !== null ? (
                    <p className={`mt-1 text-sm font-semibold ${needed > 0 ? "text-amber-800" : "text-emerald-800"}`}>
                      {needed > 0 ? `Faltam ${formatBRL(needed)} para a sua meta.` : needed < 0 ? `Sobram ${formatBRL(-needed)} acima da sua meta.` : "O frete está exatamente na sua meta."}
                    </p>
                  ) : null}
                  {result.floorCents !== null && result.floorGapCents !== null ? (
                    <>
                      <Row label="Piso mínimo ANTT" detail="Com os coeficientes que você informou" value={formatBRL(result.floorCents)} />
                      <p className={`text-sm font-semibold ${result.floorGapCents >= 0 ? "text-emerald-800" : "text-red-700"}`}>
                        {result.floorGapCents >= 0 ? `${formatBRL(result.floorGapCents)} acima do piso.` : `${formatBRL(-result.floorGapCents)} abaixo do piso.`}
                      </p>
                    </>
                  ) : !quick ? (
                    <p className="mt-2 text-xs text-[#718078]">
                      Piso mínimo da ANTT não calculado. Isso não quer dizer que não se aplica ao seu frete. Informe os coeficientes em “Mais opções” para comparar.
                    </p>
                  ) : null}
                  {!result.complete ? <p className="mt-2 text-xs text-[#718078]">Estes valores também são provisórios enquanto houver pendência.</p> : null}
                </div>

                {showDieselSlack ? (
                  <div className="rounded-[22px] border border-black/[.05] bg-white p-5 text-sm shadow-sm">
                    <h3 className="mb-1 text-lg font-bold">Folga do diesel</h3>
                    <p className="text-xs text-[#718078]">Até quanto o diesel pode subir (ou o consumo piorar) sem estragar esse frete. Hoje: {formatBRL(Math.floor((input.dieselPriceMilli ?? 0) / 10))}/L.</p>
                    {!built.marginMissing ? (
                      <Row label="Para cumprir a sua meta" value={result.dieselMaxForTargetMilli === null ? "Já não cumpre a sua meta." : dieselLimit(result.dieselMaxForTargetMilli, input.dieselPriceMilli ?? 1)} />
                    ) : null}
                    <Row label="Para não dar prejuízo" value={result.dieselMaxForBreakEvenMilli === null ? "Já dá prejuízo." : dieselLimit(result.dieselMaxForBreakEvenMilli, input.dieselPriceMilli ?? 1)} />
                  </div>
                ) : null}

                <div className="rounded-[22px] border border-black/[.05] bg-white p-5 text-sm shadow-sm">
                  <h3 className="mb-1 text-lg font-bold">Dinheiro e prazo</h3>
                  <Row label="Dinheiro seu necessário até receber" detail="Diesel, ARLA, pedágio e outros custos da estrada, menos o adiantamento" value={formatBRL(result.cashNeededCents)} />
                  {result.advanceCents > 0 && result.cashNeededCents === 0 ? (
                    <p className="text-sm font-semibold text-emerald-800">O adiantamento cobre as despesas da estrada: você não precisa tirar dinheiro do bolso.</p>
                  ) : null}
                  {result.advanceCents > 0 ? <Row label="Adiantamento" detail="logo no início" value={formatBRL(result.advanceCents)} /> : null}
                  {result.advanceCents > 0 || result.financingCostCents > 0 ? <Row label="Saldo a receber" detail={input.balanceDays === null ? undefined : input.balanceDays === 0 ? "na descarga" : `em ${input.balanceDays} dias`} value={formatBRL(result.receivableCents)} /> : null}
                  {result.financingCostCents > 0 ? (
                    <>
                      <Row label="Custo de esperar o saldo" value={`− ${formatBRL(result.financingCostCents)}`} />
                      <Row strong label="Resultado depois do prazo" detail={`Margem ${formatBp(result.marginAfterFinancingBp)}`} value={formatBRL(result.resultAfterFinancingCents)} />
                    </>
                  ) : null}
                </div>

                <div className="rounded-[22px] border border-black/[.05] bg-white p-5 text-sm shadow-sm">
                  <h3 className="mb-1 text-lg font-bold">Como chegamos nesse resultado</h3>
                  <Row label="Frete" value={formatBRL(result.grossFreightCents)} />
                  {result.legs.map((leg, index) => leg.km > 0 ? (
                    <Row key={index} label={`Diesel: ${LEG_LABELS[index].toLowerCase()}`} detail={`${leg.km} km · ${formatLiters(leg.litersMilli)}`} value={leg.costCents === null ? "não calculado" : `− ${formatBRL(leg.costCents)}`} />
                  ) : null)}
                  {result.fuelLitersMilli !== null && result.legs.filter((leg) => leg.km > 0).length > 1 ? <Row label="Diesel no total" value={formatLiters(result.fuelLitersMilli)} /> : null}
                  {input.arla ? <Row label="ARLA 32" detail={result.arlaLitersMilli !== null ? formatLiters(result.arlaLitersMilli) : undefined} value={result.arlaCostCents === null ? "não calculado" : `− ${formatBRL(result.arlaCostCents)}`} /> : null}
                  <Row
                    label={contractorToll ? "Pedágio (vale do contratante)" : "Pedágio"}
                    value={contractorToll ? "por conta dele" : input.tollCents === null ? "não conferido" : `− ${formatBRL(input.tollCents)}`}
                  />
                  <Row label={quick ? "Custo do caminhão (tudo incluso)" : "Custo do caminhão"} detail={result.totalKm > 0 && input.vehicleCostCentsPerKm !== null ? `${result.totalKm} km × ${formatBRL(input.vehicleCostCentsPerKm)}` : undefined} value={result.vehicleCostCents === null ? "não informado" : `− ${formatBRL(result.vehicleCostCents)}`} />
                  {input.fixedCostPerDayCents !== 0 ? (
                    <Row
                      label="Custo fixo"
                      detail={input.fixedCostPerDayCents !== null && input.durationHours ? `${formatBRL(input.fixedCostPerDayCents)} por dia` : undefined}
                      value={result.fixedCostCents === null ? "não calculado" : `− ${formatBRL(result.fixedCostCents)}`}
                    />
                  ) : null}
                  {input.extraCostsCents > 0 ? <Row label="Outros custos" value={`− ${formatBRL(input.extraCostsCents)}`} /> : null}
                  {input.deductionsCents > 0 ? <Row label="Descontos" value={`− ${formatBRL(input.deductionsCents)}`} /> : null}
                  {input.commissionBp > 0 ? <Row label={`Comissão (${formatBp(input.commissionBp)})`} value={`− ${formatBRL(result.commissionCents)}`} /> : null}
                  {input.otherPercentBp > 0 ? <Row label={`Outros percentuais (${formatBp(input.otherPercentBp)})`} value={`− ${formatBRL(result.otherPercentCents)}`} /> : null}
                  <Row strong label="Resultado" value={formatBRL(result.resultCents)} />
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {result && tone && !hasErrors ? (
        <button
          type="button"
          data-testid="offer-summary-bar"
          onClick={() => document.querySelector('[data-testid="offer-result"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className={`fixed inset-x-3 bottom-[92px] z-20 flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-left shadow-lg lg:hidden ${result.robustness === "apertado" ? TONES.abaixo_da_meta.box : tone.box}`}
          aria-label="Ver detalhes da análise"
        >
          <ToneIcon className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-black">{tone.title}{result.robustness === "apertado" ? " (apertado)" : ""}{!result.complete && result.decision !== "sem_frete" ? " (provisório)" : ""}</span>
          {result.decision !== "sem_frete" ? <span className="shrink-0 font-black tabular-nums">{formatBRL(result.resultCents)}</span> : null}
        </button>
      ) : null}
    </section>
  );
}
