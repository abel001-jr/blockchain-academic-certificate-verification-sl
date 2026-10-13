"use client";

import { useState } from "react";
import Image from "next/image";
import fields from "../../../public/branding-guide/fields.json";

const displayName = field => field.key === "static_text" ? (field.text === "Computer Science" ? "Programme (fixed text)" : "Day / month (fixed text)") : field.key.replaceAll("_", " ");

export default function BrandingGuideVisual({ stage, variant }) {
  const [selected, setSelected] = useState(1);
  const field = fields[selected];
  const preview = stage === 2;
  return <div className="space-y-4">
    <div className="rounded-lg bg-[#EAF2FB] p-3 text-sm leading-relaxed text-[#08283F]">
      {stage === 0 && <>This is the recommended upload: a clean certificate master with blank spaces for changing values. The printed placeholders have already been removed from these examples. Bring this kind of design as a PDF, JPEG or PNG (up to 20 MB / 50 pages), without old student details or signatures.</>}
      {stage === 1 && <>Click a highlighted box to inspect its label. Position each box in a blank space, keeping nearby wording untouched. These example positions were configured manually; no placeholder clearing is needed.</>}
      {stage === 2 && <>This is a real generated example from the selected draft, with fictional student details. Editor boxes disappear; fixed wording and borders remain. Save draft &amp; preview produces an unsigned review copy, not an issued certificate.</>}
    </div>
    <figure className="overflow-hidden rounded-xl border-2 border-[#8A9BAA] bg-white">
      <div className="relative">
        <Image src={`/branding-guide/${variant}-${preview ? "preview" : "source"}.png?v=clean-master`} width={1263} height={893} unoptimized alt={preview ? "Generated unsigned example certificate for Amina Kamara at Example University on the prepared cream master" : "Prepared Credence master with blank spaces for institution, graduate, award, programme, honours and date, retaining fixed wording and borders"} className="h-auto w-full" />
        {stage === 1 && fields.map((item, index) => <button key={index} type="button" aria-label={`Inspect ${displayName(item)} field`} aria-pressed={selected === index} onClick={() => setSelected(index)} style={{position: "absolute", left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`, border: `2px solid ${selected === index ? "#8A5D12" : "#365EFF"}`, background: selected === index ? "rgba(185,138,40,.2)" : "rgba(54,94,255,.1)"}}><span className="absolute -top-4 left-0 rounded bg-[#08283F] px-1 text-[10px] leading-4 text-white">{index + 1}</span></button>)}
      </div>
      <figcaption className="border-t border-[#D8DEE6] px-4 py-2 text-xs text-[#4A5A68]">{variant === "live" ? "Live-text PDF: embedded text can be read directly." : "Flattened PDF: the page is an image; text reading uses OCR."} Field placement still needs your confirmation.</figcaption>
    </figure>
    {stage === 0 && <p className="text-sm text-[#4A5A68]">Keep wording, borders and artwork. A version with blank spaces is easiest to configure. Upload reusable crest and seal images separately; set officer signatures in Settings.</p>}
    {stage === 1 && <div className="grid gap-3 rounded-lg border border-[#D8DEE6] p-4 sm:grid-cols-2">
      <div><p className="text-xs text-[#687B8E]">Selected example field</p><p className="font-semibold capitalize">{displayName(field)}</p><p className="mt-1 text-sm">{field.font} · {field.font_size} pt · centered</p><p className="mt-1 text-sm font-semibold text-[#2F6F4E]">Clear existing content: off (area is blank)</p></div>
      <p className="text-sm text-[#4A5A68]">Drag and resize boxes in the actual editor. Choose fonts and input limits there. Programme and day/month use deliberate fixed text in this example; they are not inferred from these labels. Year is configured separately.</p>
    </div>}
    {stage === 2 && <div className="space-y-3 text-sm">
      <p className="rounded-lg border border-[#B6D9C4] bg-[#EFFAF3] p-3 text-[#245C3E]"><strong>Blank spaces give a clean result.</strong> Values are placed directly on the cream background, without white clearing patches. Check long names fit, field boxes do not overlap wording, and artwork is intact before approval. If your own upload still has printed placeholders, remove them in the source first; clearing in the editor uses white.</p>
      <p className="text-[#4A5A68]">Signatures are intentionally absent in this review. Configure signature positions and officer assets for your own template. This guide does not create or approve a template.</p>
    </div>}
    <a href={`/branding-guide/${variant}-${preview ? "preview" : "draft"}.pdf?v=clean-master`} target="_blank" rel="noopener noreferrer" className="cred-btn cred-btn-secondary">Open {preview ? "sample preview" : "clean master"} PDF</a>
  </div>;
}
