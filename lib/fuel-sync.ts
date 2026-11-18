// Sincronização das medições de combustível entre o aparelho e o banco.
// Regra central: só se mostra e só se envia o que é da conta que o servidor confirmou.
// Se o servidor não confirma quem é (erro, tempo esgotado, sessão expirada, resposta fora do formato), nada local é lido nem mostrado.
import { planFuelSync, type SyncedFuel } from "./fuel";
import { fuelKey, loadFuel, saveFuel } from "./fuel-store";

export type FuelApi = {
  list(): Promise<{ ownerKey: string; records: SyncedFuel[]; deleted: string[] }>;
  upload(records: SyncedFuel[]): Promise<unknown>;
};

/** "rejected": o servidor recusou (erro 4xx); tentar de novo igual não adianta. "transient": conexão ou servidor, vale tentar depois. */
export type UploadFailure = "rejected" | "transient";

export type SyncOutcome =
  | { kind: "unverified"; reason: "session" | "offline" }
  | {
      kind: "verified";
      owner: string;
      records: SyncedFuel[];
      /** Ids que existem só neste aparelho porque o envio não foi aceito. */
      pendingIds: string[];
      uploadFailure: UploadFailure | null;
      conflicts: number;
      removed: number;
    };

type Store = Parameters<typeof loadFuel>[0];

/** Tamanho de cada envio: abaixo do limite do servidor. */
export const UPLOAD_CHUNK = 200;

const isRecord = (value: unknown): value is SyncedFuel =>
  typeof value === "object" && value !== null && typeof (value as SyncedFuel).id === "string" && Number.isSafeInteger((value as SyncedFuel).odometerKm) && Number.isSafeInteger((value as SyncedFuel).litersMilli);

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

export async function syncFuel(api: FuelApi, store: Store): Promise<SyncOutcome> {
  try {
    const remote = await api.list();
    if (!remote || typeof remote.ownerKey !== "string" || !Array.isArray(remote.records) || !remote.records.every(isRecord) || !Array.isArray(remote.deleted) || !remote.deleted.every((id) => typeof id === "string")) {
      return { kind: "unverified", reason: "offline" };
    }
    fuelKey(remote.ownerKey); // dono em formato estranho: não vira chave de armazenamento
    const owner = remote.ownerKey;
    const plan = planFuelSync(loadFuel(store, owner), remote.records, remote.deleted);
    // a cópia local é guardada antes de enviar: se o envio falhar, nada do que está pendente se perde
    saveFuel(store, owner, plan.merged);
    const pending = new Set<string>();
    let uploadFailure: UploadFailure | null = null;
    for (let start = 0; start < plan.toUpload.length; start += UPLOAD_CHUNK) {
      const chunk = plan.toUpload.slice(start, start + UPLOAD_CHUNK);
      if (uploadFailure !== null) {
        chunk.forEach((record) => pending.add(record.id));
        continue;
      }
      try {
        await api.upload(chunk);
      } catch (error) {
        const status = statusOf(error);
        uploadFailure = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429 ? "rejected" : "transient";
        chunk.forEach((record) => pending.add(record.id));
      }
    }
    return { kind: "verified", owner, records: plan.merged, pendingIds: [...pending], uploadFailure, conflicts: plan.conflicts.length, removed: plan.removed.length };
  } catch (error) {
    return { kind: "unverified", reason: statusOf(error) === 401 ? "session" : "offline" };
  }
}
