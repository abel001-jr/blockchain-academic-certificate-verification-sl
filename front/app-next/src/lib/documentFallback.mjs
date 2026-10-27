export function scheduleDocumentFallback(onFallback) {
  let message = "IPFS is taking too long. Opening the saved copy with an integrity check.";
  const timer = setTimeout(() => onFallback(message), 4000);
  return {
    setMessage(value) { message = value; },
    cancel() { clearTimeout(timer); },
  };
}
