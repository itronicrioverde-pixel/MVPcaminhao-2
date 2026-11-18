// Cópia das medições de combustível neste aparelho, separada por conta.
// O identificador da conta vem do servidor (opaco). Sem ele, o que é lançado fica em "pendente" até a primeira conta sincronizar.
import { validateFuelRecords, type SyncedFuel } from "./fuel";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined;

const KEY_PREFIX = "rota-financeira:consumo-medido:v2:";
const LAST_OWNER_KEY = "rota-financeira:consumo-medido:conta:v2";
export const PENDING_OWNER = "pendente";

export function fuelKey(owner: string) {
  if (!/^[0-9a-z]{1,64}$/.test(owner)) throw new RangeError("conta inválida");
  return `${KEY_PREFIX}${owner}`;
}

export function loadFuel(store: Store, owner: string): SyncedFuel[] {
  try {
    const saved = JSON.parse(store?.getItem(fuelKey(owner)) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    const records = saved.filter((item): item is SyncedFuel => typeof item === "object" && item !== null && typeof (item as SyncedFuel).id === "string");
    return records.length === saved.length && validateFuelRecords(records).length === 0 ? records : [];
  } catch {
    return [];
  }
}

export function saveFuel(store: Store, owner: string, records: SyncedFuel[]) {
  try {
    store?.setItem(fuelKey(owner), JSON.stringify(records));
  } catch {
    // sem armazenamento: a medição continua nesta tela
  }
}

/** Última conta que sincronizou neste aparelho; serve só para mostrar a cópia quando não há internet. */
export function lastOwner(store: Store): string | null {
  try {
    const value = store?.getItem(LAST_OWNER_KEY) ?? null;
    return value !== null && /^[0-9a-z]{1,64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function setLastOwner(store: Store, owner: string) {
  try {
    fuelKey(owner);
    store?.setItem(LAST_OWNER_KEY, owner);
  } catch {
    // sem armazenamento
  }
}

/** Devolve o que foi lançado sem conta conhecida e esvazia a cópia pendente. */
export function claimPending(store: Store): SyncedFuel[] {
  const records = loadFuel(store, PENDING_OWNER);
  try {
    store?.removeItem(fuelKey(PENDING_OWNER));
  } catch {
    // sem armazenamento
  }
  return records;
}
