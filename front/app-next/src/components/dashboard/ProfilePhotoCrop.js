"use client";
import { useEffect, useRef, useState } from "react";

export default function ProfilePhotoCrop({ file, onApply, onCancel }) {
  const dialog = useRef(null);
  const canvas = useRef(null);
  const image = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    dialog.current.showModal();
    const url = URL.createObjectURL(file);
    const photo = new Image();
    photo.onload = () => { image.current = photo; setReady(true); };
    photo.onerror = () => setError("This image could not be opened. Please choose another photo.");
    photo.src = url;
    return () => { photo.onload = null; photo.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    if (!ready) return;
    const photo = image.current;
    const side = Math.min(photo.naturalWidth, photo.naturalHeight) / zoom;
    const x = (photo.naturalWidth - side) * horizontal / 100;
    const y = (photo.naturalHeight - side) * vertical / 100;
    canvas.current.getContext("2d").drawImage(photo, x, y, side, side, 0, 0, 512, 512);
  }, [ready, zoom, horizontal, vertical]);

  useEffect(() => {
    const preview = canvas.current;
    function handleWheel(event) {
      if (!ready || processing) return;
      // Browsers expose touchpad pinch gestures as Ctrl + wheel events.
      // Keep ordinary two-finger scrolling available for the dialog.
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? preview.clientHeight : 1);
      setZoom(value => Math.max(1, Math.min(3, value * Math.exp(-delta * 0.01))));
    }
    preview.addEventListener("wheel", handleWheel, { passive: false });
    return () => preview.removeEventListener("wheel", handleWheel);
  }, [ready, processing]);

  function apply() {
    setProcessing(true);
    canvas.current.toBlob(blob => {
      if (!blob) { setError("Unable to crop this photo. Please try again."); setProcessing(false); return; }
      onApply(new File([blob], "profile-photo.png", { type: "image/png" }));
    }, "image/png");
  }

  function reposition(axis, value) {
    const photo = image.current;
    if (!photo) return;
    const side = Math.min(photo.naturalWidth, photo.naturalHeight) / zoom;
    const dimension = axis === "horizontal" ? photo.naturalWidth : photo.naturalHeight;
    // At 100%, a portrait's width (or a landscape's height) fills the crop
    // exactly. Create some travel instead of leaving its slider ineffective.
    if (dimension - side < 1 && value !== 50) setZoom(1.2);
    if (axis === "horizontal") setHorizontal(value);
    else setVertical(value);
  }

  function startDrag(event) {
    if (!ready || processing) return;
    const photo = image.current;
    const side = Math.min(photo.naturalWidth, photo.naturalHeight) / zoom;
    drag.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      horizontal, vertical, side,
      width: photo.naturalWidth, height: photo.naturalHeight,
      displaySize: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const clamp = value => Math.max(0, Math.min(100, value));
    const scale = start.side / start.displaySize;
    if (start.width > start.side) setHorizontal(clamp(start.horizontal - (event.clientX - start.x) * scale / (start.width - start.side) * 100));
    if (start.height > start.side) setVertical(clamp(start.vertical - (event.clientY - start.y) * scale / (start.height - start.side) * 100));
  }

  function endDrag(event) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <dialog ref={dialog} aria-labelledby="photo-crop-title" onCancel={event => { event.preventDefault(); if (!processing) onCancel(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#E4E1D6] bg-[#F8F7F2] p-5 text-[#08283F] shadow-xl backdrop:bg-black/60">
    <h3 id="photo-crop-title" className="text-xl font-semibold">Crop profile photo</h3>
    <p className="mt-2 text-sm text-[#4A5A68]">Drag the image or use the sliders to frame your face. Pinch your touchpad over the preview to zoom, or use + and −. If needed, moving a slider zooms in slightly to make room. Your photo uploads when you save your profile.</p>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    <canvas ref={canvas} width={512} height={512} role="img" aria-label="Cropped profile photo preview. Drag to reposition, or use the position sliders below." onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }} className="mx-auto my-4 aspect-square w-full max-w-64 rounded-2xl bg-[#E4E1D6]" />
    {!ready && !error && <p role="status">Opening photo…</p>}
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">Zoom</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Zoom out" className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E4E1D6] bg-white text-2xl disabled:opacity-40" disabled={!ready || processing || zoom <= 1} onClick={() => setZoom(value => Math.max(1, Math.round((value - 0.1) * 10) / 10))}>−</button>
          <output aria-live="polite" className="min-w-12 text-center text-sm font-semibold tabular-nums">{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="Zoom in" className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E4E1D6] bg-white text-2xl disabled:opacity-40" disabled={!ready || processing || zoom >= 3} onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.1) * 10) / 10))}>+</button>
        </div>
      </div>
      {[["Horizontal position", horizontal, "horizontal"], ["Vertical position", vertical, "vertical"]].map(([label, value, axis]) => <label key={label} className="block text-sm font-semibold">{label}<input type="range" min={0} max={100} step={1} value={value} disabled={!ready || processing} onChange={event => reposition(axis, Number(event.target.value))} className="mt-2 block w-full accent-[#780110]" /></label>)}
    </div>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" className="cred-btn cred-btn-primary" disabled={!ready || processing} onClick={apply}>{processing ? "Preparing…" : "Use cropped photo"}</button>
      <button type="button" className="cred-btn cred-btn-secondary" disabled={processing} onClick={onCancel}>Cancel</button>
    </div>
  </dialog>;
}
