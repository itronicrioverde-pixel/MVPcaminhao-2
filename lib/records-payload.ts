import type { Trip, Expense, Revenue, Company } from "./finance";

export type RecordsPayload = { trips: Trip[]; expenses: Expense[]; revenues: Revenue[]; company: Company };

export function isRecordsPayload(value: unknown): value is RecordsPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.trips) || !Array.isArray(payload.expenses) || !Array.isArray(payload.revenues)) return false;
  const company = payload.company;
  if (typeof company !== "object" || company === null || typeof (company as { name?: unknown }).name !== "string") return false;
  return true;
}