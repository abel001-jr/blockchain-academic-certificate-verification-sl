/* eslint-disable @next/next/no-img-element -- extracted document pixels */
const states = {
  visual_match: { label: "Visual match", colour: "text-green-800 bg-green-50", recommendation: "Confirm the image is in the correct location and belongs to the issuing institution. Signature approval must still be checked separately." },
  manual_review: { label: "Match not confirmed", colour: "text-amber-800 bg-amber-50", recommendation: "Compare the document image with the stored reference. If they differ, request a corrected document; if they agree, record your manual findings in the review reason." },
  reference_missing: { label: "Reference missing", colour: "text-amber-800 bg-amber-50", recommendation: "Ask the institutional administrator to configure the logo, seal or officer signature, then compare again." },
  reference_unavailable: { label: "Reference unavailable", colour: "text-red-800 bg-red-50", recommendation: "Ask the institutional administrator to restore the stored reference before completing the identity review." },
};

export default function InstitutionIdentityResults({ identity, error, apiBase }) {
  const items = identity?.items || [];
  const matched = items.filter(item => item.status === "visual_match").length;
  const pending = items.filter(item => item.status === "manual_review").length;
  const missing = items.length - matched - pending;
  const total = items.length || 5;
  return <section className="mt-4 rounded-xl border border-[var(--cd-line)] p-4" aria-label="Institutional identity results">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="text-sm font-semibold text-[#08283F]">Institutional identity</h5>
      <span role="status" className={`rounded px-2 py-1 text-xs font-semibold ${matched === total ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{!identity ? "Awaiting image results" : matched === total ? "All visual references matched" : "Identity review incomplete"}</span>
    </div>
    <p className="mt-2 text-xs text-[#4A5A68]">{matched} of {total} visual references matched. This measures visual comparison coverage, not authenticity or signing approval.</p>
    <progress className="mt-2 h-2 w-full accent-[#08283F]" max={total} value={matched} aria-label="Institutional visual references matched" />
    {identity && <div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded bg-green-50 px-2 py-1 text-green-800">{matched} matched</span><span className="rounded bg-amber-50 px-2 py-1 text-amber-800">{pending} not confirmed</span><span className="rounded bg-[var(--cd-tint)] px-2 py-1 text-[#4A5A68]">{missing} reference issues</span></div>}
    {error && <p role="alert" className="mt-2 text-xs text-red-800">{error}</p>}
    {!identity && <p className="mt-2 text-xs text-[#687B8E]">Image comparisons appear after the inspected document has been retrieved or re-read.</p>}
    {identity && <div className="mt-3 space-y-3">{[["logo", "Logo"], ["seal", "Seal"], ["signatures", "Officer signatures"]].map(([category, title]) => <section key={category} className="rounded-lg bg-[var(--cd-tint)] p-3">
      <h6 className="text-xs font-semibold uppercase tracking-wide text-[#08283F]">{title}</h6>
      {items.filter(item => item.category === category).map(item => {
        const state = states[item.status] || states.manual_review;
        return <div key={item.label} className="mt-3 border-t border-[var(--cd-line)] pt-3">
          <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-[#08283F]">{item.label}</p><span className={`rounded px-2 py-1 text-xs font-semibold ${state.colour}`}>{state.label}</span></div>
          <p className="mt-2 text-xs leading-5 text-[#4A5A68]">{item.detail}</p>
          <p className="mt-2 text-xs leading-5 text-[#08283F]"><strong>Recommended action: </strong>{state.recommendation}</p>
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#08283F]">Compare document and reference images</summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {item.document_image ? <figure className="rounded border border-[var(--cd-line)] bg-white p-2"><img src={item.document_image} alt={`${item.label} from uploaded document`} className="h-24 w-full object-contain" /><figcaption className="mt-1 text-[11px] text-[#4A5A68]">Document page {item.document_page}<br />{item.document_image_label}</figcaption></figure> : <p className="text-xs text-[#687B8E]">No image region located. Inspect the full document.</p>}
              {item.reference_url ? <figure className="rounded border border-[var(--cd-line)] bg-white p-2"><img src={new URL(item.reference_url, apiBase).href} alt={`Stored ${item.label}`} className="h-24 w-full object-contain" /><figcaption className="mt-1 text-[11px] text-[#4A5A68]">Stored institutional reference</figcaption><a href={new URL(item.reference_url, apiBase).href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs underline">Open reference</a></figure> : <p className="text-xs text-[#687B8E]">No stored reference available.</p>}
            </div>
          </details>
        </div>;
      })}
    </section>)}</div>}
  </section>;
}
