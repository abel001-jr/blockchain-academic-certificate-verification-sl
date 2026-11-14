"""Certificate fonts available to both PDF fitting and rendering."""
from pathlib import Path
import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

BUILTIN_FONTS = {
    "Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic",
    "Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique",
    "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique",
}
LOCAL_FONTS = {"Vera": "Vera.ttf", "Vera-Bold": "VeraBd.ttf",
               "Vera-Italic": "VeraIt.ttf", "Vera-BoldItalic": "VeraBI.ttf"}
CERTIFICATE_FONTS = {name: name + ".ttf" for name in (
    "CormorantGaramond", "CormorantGaramond-Bold", "CormorantGaramond-Italic", "CormorantGaramond-BoldItalic",
    "Cinzel", "Cinzel-Bold", "GreatVibes")}
LOCAL_FONTS.update(CERTIFICATE_FONTS)
for name, filename in LOCAL_FONTS.items():
    if name not in pdfmetrics.getRegisteredFontNames():
        source = Path(__file__).parent / "fonts" / "certificate" / filename if name in CERTIFICATE_FONTS else Path(reportlab.__file__).parent / "fonts" / filename
        pdfmetrics.registerFont(TTFont(name, str(source)))
FONTS = BUILTIN_FONTS | LOCAL_FONTS.keys()


def supports_text(font, text):
    if font in LOCAL_FONTS:
        glyphs = pdfmetrics.getFont(font).face.charToGlyph
        return all(char == "\n" or ord(char) in glyphs for char in text)
    return all(ord(char) <= 255 for char in text)
