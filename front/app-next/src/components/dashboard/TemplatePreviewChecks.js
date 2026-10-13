import { fieldLabel } from "./templateFieldGroups";

export default function TemplatePreviewChecks({ warnings }) {
  if (!warnings?.length) return null;
  const sizes = [], other = [];
  warnings.forEach(warning => {
    const match = warning.match(/^(.+?) will use ([\d.]+)pt instead of ([\d.]+)pt\./);
    if (match) sizes.push({field: fieldLabel(match[1].replaceAll(" ", "_")), actual: match[2], configured: match[3]});
    else other.push(warning);
  });
  return <div className="border-b bg-amber-50 p-4 text-amber-900">
    <h5 className="font-semibold">Layout checks · {warnings.length} adjustments to review</h5>
    <p className="mt-1 text-sm">For larger text, widen or increase the height of the field, or adjust its configured font size. Keep official data complete.</p>
    {sizes.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-amber-200"><th className="py-2 pr-4">Field</th><th className="py-2 pr-4">Configured</th><th className="py-2">Preview uses</th></tr></thead><tbody>{sizes.map((row, index) => <tr key={index} className="border-b border-amber-100"><td className="py-2 pr-4 font-medium">{row.field}</td><td className="py-2 pr-4">{row.configured} pt</td><td className="py-2">{row.actual} pt</td></tr>)}</tbody></table></div>}
    {other.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{other.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
  </div>;
}
