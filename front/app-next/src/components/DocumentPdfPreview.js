"use client";

import { useState } from "react";

export default function DocumentPdfPreview(props) {
  return <PdfPreview key={props.src} {...props} />;
}

function PdfPreview({ src, title, className, onLoad, style }) {
  const [visible, setVisible] = useState(false);

  return <div>
    <div className="flex flex-wrap items-center gap-3 p-3">
      <button type="button" className="cd-btn-secondary" aria-expanded={visible} onClick={() => setVisible(previous => !previous)}>
        {visible ? "Hide preview" : "Show preview"}
      </button>
      <a href={src} download className="text-sm font-semibold underline">Download PDF</a>
    </div>
    {visible ? <iframe src={src} title={title} className={className} style={style} onLoad={onLoad} /> : <p className="px-3 pb-3 text-xs text-[#687B8E]">Select Show preview to open this document.</p>}
  </div>;
}
