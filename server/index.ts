import { spawn } from "child_process";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function spawnProc(label: string, cmd: string, args: string[], cwd: string) {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
  });
  proc.on("error", (err) => console.error(`[${label}] Failed to start:`, err.message));
  proc.on("exit", (code) => console.log(`[${label}] Exited with code ${code}`));
  return proc;
}

// 1. Start the gateway WebSocket server (port 8080)
spawnProc("gateway", "node", [path.join(root, "gateway-server.js")], root);

// 2. Start the OpenClaw control UI via Vite (port 5000)
//    Uses ui/vite.config.ts which has correct optimizeDeps, proxy (/ws→8080), and stubs
spawnProc("ui", "node", ["node_modules/.bin/vite", "--host", "0.0.0.0"], path.join(root, "ui"));

// Keep the process alive and forward signals to children
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
