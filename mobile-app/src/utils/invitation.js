// Shared by pasted invitations and links opened by the operating system.
export function parseInviteToken(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Paste your invitation link or token first.");
  const match = raw.match(/[?&]token=([^&#\s]*)/);
  let token = raw;
  try {
    if (match) token = decodeURIComponent(match[1]);
  } catch {
    throw new Error("This invitation link is malformed. Copy the full link again.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("This invitation is missing a valid token. Copy the full link again.");
  }
  return token;
}

export function isInvitationUrl(value) {
  return /^(?:credence:\/\/student-invite|https?:\/\/[^/]+\/student-invite)(?:[?#]|\/?$)/i.test(String(value ?? ""));
}
