"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { templateFontStyle } from "@/lib/templateFonts";
import { fieldLabel } from "./templateFieldGroups";
import { drawField, moveField, resizeField, overlappingFields } from "@/lib/templateGeometry.mjs";

const name = key => key.replaceAll("_", " ");
const buttonStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 36, border: "1px solid #DADDDC", borderRadius: 7, padding: "8px 11px", background: "white", color: "#08283F", fontSize: 11, fontWeight: 600, lineHeight: 1.4 };

export default function TemplateCanvas({ fields, selected, page, pageUrl, pageInfo, onEditText, disabled, onSelect, onChange, onEdit, onRemove, onUndo, onRedo, canUndo, canRedo }) {
  const viewport = useRef(null), surface = useRef(null), gesture = useRef(null);
  const [baseWidth, setBaseWidth] = useState(800);
  const [zoom, setZoom] = useState(100);
  const [tool, setTool] = useState("select");
  const [showLabels, setShowLabels] = useState(false);
  const [tooltipsEnabled, setTooltipsEnabled] = useState(false);
  const [hovered, setHovered] = useState(null);
  const tooltipId = useId();
  function showSummary(event, index) {
    if (!tooltipsEnabled || tool !== "select" || gesture.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    setHovered({index, left: Math.max(8, Math.min(box.left, window.innerWidth - 288)),
      top: Math.max(8, Math.min(box.bottom + 10, window.innerHeight - 190))});
  }
  const summaryField = hovered ? fields[hovered.index] : null;
  useEffect(() => {
    const hideSummary = () => setHovered(null);
    window.addEventListener("scroll", hideSummary, true);
    window.addEventListener("resize", hideSummary);
    return () => {
      window.removeEventListener("scroll", hideSummary, true);
      window.removeEventListener("resize", hideSummary);
    };
  }, []);
  const [draft, setDraft] = useState(null);
  const collisions = overlappingFields(fields);

  useEffect(() => {
    const observer = new ResizeObserver(entries => setBaseWidth(Math.max(200, entries[0].contentRect.width - 32)));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  function point(event) {
    const rect = surface.current.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }
  function start(event, index, kind, handle) {
    if (event.button !== 0) return;
    setHovered(null);
    if (disabled && kind !== "pan") return;
    event.stopPropagation();
    event.preventDefault();
    surface.current.focus({ preventScroll: true });
    surface.current.setPointerCapture(event.pointerId);
    if (index != null) onSelect(index);
    gesture.current = { kind, index, handle, start: point(event), original: fields[index], pointer: { x: event.clientX, y: event.clientY }, scroll: { left: viewport.current.scrollLeft, top: viewport.current.scrollTop } };
  }
  function move(event) {
    const action = gesture.current;
    if (!action) return;
    if (action.kind === "pan") {
      viewport.current.scrollLeft = action.scroll.left - (event.clientX - action.pointer.x);
      viewport.current.scrollTop = action.scroll.top - (event.clientY - action.pointer.y);
      return;
    }
    const end = point(event), dx = end.x - action.start.x, dy = end.y - action.start.y;
    const field = action.kind === "draw" ? drawField(action.original, action.start, end, page) : action.kind === "resize" ? resizeField(action.original, dx, dy, action.handle) : moveField(action.original, dx, dy);
    setDraft({ index: action.index, field });
  }
  function finish(event) {
    const action = gesture.current;
    if (action && action.kind !== "pan") {
      const end = point(event), dx = end.x - action.start.x, dy = end.y - action.start.y;
      const value = action.kind === "draw" ? drawField(action.original, action.start, end, page) : action.kind === "resize" ? resizeField(action.original, dx, dy, action.handle) : moveField(action.original, dx, dy);
      if ((dx !== 0 || dy !== 0) && value.width >= .01 && value.height >= .005) onChange(fields.map((field, index) => index === action.index ? value : field));
    }
    gesture.current = null;
    setDraft(null);
    if (surface.current.hasPointerCapture(event.pointerId)) surface.current.releasePointerCapture(event.pointerId);
    if (action?.kind === "draw") setTool("select");
  }
  function keyboard(event) {
    if (event.key === "Escape") setHovered(null);
    if (disabled || /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? onRedo() : onUndo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); onRedo(); return; }
    if (event.key === "Escape") { gesture.current = null; setDraft(null); setTool("select"); return; }
    if (!fields[selected] || fields[selected].page !== page) return;
    if (["Delete", "Backspace", "x", "X"].includes(event.key)) { event.preventDefault(); onRemove(selected); return; }
    if (event.key === "Enter") { event.preventDefault(); onEdit(selected); return; }
    const step = event.shiftKey ? .01 : .001;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (delta) { event.preventDefault(); onChange(fields.map((field, index) => index === selected ? moveField(field, ...delta) : field)); }
  }
  return <div style={{ minWidth: 0 }}>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 10 }}>
      {["select", "text", "draw", "pan"].map(value => <button key={value} type="button" aria-pressed={tool === value} disabled={(value === "draw" && (disabled || !fields[selected])) || (value === "text" && disabled)} onClick={() => { setTool(value); setHovered(null); }} style={{ ...buttonStyle, background: tool === value ? "#F2EFE7" : "white", borderColor: tool === value ? "#B9AD95" : "#DADDDC" }}>{value === "select" ? "Move" : value === "text" ? "Edit text" : value === "draw" ? "Resize area" : "Pan"}</button>)}
      <button type="button" style={buttonStyle} onClick={() => setZoom(Math.max(50, zoom - 25))} aria-label="Zoom out">−</button>
      <select aria-label="Document zoom" value={zoom} onChange={event => setZoom(Number(event.target.value))} style={buttonStyle}>{[50, 75, 100, 125, 150, 175, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select>
      <button type="button" style={buttonStyle} onClick={() => setZoom(Math.min(200, zoom + 25))} aria-label="Zoom in">+</button>
      <button type="button" style={buttonStyle} onClick={() => { setZoom(100); viewport.current.scrollTo({ left: 0, top: 0 }); }}>Fit</button>
      <button type="button" style={buttonStyle} disabled={disabled || !canUndo} onClick={onUndo}>Undo</button>
      <button type="button" style={buttonStyle} disabled={disabled || !canRedo} onClick={onRedo}>Redo</button>
      <details style={{position: "relative"}}><summary style={{...buttonStyle, cursor: "pointer"}}>View options</summary><div style={{position: "absolute", top: "100%", right: 0, zIndex: 30, background: "white", border: "1px solid #DADDDC", borderRadius: 8, padding: 12, minWidth: 180, display: "grid", gap: 10}}>
      <button type="button" style={buttonStyle} aria-pressed={tooltipsEnabled} onClick={() => { setTooltipsEnabled(value => !value); setHovered(null); }}>{tooltipsEnabled ? "Hide hints" : "Show hints"}</button>
      <label style={{ fontSize: 12 }}><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> Field labels</label></div></details>
    </div>
    {tool === "text" && <p role="status" className="mb-2 text-xs">Click detected wording to edit it. For unreadable text, add a Fixed wording field and draw its area. Replacements clear the selected area to white; review artwork and scanned text in the saved PDF.</p>}
    {collisions.length > 0 && <p role="status" className="mb-2 rounded bg-amber-50 p-3 text-xs text-amber-800">Overlapping areas: {collisions.map(([a, b]) => `${a + 1}. ${name(fields[a].key)} / ${b + 1}. ${name(fields[b].key)}`).join("; ")}. Move or resize these areas and check the generated sample.</p>}
    <div ref={viewport} onScroll={() => setHovered(null)} style={{ overflow: "auto", maxHeight: "75vh", minHeight: 300, padding: 16, border: "1px solid #D8DEE6", background: "#EDF1F5", borderRadius: 8 }}>
      {pageUrl ? <div ref={surface} tabIndex={0} role="group" aria-label="Document field editor; arrows move, Delete removes, Enter edits" onKeyDown={keyboard} onPointerDown={event => {
        if (tool === "pan") start(event, null, "pan");
        else if (tool === "draw" && fields[selected]) start(event, selected, "draw");
      }} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft(null); }} style={{ position: "relative", width: baseWidth * zoom / 100, margin: "0 auto", userSelect: "none", cursor: tool === "pan" ? "grab" : tool === "draw" ? "crosshair" : "default", touchAction: tool === "select" ? "auto" : "none", outlineOffset: 3 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pageUrl} alt="Institutional template master" draggable={false} style={{ display: "block", width: "100%", pointerEvents: "none" }} />
        {tool === "text" && !disabled && (pageInfo?.lines?.length ? pageInfo.lines : pageInfo?.items || []).slice(0, 500).filter(item => item.text && item.bbox?.length === 4).map((item, index) => <button key={`text-${index}`} type="button" aria-label={`Edit text: ${item.text}`} title={item.text}
          onPointerDown={event => event.stopPropagation()} onClick={() => onEditText(item)}
          style={{position: "absolute", left: `${item.bbox[0] / pageInfo.width * 100}%`, top: `${item.bbox[1] / pageInfo.height * 100}%`, width: `${(item.bbox[2] - item.bbox[0]) / pageInfo.width * 100}%`, height: `${(item.bbox[3] - item.bbox[1]) / pageInfo.height * 100}%`, background: "rgba(49,91,255,.08)", border: "1px dashed #315BFF", cursor: "text", zIndex: 10}} />)}
        {fields.map((original, index) => {
          const field = draft?.index === index ? draft.field : original;
          if (field.page !== page) return null;
          const active = selected === index;
          return <div key={index} tabIndex={0} role="group" aria-label={`${fieldLabel(field.key)}, page ${field.page}`} aria-describedby={hovered?.index === index ? tooltipId : undefined}
            onMouseEnter={event => showSummary(event, index)} onMouseLeave={() => setHovered(null)}
            onFocus={event => { if (event.target === event.currentTarget) { onSelect(index); showSummary(event, index); } }} onBlur={() => setHovered(null)}
            onPointerDown={event => { if (tool === "pan") start(event, null, "pan"); else start(event, index, "move"); }} onDoubleClick={event => { event.stopPropagation(); if (!disabled) onEdit(index); }} onContextMenu={event => { event.preventDefault(); if (!disabled) onRemove(index); }} style={{ position: "absolute", left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`, border: `2px solid ${active ? "#315BFF" : "#B98A28"}`, background: active ? "rgba(49,91,255,.06)" : "transparent", zIndex: active ? 5 : 2, cursor: disabled ? "default" : "move", touchAction: "none" }}>
            {field.key === "static_text" && <div style={{position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", display: "flex", alignItems: "center", background: field.clear ? "white" : "transparent", color: field.color || "#000000", whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: field.align || "center", ...templateFontStyle(field.font), fontSize: (field.font_size || 18) * baseWidth * zoom / 100 / (pageInfo?.width || 600), lineHeight: 1.2}}><span style={{width: "100%"}}>{field.text}</span></div>}
            {showLabels && <span style={{ position: "absolute", top: field.y > .025 ? -23 : "100%", left: 0, whiteSpace: "nowrap", fontSize: 11, background: "white", padding: "1px 4px", color: "#08283F", borderRadius: 3, pointerEvents: "none" }}>{index + 1}. {name(field.key)}</span>}
            {active && !disabled && <>
              <button type="button" aria-label={`Remove ${name(field.key)}`} onPointerDown={event => event.stopPropagation()} onClick={() => onRemove(index)} style={{ position: "absolute", right: -10, top: -25, background: "white", color: "#A02323", border: "1px solid #D8DEE6", borderRadius: 4, width: 22, height: 22, fontSize: 12 }}>×</button>
              {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(handle => <span key={handle} onPointerDown={event => start(event, index, "resize", handle)} aria-label={`Resize ${handle}`} style={{ position: "absolute", width: 9, height: 9, background: "white", border: "1px solid #315BFF", left: handle.includes("w") ? -5 : handle.includes("e") ? "calc(100% - 4px)" : "calc(50% - 4px)", top: handle.includes("n") ? -5 : handle.includes("s") ? "calc(100% - 4px)" : "calc(50% - 4px)", cursor: `${handle}-resize` }} />)}
            </>}
          </div>;
        })}
      </div> : <p className="text-sm">Loading document page...</p>}
    </div>
    {tooltipsEnabled && tool === "select" && summaryField && createPortal(<div id={tooltipId} role="tooltip" style={{position: "fixed", left: hovered.left, top: hovered.top, width: 280, maxWidth: "calc(100vw - 16px)", zIndex: 150, pointerEvents: "none", padding: 12, borderRadius: 10, background: "#08283F", color: "#F8F7F2", boxShadow: "0 6px 20px #08283F33", fontSize: 12}}>
      <strong>{fieldLabel(summaryField.key)}</strong><p className="mt-1">Page {summaryField.page} | {summaryField.key.endsWith("_signature") ? "Officer signature image" : ["logo", "seal"].includes(summaryField.key) ? "Institutional artwork" : summaryField.key === "qr" ? "Verification QR code" : "Certificate text field"}</p>
      <p className="mt-1">Width {(summaryField.width * 100).toFixed(1)}% | Height {(summaryField.height * 100).toFixed(1)}%</p>
      <p className="mt-1">{summaryField.clear ? "Clears existing content in this area." : "Keeps existing content underneath."}</p><p className="mt-1">Double-click or press Enter to edit. Hide hints to navigate freely.</p>
    </div>, document.body)}
    <details className="mt-3 rounded-lg border p-3 text-xs"><summary className="font-semibold cursor-pointer">Editor help</summary><ul className="mt-2 list-disc pl-4 space-y-1">
      <li>Scroll on the page background; use Pan to drag the document viewport.</li><li>Click a field and drag to move it. Drag its handles to resize.</li><li>Use Resize area to replace the selected field&apos;s rectangle.</li><li>Right-click a field, click ×, or press Delete / X to remove it.</li><li>Double-click a field or press Enter to edit its content and asset settings.</li><li>Arrow keys move the selected field; Shift moves in larger steps.</li><li>Undo / Redo, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z restore changes; Escape cancels a drag.</li><li>Zoom and Fit page width change the view without changing saved coordinates.</li>
    </ul></details>
  </div>;
}
