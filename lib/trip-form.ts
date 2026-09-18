import type { Trip } from "./finance";

export function initialTripForm(trip: Trip | null, history: Trip[]): Record<string, string> {
  return Object.fromEntries(Object.entries(trip ? { ...trip, freightPerTon: trip.freightPerTon ?? "", loadedWeight: trip.loadedWeight == null ? "" : trip.loadedWeight / 1000, deliveredWeight: trip.deliveredWeight == null ? "" : trip.deliveredWeight / 1000 } : { tripDate: new Date().toISOString().slice(0, 10), axles: 6, lossAlertPercent: history[0]?.lossAlertPercent ?? 10 }).map(([k, v]) => [k, v == null ? "" : String(v)]));
}

export function initialExtras(trip: Trip | null): { category: string; amount: string }[] {
  return (trip?.extraItems ?? []).map((e) => ({ ...e, amount: String(e.amount) }));
}