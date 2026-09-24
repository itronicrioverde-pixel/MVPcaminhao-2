import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

const STATE_REL_PREFIX = ".wrangler/e2e";

export function stateDir() {
  const configured = process.env.E2E_STATE_DIR ?? join(projectRoot, ".wrangler", "e2e");
  const dir = resolve(configured);
  const rel = relative(projectRoot, dir).replaceAll(sep, "/");
  const allowed = rel === STATE_REL_PREFIX || rel.startsWith(`${STATE_REL_PREFIX}/`);
  if (!allowed) {
    throw new Error(
      `E2E_STATE_DIR precisa ser "${STATE_REL_PREFIX}" ou uma subpasta dentro de ${projectRoot} (recebido: ${dir}).`,
    );
  }
  return dir;
}

export function port() {
  const value = Number.parseInt(process.env.E2E_PORT ?? "", 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8788;
}

export function baseUrl() {
  const configured = process.env.E2E_BASE_URL;
  const targetPort = port();
  if (!configured) return `http://127.0.0.1:${targetPort}`;
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error(`E2E_BASE_URL inválida: ${configured}`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const urlPort = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (url.protocol !== "http:" || !localHost || urlPort !== targetPort || url.pathname !== "/") {
    throw new Error(
      `E2E_BASE_URL precisa apontar para o servidor local iniciado pelo setup na porta ${targetPort} (recebido: ${configured}).`,
    );
  }
  const href = url.href;
  return href.endsWith("/") ? href.slice(0, -1) : href;
}

export function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* melhor esforço */ }
    return;
  }
  for (const target of [-pid, pid]) {
    try { process.kill(target, "SIGKILL"); } catch { /* já encerrado */ }
  }
}

export function wranglerCommand() {
  return {
    command: process.execPath,
    args: [
      "--import", pathToFileURL(join(projectRoot, "scripts", "sites-env.mjs")).href,
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