/**
 * One-time temp passwords are never stored in Django (only hashed).
 * After create / resend, stash briefly in sessionStorage for the detail UI.
 */

const key = (officerId) => `credence_officer_temp_${officerId}`;

export function stashOfficerTempPassword(officerId, tempPassword) {
  if (typeof window === "undefined" || !officerId || !tempPassword) return;
  try {
    sessionStorage.setItem(
      key(officerId),
      JSON.stringify({ password: tempPassword, at: Date.now() }),
    );
  } catch { /* ignore quota */ }
}

export function readOfficerTempPassword(officerId) {
  if (typeof window === "undefined" || !officerId) return null;
  try {
    const raw = sessionStorage.getItem(key(officerId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.password || null;
  } catch {
    return null;
  }
}

export function clearOfficerTempPassword(officerId) {
  if (typeof window === "undefined" || !officerId) return;
  try {
    sessionStorage.removeItem(key(officerId));
  } catch { /* ignore */ }
}

export function officerInviteShareText({ officer, tempPassword, loginUrl }) {
  const role = officer?.role === "vc" ? "Vice Chancellor" : "Dean";
  const name = `${officer?.first_name || ""} ${officer?.last_name || ""}`.trim();
  return (
    `CREDENCE officer invite\n` +
    `Name: ${name}\n` +
    `Role: ${role}\n` +
    `Email: ${officer?.email}\n` +
    `Temporary password: ${tempPassword}\n` +
    `Login: ${loginUrl || "http://localhost:3000/login"}\n\n` +
    `After login: connect MetaMask (free signature) and set a permanent password.`
  );
}
