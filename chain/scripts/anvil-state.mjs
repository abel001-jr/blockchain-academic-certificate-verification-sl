import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export function validState(file) {
  if (!existsSync(file)) return false;
  try {
    const state = JSON.parse(readFileSync(file, "utf8"));
    return state !== null && typeof state === "object" && !Array.isArray(state) && "accounts" in state;
  } catch { return false; }
}

export function promoteCheckpoint(file) {
  const pending = `${file}.pending`;
  if (!validState(pending)) return false;
  if (validState(file)) {
    copyFileSync(file, `${file}.bak.tmp`);
    renameSync(`${file}.bak.tmp`, `${file}.bak`);
  }
  // Anvil may be writing pending again, so validate the copied bytes too.
  const bytes = readFileSync(pending);
  writeFileSync(`${file}.tmp`, bytes);
  if (!validState(`${file}.tmp`)) return false;
  renameSync(`${file}.tmp`, file);
  return true;
}

export function prepareState(file) {
  if (!existsSync(file) || validState(file)) return;
  const recovery = [`${file}.pending`, `${file}.bak`].find(validState);
  if (!recovery) throw new Error(`Checkpoint is truncated or invalid: ${file}. Restore a complete backup before starting. The damaged file has been preserved.`);
  copyFileSync(file, `${file}.corrupt-${Date.now()}`);
  copyFileSync(recovery, file);
  console.warn(`Recovered Anvil state from ${recovery}; the damaged checkpoint was archived. Recent transactions may need resubmission.`);
}
