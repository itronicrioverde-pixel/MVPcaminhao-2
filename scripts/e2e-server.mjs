import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { baseUrl, port, projectRoot, stateDir, wranglerCommand } from "./e2e-common.mjs";

const config = join(projectRoot, "dist", "server", "wrangler.json");
if (!existsSync(config)) {
  console.error("Build output missing:", config);
  console.error("Rode `npm run build` antes de iniciar o servidor E2E.");
  process.exit(1);
}

const waitForReady = process.argv.includes("--wait");
const { command, args } = wranglerCommand();

const child = spawn(command, [
  ...args,
  "dev",
  "--config", config,
  "--local",
  "--persist-to", stateDir(),
  "--ip", "127.0.0.1",
  "--inspector-port", "0",
  "--port", String(port()),
], { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] });

function stop(signal = "SIGTERM") {
  try { child.kill(signal); } catch { /* already gone */ }
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("error", (error) => {
  console.error("Falha ao iniciar o servidor E2E:", error.message);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));

if (waitForReady) {
  const deadline = Date.now() + 180_000;
  const probe = async () => {
    try {
      const response = await fetch(`${baseUrl()}/api/records`, { signal: AbortSignal.timeout(3000) });
      if (response.status > 0) {
        console.log(`READY ${baseUrl()}`);
        return;
      }
    } catch { /* servidor ainda subindo */ }
    if (Date.now() > deadline) {
      console.error(`Servidor não respondeu em ${baseUrl()} dentro de 180s.`);
      stop("SIGKILL");
      process.exit(1);
    }
    setTimeout(probe, 400);
  };
  void probe();
}

console.log(`Servidor E2E em ${baseUrl()} (estado: ${stateDir()}, porta ${port()})`);