import { apiErrorData, apiErrorMessage } from "./apiError";

export function verificationFailure(error) {
  const data = apiErrorData(error);
  if (error?.response?.status === 404 && data?.verification_outcome === "not_found") {
    return { ...data, error: data.message || "No certificate found with this ID." };
  }
  return {
    verification_outcome: "unavailable",
    requires_web: Boolean(data.captcha_required),
    error: apiErrorMessage(error, "We could not check this credential. Check your connection and try again."),
  };
}
