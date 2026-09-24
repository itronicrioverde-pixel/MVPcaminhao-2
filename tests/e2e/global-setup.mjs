import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { baseUrl, killTree, port, projectRoot, stateDir } from "../../scripts/e2e-common.mjs";

const runtimeDir = join(projectRoot, ".e2e");
const pidFile = join(runtimeDir, "server.json");
const logFile = join(runtimeDir, "server.log");
const buildConfig = join(projectRoot, "dist", "server", "wrangler.json");
const serverScript = join(projectRoot, "scripts", "e2e-server.mjs");

function ensureBuild() {
  if (existsSync(buildConfig)) return;
  console.log("E2E: artefato de build ausente; executando npm run build…");
  const result = spawnSync(process.execPath, [
    join(projectRoot, "scripts", "run-framework.mjs"), "build",
  ], { cwd: projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("npm run build falhou durante o setup E2E.");
}

function applyMigrations() {
  console.log("E2E: limpando o estado local e aplicando migrações D1 (estado isolado).");
  const result = spawnSync(process.execPath, [
    join(projectRoot, "scripts", "e2e-migrate.mjs"),
  ], { cwd: projectRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Falha ao aplicar as migrações E2E.");
}

async function waitForServer(deadline, assertAlive) {
  let delay = 500;
  while (Date.now() < deadline) {
    assertAlive();
    try {
      const response = await fetch(`${baseUrl()}/api/records`, { signal: AbortSignal.timeout(3000) });
      if (response.status > 0) return;
    } catch { /* servidor ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 250, 2000);
  }
  throw new Error(`Servidor E2E não respondeu em ${baseUrl()} dentro do tempo limite.`);
}

export default async function globalSetup() {
  ensureBuild();
  applyMigrations();
  mkdirSync(runtimeDir, { recursive: true });

  const server = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk.toString(); });
  server.stderr.on("data", (chunk) => { log += chunk.toString(); });
  const flushLog = () => { try { writeFileSync(logFile, log); } catch { /* melhor esforço */ } };
  const logTimer = setInterval(flushLog, 2000);

  let exited = null;
  server.on("exit", (code, signal) => { exited = { code, signal }; });

  try {
    writeFileSync(pidFile, JSON.stringify({ pid: server.pid, port: port(), baseUrl: baseUrl(), stateDir: stateDir() }));
    await waitForServer(Date.now() + 180_000, () => {
      if (exited !== null) {
        throw new Error(`Servidor E2E encerrou cedo (code=${exited.code}, signal=${exited.signal}).`);
      }
    });
    console.log(`E2E: servidor pronto em ${baseUrl()}`);
  } catch (error) {
    flushLog();
    console.error("E2E: falha ao subir o servidor. Fim do log:\n" + (log.split("\n").slice(-80).join("\n")));
    killTree(server.pid);
    try { rmSync(pidFile, { force: true }); } catch { /* melhor esforço */ }
    throw error;
  } finally {
    clearInterval(logTimer);
    flushLog();
  }
}