"use client";
import { useEffect, useRef, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import { api } from "@/lib/api";
import { scheduleDocumentFallback } from "@/lib/documentFallback.mjs";

export default function CredentialDocumentPreview(props) {
  return <DocumentPreview key={`${props.id}-${props.kind}`} {...props} />;
}

function DocumentPreview({ id, kind, onPageViewed, progress = true, reviewedPages = [], navigationRequest }) {
  const [source, setSource] = useState("gateway");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState(null);
  const [fallbackNotice, setFallbackNotice] = useState("");
  const documentPane = useRef(null);
  const card = useRef(null);
  useEffect(() => {
    if (!navigationRequest) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPage(navigationRequest.page);
      card.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => { active = false; };
  }, [navigationRequest]);
  const label = kind === "transcript" ? "Academic transcript" : "Certificate document";
  useEffect(() => {
    let alive = true;
    const fallback = source === "gateway" ? scheduleDocumentFallback(message => {
      if (!alive) return;
      setFallbackNotice(message);
      setSource("stored");
    }) : null;
    api.get(`/certificates/${id}/review-document/${kind}/?page=${page}&progress=${progress}&source=${source}`).then(data => {
      fallback?.cancel();
      if (alive) setResult({ ...data, requestedPage: page, reload, requestedSource: source });
    }).catch(error => {
      if (!alive) return;
      if (source === "gateway" && (error.fallbackAvailable || error.fallback_available)) {
        fallback.setMessage(error.code === "document_rate_limited"
          ? "Document gateways are rate limited. Opening the saved copy with an integrity check."
          : "The document gateway is unavailable. Opening the saved copy with an integrity check.");
        return;
      }
      fallback?.cancel();
      setResult({ error: error.detail || error.message || "Document unavailable.", fallbackAvailable: error.fallbackAvailable || error.fallback_available, code: error.code, requestedPage: page, reload, requestedSource: source });
    });
    return () => { alive = false; fallback?.cancel(); };
  }, [id, kind, page, reload, source, progress]);
  const loading = !result || result.requestedPage !== page || result.reload !== reload || result.requestedSource !== source;
  function recordPageRead() {
    const pane = documentPane.current;
    const image = pane?.querySelector("img");
    if (!loading && image?.complete && image.naturalWidth > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 16) {
      onPageViewed?.(kind, page, result.page_count);
    }
  }
  const displaySource = result?.display_source || (source === "stored" ? "stored" : "ipfs");
  const savedCopyReady = !loading && !result?.error && displaySource === "stored";
  const sourceLabel = loading
    ? source === "stored" ? "Loading saved copy..." : "Loading primary view..."
    : result.error ? "Document source unavailable"
    : displaySource === "stored" ? "Secondary: viewing saved copy from application storage"
    : displaySource === "generated" ? "Viewing generated approval preview"
    : "Primary: viewing from Pinata / IPFS";
  return <section ref={card} aria-busy={loading} onClick={event => event.stopPropagation()} className="scroll-mt-24 overflow-hidden rounded-xl border border-[var(--cd-line)]">
    <FeedbackToast message={!loading ? result?.error : ""} title="Document preview unavailable" tone="warning" />
    <FeedbackToast message={fallbackNotice ? savedCopyReady ? "The saved copy passed its integrity check. Continue reviewing all pages, then accept and approve with MetaMask." : fallbackNotice : ""} title={savedCopyReady ? "Saved copy verified - approval available" : "Opening saved document copy"} tone={savedCopyReady ? "success" : "info"} />
    <div className="border-b border-[var(--cd-line)] px-4 py-3">
      <span role="status" className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${!loading && !result?.error && displaySource === "stored" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[var(--cd-line)] bg-[var(--cd-tint)] text-[var(--cd-text)]"}`}>{sourceLabel}</span>
      {savedCopyReady && <p className="mt-2 text-xs text-[var(--cd-muted)]">Integrity check passed. This saved copy can be used for officer review and approval; a successful IPFS retrieval is not required.</p>}
    </div>
    {source === "stored" && <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cd-line)] bg-[var(--cd-tint)] p-4 text-sm"><p>Secondary view: saved document copy. Its fingerprint is checked against the submitted document before display.</p><button type="button" disabled={loading} className="cd-btn-secondary" onClick={event => { event.preventDefault(); event.stopPropagation(); setFallbackNotice(""); setSource("gateway"); setReload(value => value + 1); }}>Retry IPFS for this document</button></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cd-line)] bg-[var(--cd-tint)] px-4 py-3"><h4 className="text-sm font-semibold text-[#08283F]">{label}</h4><div className="flex items-center gap-2"><button type="button" className="cd-btn-secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span className="text-xs">Page {page} of {result?.page_count || "..."}</span><button type="button" className="cd-btn-secondary" disabled={loading || !result?.page_count || page >= result.page_count} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    {loading && <div role="status" className="p-4 text-sm"><p>Loading {label.toLowerCase()}...</p>{source === "gateway" && <button type="button" className="cd-btn-secondary mt-3" onClick={() => { setFallbackNotice("Opening the saved copy with an integrity check."); setSource("stored"); }}>Use saved copy now</button>}</div>}
    {!loading && result.error ? <div className="p-4 text-sm"><p>The document preview is temporarily unavailable.</p>{result.fallbackAvailable && <button type="button" className="cd-btn-primary mt-3 mr-3" onClick={() => setSource("stored")}>Use saved document copy</button>}<button type="button" className="cd-btn-secondary mt-3" onClick={() => setReload(value => value + 1)}>Retry document</button></div> : result?.image && result.requestedPage === page ? <div ref={documentPane} tabIndex={0} aria-label={`${label}, page ${page}. Scroll to the bottom to complete review.`} onScroll={recordPageRead} className="max-h-[65vh] overflow-auto bg-[#F2EFE7] p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={`${result.requestedSource}-${result.requestedPage}-${result.reload}`} src={result.image} alt={label + " page " + page} onLoad={() => { if (documentPane.current) documentPane.current.scrollTop = 0; recordPageRead(); }} className="mx-auto h-auto w-full max-w-[1000px] bg-white" />
      {onPageViewed && !loading && <div className="mt-3 flex justify-center"><button type="button" className="cd-btn-secondary" disabled={reviewedPages.includes(page)} onClick={() => onPageViewed(kind, page, result.page_count)}>{reviewedPages.includes(page) ? `Page ${page} reviewed` : `Mark page ${page} reviewed`}</button></div>}
    </div> : null}
  </section>;
}
