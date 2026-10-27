"use client";
export default function DocumentReadingOverview({ review, label = "Document" }) {
  if (!review) return <section aria-label={label + " reading overview"} className="rounded-xl border border-[var(--cd-line)] bg-[var(--cd-tint)] p-4"><h4 className="text-sm font-semibold text-[#08283F]">{label} reading overview</h4><p className="mt-1 text-xs text-[#687B8E]">Upload and read the document to see image recognition and reading layer results here.</p></section>;
  return (      <section aria-label="Document reading overview" className="rounded-xl border border-[var(--cd-line)] bg-[var(--cd-tint)] p-4">
        <h4 className="text-sm font-semibold text-[#08283F]">{label} reading overview</h4>
        {review.summary?.reading_mode && <p className="mt-1 text-xs font-semibold text-[#08283F]">{review.summary.reading_mode === "deep" ? "Deep reading — external AI model (Groq)" : "Local reading — PDF text and OCR"}</p>}
        <div className="mt-2">
          <h5 className="text-sm font-semibold text-[#08283F]">Image recognition and document reading</h5>
          <p className="mt-1 text-xs leading-6 text-[#4A5A68]">{review.ocr_used ? "Scanned document text was read using Tesseract OCR." : "Embedded PDF text was read directly."} OCR reads text; it does not establish document authenticity. Compare the values below with the original document before accepting.</p>
          {review.summary?.recognition?.pages?.length > 0 && <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{review.summary.recognition.pages.map(page => <li key={page.page} className="rounded border border-[#E4E1D6] bg-white p-3 text-xs text-[#4A5A68]"><strong className="text-[#08283F]">Page {page.page}: {page.method === "ocr" ? "Image / OCR" : "PDF text"}</strong><p className="mt-1">{page.word_count} words read{page.confidence != null ? `; average OCR confidence ${page.confidence}%` : ""}</p>{page.low_confidence_words > 0 && <p className="mt-1 text-[#A9721F]">{page.low_confidence_words} words have low OCR confidence. Check names, dates and award details against the scan.</p>}</li>)}</ul>}
        </div>
        {review.summary?.layers && <details className="mt-3 border-t border-[var(--cd-line)] pt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-[var(--cd-primary)]">Reading layers: {review.summary.layers.map(layer => `${layer.name} (${layer.status.replaceAll("_", " ")})`).join(" · ")}</summary>
          <ul className="mt-2 space-y-2 text-[#4A5A68]">{review.summary.layers.map(layer => <li key={layer.name}><strong>{layer.name}:</strong> {layer.detail}</li>)}</ul>
        </details>}

      </section>);
}
