"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { analyzeOffer, type Decision, type OfferResult } from "@/lib/offer";
import { buildOfferInput, emptyOfferForm, formatBp, formatBRL, formatLiters, type OfferForm } from "@/lib/offer-form";

// Só o que é do caminhão e do jeito de trabalhar fica guardado neste aparelho.
// O que é da oferta (frete, quilômetros, pedágio, duração) começa vazio a cada análise.
const STORAGE_KEY = "rota-financeira:analise-de-frete:v1";
const REMEMBERED_TEXT = ["kplEmpty", "kplLoaded", "diesel", "vehicleKm", "fixedDay", "commission", "margin", "arlaPct", "arlaPrice", "moneyCost"] as const;

const ANTT_CALCULATOR = "https://calculadorafrete.antt.gov.br/";

const TONES: Record<Decision, { title: string; box: string; icon: typeof Calculator }> = {
  compensa: { title: "Compensa", box: "border-emerald-300 bg-emerald-50 text-emerald-950", icon: CircleCheck },
  abaixo_da_meta: { title: "Abaixo da sua meta", box: "border-amber-300 bg-amber-50 text-amber-950", icon: TriangleAlert },
  prejuizo: { title: "Dá prejuízo", box: "border-red-300 bg-red-50 text-red-950", icon: CircleX },
  sem_frete: { title: "Informe o frete", box: "border-slate-300 bg-slate-50 text-slate-800", icon: Calculator },
};

function resultText(value: number) {
  return value < 0 ? "text-red-700" : value > 0 ? "text-emerald-800" : "text-slate-700";
}

function subtitle(result: OfferResult, targetBp: number, marginMissing: boolean) {
  const target = marginMissing ? "" : ` (sua meta: ${formatBp(targetBp)})`;
  switch (result.decision) {
    case "compensa":
      return `Margem de ${formatBp(result.marginBp)}${target}.`;
    case "abaixo_da_meta":
      return `Dá lucro de ${formatBRL(result.resultCents)}, mas a margem é ${formatBp(result.marginBp)} e você quer ${formatBp(targetBp)}.`;
    case "prejuizo":
      return `Nesse valor você perde ${formatBRL(-result.resultCents)}.`;
    default:
      return "Digite o valor do frete, ou a tarifa e o peso, para ver o resultado.";
  }
}

/** Preço do diesel que o frete aguenta, sempre arredondado para baixo (não prometer folga que não existe). */
function dieselLimit(maxMilli: number, currentMilli: number) {
  const increase = Math.round(((maxMilli - currentMilli) * 100) / currentMilli);
  return `até ${formatBRL(Math.floor(maxMilli / 10))}/L (mais ${increase}%)`;
}

function NumField({ field, label, value, onChange, error, hint, numeric, disabled }: {
  field: keyof OfferForm; label: string; value: string; onChange: (value: string) => void;
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
    if (typeof saved.arlaUse === "boolean") form.arlaUse = saved.arlaUse;
  } catch {
    // armazenamento bloqueado ou conteúdo inválido: começa vazio
  }
  return form;
}

