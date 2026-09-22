import { z } from "zod";
import { tripSchema, expenseSchema, revenueSchema, companySchema, amount } from "./finance";
import type { Trip, Expense, Revenue, Company } from "./finance";

const id = z.string().min(1).max(300);
const logoKey = z.string().nullable().optional();

export const recordsPayloadSchema = z.object({
  trips: z.array(tripSchema.extend({ id }).extend({ extras: amount })),
  expenses: z.array(expenseSchema.extend({ id })),
  revenues: z.array(revenueSchema.extend({ id })),
  company: companySchema.extend({ logoKey }),
});

export type RecordsPayload = { trips: Trip[]; expenses: Expense[]; revenues: Revenue[]; company: Company };

export function parseRecordsPayload(value: unknown): RecordsPayload | null {
  const result = recordsPayloadSchema.safeParse(value);
  return result.success ? result.data : null;
}