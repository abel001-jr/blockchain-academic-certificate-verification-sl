import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function saveDocumentArchive(bytes, certificateId) {
  const filename = `${String(certificateId).replace(/[^A-Za-z0-9_-]/g, "_")}-documents.zip`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!await Sharing.isAvailableAsync()) {
    throw new Error("Document sharing is unavailable on this device. Try another supported device.");
  }
  const file = new File(Paths.cache, filename);
  file.write(new Uint8Array(bytes));
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/zip",
    dialogTitle: "Your certificate and transcript",
    UTI: "public.zip-archive",
  });
}

export function createDocumentPreview(bytes) {
  if (Platform.OS === "web") {
    const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let binary = "";
    for (let index = 0; index < data.length; index += 8192) {
      binary += String.fromCharCode(...data.subarray(index, index + 8192));
    }
    return {uri: `data:image/png;base64,${btoa(binary)}`, cleanup: () => {}};
  }
  const file = new File(Paths.cache, `credential-preview-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  file.write(new Uint8Array(bytes));
  return {uri: file.uri, cleanup: () => { try {file.delete();} catch {} }};
}
