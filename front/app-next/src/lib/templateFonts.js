export const TEMPLATE_FONT_GROUPS = [
  {id: "cormorant", label: "Cormorant Garamond", category: "Formal", family: "'Certificate Cormorant', serif", fonts: [["CormorantGaramond", "Regular"], ["CormorantGaramond-Bold", "Bold"], ["CormorantGaramond-Italic", "Italic"], ["CormorantGaramond-BoldItalic", "Bold italic"]]},
  {id: "cinzel", label: "Cinzel", category: "Headings", family: "'Certificate Cinzel', serif", fonts: [["Cinzel", "Regular"], ["Cinzel-Bold", "Bold"]]},
  {id: "greatvibes", label: "Great Vibes", category: "Names", family: "'Certificate Great Vibes', cursive", fonts: [["GreatVibes", "Regular"]]},
  {id: "vera", label: "Bitstream Vera", category: "Supporting text", family: "'Certificate Vera', sans-serif", fonts: [["Vera", "Regular"], ["Vera-Bold", "Bold"], ["Vera-Italic", "Italic"], ["Vera-BoldItalic", "Bold italic"]]},
  {id: "times", label: "Times", category: "Standard PDF fonts", family: "'Times New Roman', serif", fonts: [["Times-Roman", "Regular"], ["Times-Bold", "Bold"], ["Times-Italic", "Italic"], ["Times-BoldItalic", "Bold italic"]]},
  {id: "helvetica", label: "Helvetica", category: "Standard PDF fonts", family: "Arial, sans-serif", fonts: [["Helvetica", "Regular"], ["Helvetica-Bold", "Bold"], ["Helvetica-Oblique", "Italic"], ["Helvetica-BoldOblique", "Bold italic"]]},
  {id: "courier", label: "Courier", category: "Standard PDF fonts", family: "'Courier New', monospace", fonts: [["Courier", "Regular"], ["Courier-Bold", "Bold"], ["Courier-Oblique", "Italic"], ["Courier-BoldOblique", "Bold italic"]]},
];
export function templateFontGroup(font = "Times-Roman") {
  return TEMPLATE_FONT_GROUPS.find(group => group.fonts.some(([key]) => key === font)) || TEMPLATE_FONT_GROUPS.find(group => group.id === "times");
}
export function changeTemplateFontFamily(font, familyId) {
  const current = templateFontGroup(font).fonts.find(([key]) => key === font)?.[1];
  const next = TEMPLATE_FONT_GROUPS.find(group => group.id === familyId);
  return (next.fonts.find(([, style]) => style === current) || next.fonts[0])[0];
}
export function templateFontStyle(font = "Times-Roman") {
  return {fontFamily: templateFontGroup(font).family, fontWeight: font.includes("Bold") ? 700 : 400,
    fontStyle: /Italic|Oblique/.test(font) ? "italic" : "normal"};
}