export function OfferView() {
  // Esta tela só abre depois do clique no menu, nunca vem pronta do servidor: ler aqui é seguro.
  const [form, setForm] = useState<OfferForm>(loadRemembered);
  const set = <K extends keyof OfferForm>(key: K) => (value: OfferForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    try {
      const remembered: Record<string, string | boolean> = { commissionBase: form.commissionBase, arlaUse: form.arlaUse };
      for (const key of REMEMBERED_TEXT) remembered[key] = form[key];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
    } catch {
      // sem armazenamento: a análise continua funcionando
    }
  }, [form]);

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
                  <NumField field="weightKg" label="Peso faturável (kg)" value={form.weightKg} onChange={set("weightKg")} error={built.errors.weightKg} numeric hint="Em quilos, como está no contrato. 50 toneladas = 50.000." />
                </>
              )}
            </div>
          </section>

          <Card title="A viagem">
            <NumField field="kmEmptyTo" label="Km até a coleta (vazio)" value={form.kmEmptyTo} onChange={set("kmEmptyTo")} error={built.errors.kmEmptyTo} numeric />
            <NumField field="kmLoaded" label="Km carregado" value={form.kmLoaded} onChange={set("kmLoaded")} error={built.errors.kmLoaded} numeric />
            <NumField field="kmEmptyBack" label="Km de volta (vazio)" value={form.kmEmptyBack} onChange={set("kmEmptyBack")} error={built.errors.kmEmptyBack} numeric hint="Deixe em branco se já tem carga de volta." />
            <NumField field="days" label="Duração prevista (dias)" value={form.days} onChange={set("days")} error={built.errors.days} hint="Inclua a espera para carregar e descarregar, e a volta." />
            <NumField field="kplEmpty" label="Consumo vazio (km/L)" value={form.kplEmpty} onChange={set("kplEmpty")} error={built.errors.kplEmpty} />
            <NumField field="kplLoaded" label="Consumo carregado (km/L)" value={form.kplLoaded} onChange={set("kplLoaded")} error={built.errors.kplLoaded} />
            <NumField field="diesel" label="Preço do diesel (R$/L)" value={form.diesel} onChange={set("diesel")} error={built.errors.diesel} />
          </Card>

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
            <NumField field="vehicleKm" label="Custo por km do caminhão (R$/km)" value={form.vehicleKm} onChange={set("vehicleKm")} error={built.errors.vehicleKm} hint="Pneus, manutenção e desgaste por km rodado." />
            <NumField field="fixedDay" label="Custo fixo por dia (R$/dia)" value={form.fixedDay} onChange={set("fixedDay")} error={built.errors.fixedDay} hint="Parcela, seguro, IPVA, depreciação, rastreador, salário. Digite 0 se não tem." />
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
          </Card>

          <Card title="Comissão e meta">
            <NumField field="commission" label="Comissão do motorista (%)" value={form.commission} onChange={set("commission")} error={built.errors.commission} hint="Em branco se você não paga comissão." />
            <NumField field="margin" label="Margem que você quer (%)" value={form.margin} onChange={set("margin")} error={built.errors.margin} hint="Quanto do frete você quer que sobre depois dos custos." />
          </Card>

          <details className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
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
              <NumField field="advance" label="Adiantamento (%)" value={form.advance} onChange={set("advance")} error={built.errors.advance} hint="Parte do frete paga antes da viagem. Em branco se não tem." />
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
            </div>
          </details>
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
                      <p className="mt-2 text-sm">{subtitle(result, input.targetMarginBp, built.marginMissing)}</p>
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
                    ["Resultado", formatBRL(result.resultCents), resultText(result.resultCents)],
                    ["Margem", formatBp(result.marginBp), resultText(result.resultCents)],
                    ["Resultado por km", result.resultPerKmCents === null ? "—" : formatBRL(result.resultPerKmCents), resultText(result.resultPerKmCents ?? 0)],
                    ["Receita por km", result.revenuePerKmCents === null ? "—" : formatBRL(result.revenuePerKmCents), ""],
                    ...(result.resultPerDayCents !== null ? [["Resultado por dia", formatBRL(result.resultPerDayCents), resultText(result.resultPerDayCents)]] : []),
                  ].map(([label, value, cls]) => (
                    <div key={label} className="rounded-2xl border border-black/[.05] bg-white p-4 shadow-sm">
                      <p className="text-xs text-[#718078]">{label}</p>
                      <p className={`mt-1 text-lg font-black tabular-nums ${cls}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-[22px] border border-black/[.05] bg-white p-5 shadow-sm">
                  <h3 className="mb-1 text-lg font-bold">Quanto cobrar</h3>
                  <Row label="Frete mínimo para empatar" value={result.breakEvenCents === null ? "—" : formatBRL(result.breakEvenCents)} />
                  {!built.marginMissing ? <Row label="Frete para a sua meta" value={result.targetPriceCents === null ? "—" : formatBRL(result.targetPriceCents)} /> : null}
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
                  ) : (
                    <p className="mt-2 text-xs text-[#718078]">
                      Piso mínimo da ANTT não calculado. Isso não quer dizer que não se aplica ao seu frete. Informe os coeficientes em “Mais opções” para comparar.
                    </p>
                  )}
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
                  {result.advanceCents > 0 ? <Row label="Adiantamento" value={formatBRL(result.advanceCents)} /> : null}
                  {result.advanceCents > 0 || result.financingCostCents > 0 ? <Row label="Saldo a receber" detail={input.balanceDays !== null ? `em ${input.balanceDays} dias` : undefined} value={formatBRL(result.receivableCents)} /> : null}
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
                  <Row label="Custo do caminhão" detail={result.totalKm > 0 && input.vehicleCostCentsPerKm !== null ? `${result.totalKm} km × ${formatBRL(input.vehicleCostCentsPerKm)}` : undefined} value={result.vehicleCostCents === null ? "não informado" : `− ${formatBRL(result.vehicleCostCents)}`} />
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
          className={`fixed inset-x-3 bottom-[92px] z-20 flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 text-left shadow-lg lg:hidden ${tone.box}`}
          aria-label="Ver detalhes da análise"
        >
          <ToneIcon className="size-6 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-black">{tone.title}{!result.complete && result.decision !== "sem_frete" ? " (provisório)" : ""}</span>
          {result.decision !== "sem_frete" ? <span className="shrink-0 font-black tabular-nums">{formatBRL(result.resultCents)}</span> : null}
        </button>
      ) : null}
    </section>
  );
}
