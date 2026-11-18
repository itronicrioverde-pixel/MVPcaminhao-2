// Cópia das medições de combustível neste aparelho, separada por conta.
// O identificador da conta vem do servidor (opaco). Sem ele, nada é lido nem guardado: a cópia é só um reforço de quem já foi confirmado.
import { validateFuelRecords, type SyncedFuel } from "./fuel";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined;

const KEY_PREFIX = "rota-financeira:consumo-medido:v2:";

export function fuelKey(owner: string) {
  if (!/^[0-9a-z]{1,64}$/.test(owner)) throw new RangeError("conta inválida");
  return `${KEY_PREFIX}${owner}`;
}

/** Lê a cópia da conta. Um registro inválido ou repetido é descartado sozinho; os outros ficam. */
export function loadFuel(store: Store, owner: string): SyncedFuel[] {
  let saved: unknown;
  try {
    saved = JSON.parse(store?.getItem(fuelKey(owner)) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(saved)) return [];
  const odometers = new Set<number>();
  const ids = new Set<string>();
  const records: SyncedFuel[] = [];
  for (const item of saved) {
    if (typeof item !== "object" || item === null || typeof (item as SyncedFuel).id !== "string") continue;
    const record = item as SyncedFuel;
    if (validateFuelRecords([record]).length > 0 || odometers.has(record.odometerKm) || ids.has(record.id)) continue;
    odometers.add(record.odometerKm);
    ids.add(record.id);
    records.push(record);
  }
  return records;
}

export function saveFuel(store: Store, owner: string, records: SyncedFuel[]) {
  try {
    store?.setItem(fuelKey(owner), JSON.stringify(records));
  } catch {
    // sem armazenamento: a medição continua nesta tela
  }
}
