import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const chainDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const stateFile = join(chainDirectory, ".local-chain", "anvil-state.json");

export function anvilExecutable() {
  const binary = process.platform === "win32" ? "anvil.exe" : "anvil";
  const foundry = join(homedir(), ".foundry", "bin", binary);
  return existsSync(foundry) ? foundry : binary;
}

export function anvilArguments({ file = stateFile, port = 8545, interval = 5 } = {}) {
  return ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--accounts", "20",
    ...(existsSync(file) ? ["--load-state", file] : []),
    "--dump-state", `${file}.pending`, "--state-interval", String(interval), "--preserve-historical-states"];
}
