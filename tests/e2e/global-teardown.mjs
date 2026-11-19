import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { killTree, projectRoot } from "../../scripts/e2e-common.mjs";

const pidFile = join(projectRoot, ".e2e", "server.json");

export default async function globalTeardown() {
  if (!existsSync(pidFile)) return;
  try {
    const { pid } = JSON.parse(readFileSync(pidFile, "utf8"));
    killTree(pid);
  } catch (error) {
    console.warn("Não foi possível encerrar o servidor E2E:", String(error));
  }
  rmSync(pidFile, { force: true });
}