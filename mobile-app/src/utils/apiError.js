export function apiErrorData(error) {
  const data = error?.response?.data;
  const parse = text => { const value = JSON.parse(text); return value && typeof value === "object" ? value : {}; };
  if (data && typeof data === "object" && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return data;
  try {
    if (typeof data === "string") return parse(data);
    if (data && typeof TextDecoder !== "undefined") return parse(new TextDecoder().decode(data));
    if (data && data.byteLength <= 8192) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return parse(decodeURIComponent(Array.from(bytes, byte => `%${byte.toString(16).padStart(2, "0")}`).join("")));
    }
  } catch { /* A non-JSON failure still gets a useful message. */ }
  return {};
}

export function apiErrorMessage(error, fallback = "The request could not be completed. Please try again.") {
  const data = apiErrorData(error);
  const status = error?.response?.status;
  if (data.captcha_required) return "Complete the security check on the verification website, or sign in to verify in the app.";
  if (status === 429) {
    const wait = error.response?.headers?.["retry-after"];
    return `Too many requests. ${wait && /^\d+$/.test(String(wait)) ? `Wait ${wait} seconds before trying again.` : "Wait a moment before trying again."}`;
  }
  if (status >= 500) return "The service is temporarily unavailable. Please try again shortly.";
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "The server took too long to respond. Check your connection and try again.";
  if (!error?.response && error?.isAxiosError) return "Cannot reach the server. Check your connection and the app's server address.";
  if (typeof data.detail === "string") return data.detail;
  if (typeof data.message === "string") return data.message;
  if (status === 401) return "Your session has ended. Sign in again to continue.";
  if (status === 403) return "You do not have access to this action.";
  return error?.userMessage || (!error?.isAxiosError && error?.message) || fallback;
}

export function claimErrorMessage(error) {
  const detail = String(apiErrorData(error).detail || "");
  if (/expired/i.test(detail)) return "This invitation has expired. Ask your institution for a new invitation.";
  if (/already.*used/i.test(detail)) return "This invitation has already been used. Sign in with your linked Google account, or ask your institution for a new invitation.";
  if (!error?.response && error?.isAxiosError) return "We could not confirm whether your invitation was claimed. Check your connection. If the link is now used, sign in with linked Google or ask your institution for a new invitation.";
  return apiErrorMessage(error, "Could not claim this invitation. Check the full link and try again.");
}
