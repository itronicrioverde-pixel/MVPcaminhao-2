import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { migrationFiles, projectRoot, stateDir, wranglerCommand } from "./e2e-common.mjs";

const config = join(projectRoot, "dist", "server", "wrangler.json");
if (!existsSync(config)) {
  console.error("Build output missing:", config);
  console.error("Rode `npm run build` antes dos testes de navegador.");
  process.exit(1);
}

rmSync(stateDir(), { recursive: true, force: true });
mkdirSync(stateDir(), { recursive: true });

for (const file of migrationFiles()) {
  const sql = join(projectRoot, "drizzle", file);
  if (!existsSync(sql)) {
    console.error("Migração ausente:", sql);
    process.exit(1);
  }
  console.log(`Aplicando migração ${file} em ${stateDir()}`);
  const { command, args } = wranglerCommand();
  const result = spawnSync(command, [
    ...args,
    "d1", "execute", "DB",
    "--local",
    "--config", config,
    "--persist-to", stateDir(),
    "--file", sql,
  ], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`E2E: estado local isolado (D1+R2) migrado em ${stateDir()}`);