/**
 * Render a typed name as a PNG blob (cosmetic signature for certificates).
 * Transparent background; dark ink colour.
 */
export async function renderTypedSignature(name, { color = "#022448" } = {}) {
  const text = (name || "").trim();
  if (!text) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = 'italic 38px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export function shortTxHash(hash) {
  if (!hash || hash.length < 14) return hash || "";
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

export function formatVerifiedDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}
