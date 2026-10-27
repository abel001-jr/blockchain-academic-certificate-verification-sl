# Local document reading review

Local reading runs on the backend server. It does not use Ollama, Groq, or another external AI provider.

| Stage | Library / logic | Result |
| --- | --- | --- |
| Prepare uploads | Pillow + PyMuPDF | Ordered JPEG/PNG/PDF pages become one PDF; explicit rotations are applied. A single unchanged PDF keeps its original bytes. |
| Read PDF text | PyMuPDF | Embedded words, lines, and page coordinates. |
| Read scans | PyMuPDF renders pages at 200 DPI; Pillow prepares grayscale images; pytesseract calls the separately installed Tesseract executable | OCR words, coordinates, and confidence values. |
| Extract fields | Local labels, positions, and explicit certificate wording in `field_extraction.py` | Reads labelled transcript rows and narrative certificate recipient/degree/year cues; reads institution headings without using intake values. |
| Second reading | Tesseract, when the initial reading used no OCR and fields remain missing | Fills missing fields; both text readings remain available to comparison. Existing parsed fields are preserved. |
| Compare text | Normalization, similarity thresholds, and verbatim search | Parsed agreement, disagreement, missing field, or weaker “Found in text” evidence. |
| Locate artwork | PyMuPDF embedded-image geometry | Candidate logo/seal crops across pages; full-page scans are excluded as artwork. |
| Compare artwork | Pillow grayscale/shape normalization, small rotations and shifts | Visual similarity score against stored references, using the original rendered crop. |
| Locate signatures | Embedded officer-title text, nearby image geometry, or rendered strokes | Officer-associated signature region, compared locally against the stored signature image. |
| Decide | Registrar review | Automated readings never establish authenticity or replace the review decision. |

Fixed during this review:

- Second-pass OCR text now reaches the final comparison, without duplicating physical pages.
- Logo/seal scores retain the original crop score instead of rescoring a smaller display preview.
- The UI recognizes the current image-result version and avoids unnecessary image refreshes, including completed readings with no located artwork.
- Text-only recognition identifies PyMuPDF as its engine; encrypted analysis uploads return an actionable error and early validation closes PDF resources.

Remaining limits:

- The second OCR pass processes the whole PDF and can be slow. Mixed PDFs that already used OCR on a page do not receive this second pass.
- Scanned signatures without searchable officer titles cannot be automatically associated with officers. Vector logos/seals and artwork inside full-page scans require manual identification.
- Shape matching is appearance comparison, not forgery detection. Its score is not a probability of authenticity.
- “Found in text” searches for the intake value anywhere in the document; it does not establish that a name is the recipient or a year is the graduation year. Registrar inspection remains necessary.
- Deep reading still uses local text extraction/OCR before sending text to Groq. Logo/seal AI comparison is enabled only for Deep reading, including subsequent image refreshes.

Validation: 22 focused tests passed; frontend lint passed. The standalone field-extraction checks passed 30/31, with a signature-row layout assertion failing. Intake endpoint tests are blocked by fixtures missing required officer signatures. These failures remain unresolved.
