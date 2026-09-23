import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../../scripts/e2e-common.mjs";

const pidFile = join(projectRoot, ".e2e", "server.json");

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* best effort */ }
    return;
  }
  for (const target of [-pid, pid]) {
    try { process.kill(target, "SIGKILL"); } catch { /* já encerrado */ }
  }
}

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