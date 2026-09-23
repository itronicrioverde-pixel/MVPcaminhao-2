import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export function stateDir() {
  return resolve(process.env.E2E_STATE_DIR ?? join(projectRoot, ".wrangler", "e2e"));
}

export function port() {
  const value = Number.parseInt(process.env.E2E_PORT ?? "", 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8788;
}

export function baseUrl() {
  return `http://127.0.0.1:${port()}`;
}

export function wranglerCommand() {
  return {
    command: process.execPath,
    args: [
      "--import", join(projectRoot, "scripts", "sites-env.mjs"),
      join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    ],
  };
}

export function migrationFiles() {
  const files = readdirSync(join(projectRoot, "drizzle"))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  if (files.length === 0) {
    throw new Error("Nenhuma migração em drizzle/ para aplicar.");
  }
  return files;
}