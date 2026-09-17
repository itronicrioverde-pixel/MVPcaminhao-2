import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  tripDate: text("trip_date").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  clientName: text("client_name").notNull().default("Cliente não informado"),
  cargoType: text("cargo_type").notNull().default("Carga geral"),
  lossAlertPercent: real("loss_alert_percent").notNull().default(10),
  freightPerTon: real("freight_per_ton"),
  freight: real("freight").notNull().default(0),
  driverPercent: real("driver_percent").notNull().default(0),
  km: integer("km").notNull().default(0),
  oil: real("oil").notNull().default(0),
  diesel: real("diesel").notNull().default(0),
  toll: real("toll").notNull().default(0),
  extras: real("extras").notNull().default(0),
  extraItems: text("extra_items").notNull().default("[]"),
  axles: integer("axles").notNull().default(6),
  loadedWeight: real("loaded_weight"),
  deliveredWeight: real("delivered_weight"),
  status: text("status").notNull().default("Concluído"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_trips_owner_date").on(table.ownerId, table.tripDate)]);

export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expenseDate: text("expense_date").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: real("amount").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_expenses_owner_date").on(table.ownerId, table.expenseDate)]);

export const revenues = sqliteTable("revenues", {
 id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
 revenueDate: text("revenue_date").notNull(), description: text("description").notNull(),
 category: text("category").notNull(), amount: real("amount").notNull(),
 createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, t => [index("idx_revenues_owner_date").on(t.ownerId, t.revenueDate)]);
export const companies = sqliteTable("companies", {
 ownerId: text("owner_id").primaryKey(), name: text("name").notNull().default("Rota Financeira"),
 cnpj: text("cnpj").notNull().default(""), logoKey: text("logo_key"),
});
export const routeLimits = sqliteTable("route_limits", {
 id: text("id").primaryKey(), nextAt: integer("next_at").notNull(),
});
