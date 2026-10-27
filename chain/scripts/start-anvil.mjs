import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { anvilExecutable, anvilArguments, stateFile } from "./anvil-config.mjs";
import { prepareState, promoteCheckpoint } from "./anvil-state.mjs";

const available = await new Promise(resolve => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen(8545, "127.0.0.1", () => probe.close(() => resolve(true)));
});
if (!available) {
  console.error("Port 8545 is already in use. Stop the existing Hardhat/Anvil node in its terminal, then run this command again. No process was stopped.");
  process.exitCode = 1;
} else {
  mkdirSync(dirname(stateFile), { recursive: true });
  try { prepareState(stateFile); } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Persistent Anvil state: ${stateFile}`);
  console.log("State is restored at startup and checkpointed every 5 seconds. Use this same command and state file after restarting.");
  const child = spawn(anvilExecutable(), anvilArguments(), { stdio: "inherit", windowsHide: true });
  const checkpoint = () => {
    try { promoteCheckpoint(stateFile); }
    catch (error) { console.error(`Could not save checkpoint: ${error.message}`); }
  };
  const timer = setInterval(checkpoint, 1000);
  timer.unref();
  child.once("error", error => { console.error(`Could not start Anvil: ${error.message}`); process.exitCode = 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { if (child.exitCode === null) child.kill(signal); });
  child.once("exit", code => { clearInterval(timer); checkpoint(); process.exitCode = code ?? 0; });
}
