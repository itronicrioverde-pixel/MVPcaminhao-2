// Combustível: referência da ANTT por número de eixos e medição do consumo pelo odômetro.
// Consumo em centésimos de km/L (2,10 km/L -> 210), litros em mililitros, km inteiros.

/** Ano da pesquisa de preços e consumo usada pela ANTT na metodologia do piso. */
export const ANTT_REFERENCE_YEAR = 2019;

/** Classes de eixos que a ANTT tem como referência (a de 8 eixos não existe na tabela). */
export const ANTT_AXLE_CLASSES = [2, 3, 4, 5, 6, 7, 9];

// Mediana da pesquisa ESALQ-LOG para a ANTT (2019), em centésimos de km/L. A de 2 eixos vem de uma regressão do próprio estudo.
const ANTT_KM_PER_LITER_CENTI: Record<number, number> = { 2: 450, 3: 350, 4: 280, 5: 240, 6: 210, 7: 190, 9: 170 };

/** Rendimento de referência da ANTT para o conjunto com esse número de eixos. É referência, não o consumo do caminhão. */
export function anttKmPerLiterCenti(axles: number): number | null {
  return Number.isInteger(axles) ? (ANTT_KM_PER_LITER_CENTI[axles] ?? null) : null;
}

/** Divisão inteira arredondando meio para cima. */
function roundDiv(numerator: number, denominator: number) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function assertCount(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} inválido`);
}

/** Média de uma viagem com trecho carregado e trecho vazio, cada um com o seu rendimento. */
export function blendedKmPerLiterCenti(
  kmLoaded: number,
  kplLoadedCenti: number | null,
  kmEmpty: number,
  kplEmptyCenti: number | null,
): number | null {
  assertCount("km carregado", kmLoaded);
  assertCount("km vazio", kmEmpty);
  const totalKm = kmLoaded + kmEmpty;
  if (totalKm === 0) return null;
  let litersMilli = 0;
  for (const [km, kpl] of [[kmLoaded, kplLoadedCenti], [kmEmpty, kplEmptyCenti]] as const) {
    if (km === 0) continue;
    if (kpl === null || kpl <= 0) return null;
    litersMilli += roundDiv(km * 100000, kpl);
  }
  return roundDiv(totalKm * 100000, litersMilli);
}

export type FuelRecord = {
  odometerKm: number;
  litersMilli: number;
  /** Encheu o tanque até o máximo? Só de um cheio a outro dá para medir. */
  full: boolean;
  /** Como foi o trecho desde o abastecimento anterior. */
  state: "loaded" | "empty";
};

export type ConsumptionGroup = { km: number; litersMilli: number; kmPerLiterCenti: number; cycles: number };
export type ConsumptionReport = {
  loaded: ConsumptionGroup | null;
  empty: ConsumptionGroup | null;
  /** Ciclos em que o caminhão andou carregado e vazio: não dá para separar os litros. */
  mixed: ConsumptionGroup | null;
  overall: ConsumptionGroup | null;
};

export function validateFuelRecords(records: FuelRecord[]): string[] {
  const errors: string[] = [];
  records.forEach((record, index) => {
    const n = index + 1;
    if (!Number.isSafeInteger(record.odometerKm) || record.odometerKm < 0) errors.push(`Abastecimento ${n}: confira o odômetro (km inteiros).`);
    if (!Number.isSafeInteger(record.litersMilli) || record.litersMilli <= 0) errors.push(`Abastecimento ${n}: informe os litros (maior que zero).`);
    if (record.state !== "loaded" && record.state !== "empty") errors.push(`Abastecimento ${n}: diga se o trecho foi carregado ou vazio.`);
  });
  const odometers = records.map((record) => record.odometerKm).filter(Number.isFinite).sort((a, b) => a - b);
  for (let i = 1; i < odometers.length; i += 1) {
    if (odometers[i] === odometers[i - 1]) {
      errors.push("Dois abastecimentos têm o mesmo odômetro. Cada um precisa de um odômetro maior que o anterior.");
      break;
    }
  }
  return errors;
}

type Totals = { km: number; litersMilli: number; cycles: number };
const toGroup = (t: Totals): ConsumptionGroup | null =>
  t.cycles === 0 ? null : { km: t.km, litersMilli: t.litersMilli, kmPerLiterCenti: roundDiv(t.km * 100000, t.litersMilli), cycles: t.cycles };

/**
 * Mede o consumo de um tanque cheio ao seguinte: km rodados ÷ litros repostos depois do primeiro cheio,
 * incluindo os parciais do meio e o cheio que fecha o ciclo. Os litros do primeiro cheio não contam.
 * O que sobra antes do primeiro cheio e depois do último fica de fora. Sem dois cheios, não há medida.
 */
export function measureConsumption(records: FuelRecord[]): ConsumptionReport {
  const errors = validateFuelRecords(records);
  if (errors.length > 0) throw new RangeError(errors[0]);
  const sorted = [...records].sort((a, b) => a.odometerKm - b.odometerKm);
  const totals: Record<"loaded" | "empty" | "mixed" | "overall", Totals> = {
    loaded: { km: 0, litersMilli: 0, cycles: 0 },
    empty: { km: 0, litersMilli: 0, cycles: 0 },
    mixed: { km: 0, litersMilli: 0, cycles: 0 },
    overall: { km: 0, litersMilli: 0, cycles: 0 },
  };
  const fullIndexes = sorted.flatMap((record, index) => (record.full ? [index] : []));
  for (let k = 1; k < fullIndexes.length; k += 1) {
    const start = fullIndexes[k - 1];
    const end = fullIndexes[k];
    const km = sorted[end].odometerKm - sorted[start].odometerKm;
    let litersMilli = 0;
    const states = new Set<string>();
    for (let i = start + 1; i <= end; i += 1) {
      litersMilli += sorted[i].litersMilli;
      states.add(sorted[i].state);
    }
    const kind = states.size === 1 ? (states.has("loaded") ? "loaded" : "empty") : "mixed";
    for (const key of [kind, "overall"] as const) {
      totals[key].km += km;
      totals[key].litersMilli += litersMilli;
      totals[key].cycles += 1;
    }
  }
  return { loaded: toGroup(totals.loaded), empty: toGroup(totals.empty), mixed: toGroup(totals.mixed), overall: toGroup(totals.overall) };
}

/** Rendimento fora da faixa de 0,5 a 15 km/L quase sempre é erro de digitação (litros ou odômetro). */
export function isPlausibleKmPerLiter(kmPerLiterCenti: number) {
  return kmPerLiterCenti >= 50 && kmPerLiterCenti <= 1500;
}

/** 190 -> "1,90", para preencher o campo de consumo. */
export function formatKmPerLiter(kmPerLiterCenti: number) {
  return `${Math.floor(kmPerLiterCenti / 100)},${String(kmPerLiterCenti % 100).padStart(2, "0")}`;
}

/** Abastecimento guardado, com o identificador usado para não duplicar entre aparelho e banco. */
export type SyncedFuel = FuelRecord & { id: string };

/**
 * Junta o que está no aparelho com o que está no banco.
 * O banco manda: mesmo id ou mesmo odômetro já existente lá vence o do aparelho.
 * `toUpload` é o que só existe no aparelho; `conflicts` é o que foi descartado por já haver outro com o mesmo odômetro.
 */
export function planFuelSync(local: SyncedFuel[], remote: SyncedFuel[]) {
  const byId = new Map<string, SyncedFuel>();
  const byOdometer = new Map<number, SyncedFuel>();
  for (const r of remote) { byId.set(r.id, r); byOdometer.set(r.odometerKm, r); }
  const toUpload: SyncedFuel[] = [];
  const conflicts: SyncedFuel[] = [];
  for (const l of local) {
    if (byId.has(l.id)) continue;
    if (byOdometer.has(l.odometerKm)) { conflicts.push(l); continue; }
    byId.set(l.id, l); byOdometer.set(l.odometerKm, l); toUpload.push(l);
  }
  const merged = [...byId.values()].sort((a, b) => a.odometerKm - b.odometerKm);
  toUpload.sort((a, b) => a.odometerKm - b.odometerKm);
  return { merged, toUpload, conflicts };
}
