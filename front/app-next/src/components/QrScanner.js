"use client";
"use no memo";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { parseCertificateIdFromScan } from "@/lib/parseCertificateScan";

async function decodeFromCanvas(canvas) {
  if (typeof BarcodeDetector !== "undefined") {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(canvas);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch {
      // fall through to jsQR
    }
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const jsQR = (await import("jsqr")).default;
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return result?.data || "";
}

async function decodeFromFile(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return decodeFromCanvas(canvas);
}

export default function QrScanner({ open, onClose, onScan }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const closedRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState("");
  const [fileBusy, setFileBusy] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const emitScan = useCallback(
    (raw) => {
      const id = parseCertificateIdFromScan(raw);
      if (!id) return false;
      closedRef.current = true;
      stopCamera();
      onScanRef.current(id);
      onCloseRef.current();
      return true;
    },
    [stopCamera],
  );

  useEffect(() => {
    if (!open) return;
    closedRef.current = false;
    setError("");

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        let detecting = false;
        const tick = async () => {
          if (cancelled || closedRef.current) return;
          const videoEl = videoRef.current;
          const canvas = canvasRef.current;
          if (!detecting && videoEl && canvas && videoEl.readyState >= 2) {
            const w = videoEl.videoWidth;
            const h = videoEl.videoHeight;
            if (w && h) {
              detecting = true;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(videoEl, 0, 0, w, h);
              try {
                const raw = await decodeFromCanvas(canvas);
                if (raw && emitScan(raw)) return;
              } catch {
                // keep scanning
              } finally {
                detecting = false;
              }
            }
          }
          if (!cancelled && !closedRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setError("Camera access was blocked. Upload a photo of the QR code instead.");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, emitScan, stopCamera]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileBusy(true);
    setError("");
    try {
      const raw = await decodeFromFile(file);
      if (!emitScan(raw)) setError("No QR code found in that image.");
    } catch {
      setError("Could not read that image.");
    } finally {
      setFileBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[#08283F]/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E1D6]">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-[#08283F]" />
            <h3 className="text-[#08283F] font-semibold text-base">Scan certificate QR</h3>
          </div>
          <button
            type="button"
            onClick={() => { closedRef.current = true; stopCamera(); onClose(); }}
            className="p-1.5 rounded-lg hover:bg-[#EAF2FB] text-[#4A5A68]"
            aria-label="Close scanner"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative bg-black aspect-square">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[62%] h-[62%] rounded-xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-[#4A5A68] text-sm">
            Point the camera at the QR on a Credence certificate — works for system-designed and uploaded certificates.
          </p>
          {error && <p className="text-[#A23B34] text-sm">{error}</p>}
          <label className="cd-btn-secondary cursor-pointer justify-center">
            <ImagePlus size={15} />
            {fileBusy ? "Reading image…" : "Upload QR photo"}
            <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </label>
        </div>
      </div>
    </div>
  );
}
