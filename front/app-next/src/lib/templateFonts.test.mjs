import test from "node:test";
import assert from "node:assert/strict";
import {changeTemplateFontFamily, templateFontGroup, templateFontStyle} from "./templateFonts.js";

test("family changes retain an available style and fall back to regular", () => {
  assert.equal(changeTemplateFontFamily("Times-BoldItalic", "cormorant"), "CormorantGaramond-BoldItalic");
  assert.equal(changeTemplateFontFamily("CormorantGaramond-BoldItalic", "cinzel"), "Cinzel");
  assert.equal(changeTemplateFontFamily("Times-Bold", "greatvibes"), "GreatVibes");
});
test("saved fonts resolve into the correct family and preview style", () => {
  assert.equal(templateFontGroup("Helvetica-Oblique").id, "helvetica");
  assert.equal(templateFontGroup("Cinzel-Bold").category, "Headings");
  assert.equal(templateFontStyle("CormorantGaramond-BoldItalic").fontWeight, 700);
  assert.equal(templateFontStyle("CormorantGaramond-BoldItalic").fontStyle, "italic");
});
