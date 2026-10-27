"""Field extraction and comparison for externally supplied credential documents.

`analyze_pdf` (in `document_analysis.py`) turns a PDF into words and bounding
boxes. This module turns that into the handful of fields the design doc says
must be compared against the Registrar's intake data:

    "Compare extracted student name, award, institution, and other configured
     fields with the intake data. Flag mismatches for Registrar review; do not
     silently bind a document to the entered student."
                                         -- CREDENTIAL_ISSUANCE_PIPELINE_DESIGN.md

Two properties matter more than raw accuracy here:

**A field that could not be found is reported as unverified, never as a
match.** A silent pass here is the dangerous failure: the Registrar would see
"all fields agree" for a document the extractor understood not at all, and
would attest to it. Every field therefore reports one of `match`, `mismatch`
or `not_found`, and `not_found` is surfaced to the Registrar as work to do
rather than folded into "fine".

**Comparison is a similarity judgement, so it reports its own confidence.**
No threshold is trustworthy across institutions, so the ratio is returned and
the thresholds below are only a starting point. A field just above threshold is
reported the same way as one far above it, because the difference is a
Registrar's to judge, not the extractor's.

Extraction uses labels and positioned values first, then explicit narrative
certificate wording and institution headings. Unsupported layouts retain the
separate, weaker verbatim-text evidence; intake values never drive extraction.
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher


# ── Field configuration ──────────────────────────────────────────────────────
#
# Each field gets a list of label patterns, tried in order. Patterns are matched
# against the *label* part of a line, so they are anchored at the start and
# allow a colon, dash or whitespace separator before the value.

FIELD_LABELS: dict[str, tuple[str, ...]] = {
    "student_name": (
        "student full name", "full name of student", "full name", "student name", "candidate name", "learner name",
        "graduate name", "name of student", "student", "name",
    ),
    "degree_title": (
        "degree awarded", "degree title", "award title", "programme title",
        "program title", "qualification", "degree", "award", "programme",
        "program", "course of study", "course", "field of study",
    ),
    "institution": (
        "issuing institution", "institution name", "name of institution",
        "issuing body", "name of university", "awarding institution",
        "awarding body", "institution", "university", "college",
        "school", "faculty",
    ),
    "graduation_year": (
        "graduation year / issue date", "year of graduation", "graduation year", "year awarded", "class of",
        "graduation", "year",
    ),
}

#: Fields compared by default, in the order the design doc names them.
DEFAULT_FIELDS = ("student_name", "degree_title", "institution", "graduation_year")

#: Minimum similarity for a value to count as agreeing with intake.
#:
#: Names are strictest because a near-miss on a surname is the exact error this
#: check exists to catch. Institution is loosest because the same institution
#: routinely appears as "Uni of Mines SL", "University of Mines" and
#: "University of Mines (SL)" across its own documents, and insisting on a tight
#: match would flag correct documents far more often than wrong ones.
FIELD_THRESHOLDS: dict[str, float] = {
    "student_name": 0.82,
    "degree_title": 0.78,
    "institution": 0.70,
    "graduation_year": 1.0,
}

#: Where a value may sit relative to its label.
_VALUE_SEPARATORS = re.compile(r"^\s*[:\-–—]\s*|\s{2,}")
_LABEL_TRAILING = re.compile(r"^[\s:_\-–—=.]+")

#: An explicit separator between a label and its value.
_EXPLICIT_SEPARATOR = re.compile(r"^\s*[:\-–—]")

#: Labels that are only trustworthy as a real data label.
#:
#: Single words like "faculty", "name" or "school" appear in two very different
#: roles on a credential document: as a genuine label ("Faculty: Northern
#: University") and as ordinary heading text ("Faculty of Science"). Treating the
#: second as a label makes the extractor report the *remainder of a heading* as a
#: field value — it extracted `of Science` as the institution name from a
#: certificate whose actual institution line was further down and perfectly
#: readable. That is worse than finding nothing: it is a confident wrong answer
#: wearing the costume of an extracted field, and the Registrar's only defence
#: against it is noticing the value is nonsense.
#:
#: A real label is followed by a separator or ends the line. A heading is followed
#: by more prose. Multi-word labels are specific enough to require no separator.
_REQUIRES_SEPARATOR = frozenset({
    "name", "student", "faculty", "school", "college", "institute",
    "university", "institution", "program", "programme", "course", "award",
    "degree", "qualification", "graduation", "year", "of",
})


#: Words that carry no identifying information within their own field.
#:
#: Every university document says "University of". Those words are why a plain
#: character ratio scores "University of Mines" against "University of Ghana"
#: highly: the strings share 14 of 18 characters, and the one word that actually
#: distinguishes them is a minority of the text. Comparing the residual after
#: removing these is what stops two different institutions from agreeing.
GENERIC_TOKENS = frozenset({
    "university", "uni", "college", "school", "institute", "institution",
    "polytechnic", "faculty", "academy", "of", "the", "and", "in", "at", "for",
})

#: Cap applied when the distinguishing words are entirely disjoint. Set below
#: every field threshold so a match can never rest on a shared generic prefix.
_DISJOINT_CAP = 0.6


def _strip_accents(value: str) -> str:
    """Fold accents so "Zoë" and "Zoe" compare equal."""
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def normalize(value: str) -> str:
    """Reduce a value to a comparable form.

    Case, accents, surrounding punctuation and whitespace are all noise here.

    A period or apostrophe sitting *between* two letters is deleted rather than
    turned into a space, because it is an abbreviation or possessive, not a word
    break: "B.Sc." and "BSc" are one token, and "O'Brien" is not "O Brien".
    Replacing it with a space makes those look like different values, which
    matters because this is a credential check.
    """
    if not value:
        return ""
    text = _strip_accents(str(value)).lower()
    text = re.sub(r"(?<=[a-z0-9])[.'\u2019](?=[a-z0-9])", "", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokens(value: str) -> set[str]:
    return {token for token in normalize(value).split() if token}


def _residual_tokens(value: str) -> set[str]:
    """Tokens that actually identify the value, generic wording removed."""
    specific = {token for token in _tokens(value) if token not in GENERIC_TOKENS}
    # If everything was generic, fall back to the full token set rather than
    # comparing two empty sets as "identical".
    return specific or _tokens(value)


def similarity(expected: str, extracted: str) -> float:
    """Score two values in [0.0, 1.0].

    Character ratio handles typos and formatting drift. It is then capped when
    the identifying words are wholly disjoint, because in that case any
    agreement comes from generic wording and the values are describing
    different things.
    """
    left, right = normalize(expected), normalize(extracted)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    ratio = SequenceMatcher(None, left, right).ratio()

    left_tokens, right_tokens = _tokens(expected), _tokens(extracted)
    if left_tokens and right_tokens:
        overlap = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
        # Character ratio dominates; overlap rescues word reordering.
        ratio = max(ratio, 0.5 * ratio + 0.5 * overlap)

    left_specific, right_specific = _residual_tokens(expected), _residual_tokens(extracted)
    if left_specific and right_specific and not (left_specific & right_specific):
        # No shared identifying word. Agreement, if any, is generic scaffolding.
        ratio = min(ratio, _DISJOINT_CAP)

    return round(ratio, 4)


def _lines_from_pages(pages: list[dict]) -> list[str]:
    """Rebuild logical lines from positioned words.

    `analyze_pdf` returns words with bounding boxes, not lines, because the
    layout analysis needs the boxes. Label matching only needs reading order,
    which the analysis already sorts, so words are grouped into lines by
    vertical position to avoid matching a label against a value from the
    neighbouring column.
    """
    lines: list[str] = []
    for page in pages:
        if not page.get("items"):
            lines.extend(line.get("text", "").strip() for line in page.get("lines", []) if line.get("text", "").strip())
            continue
        # `items` is already in reading order; group on a y-tolerance band.
        current: list[str] = []
        current_top: float | None = None
        for item in page.get("items", []):
            bbox = item.get("bbox") or [0, 0, 0, 0]
            if len(bbox) < 4:
                continue
            top = float(bbox[1])
            if current_top is None or abs(top - current_top) <= 3.0:
                current.append(str(item.get("text", "")))
                current_top = top if current_top is None else current_top
            else:
                lines.append(" ".join(current))
                current = [str(item.get("text", ""))]
                current_top = top
        if current:
            lines.append(" ".join(current))
    return lines


def _split_label(line: str, label: str) -> str | None:
    """Return the value that follows `label` on `line`, if any.

    Returns `None` when the line does not start with this label, and `""` when it
    does but the value is expected on the following line.
    """
    pattern = re.compile(
        r"^" + r"\s+".join(re.escape(word) for word in label.split()) + r"\b",
        re.IGNORECASE,
    )
    match = pattern.match(line)
    if not match:
        return None
    remainder = line[match.end():]
    # A generic single-word label only counts when it is actually introducing a
    # value. "Faculty of Science" is a heading; "Faculty: Northern University"
    # is a field. Without this, the heading wins and the real value is ignored.
    if label in _REQUIRES_SEPARATOR and not (
        _EXPLICIT_SEPARATOR.match(remainder) or not remainder.strip()
    ):
        return None
    remainder = _LABEL_TRAILING.sub("", remainder)
    # A label with a colon and then nothing on the line means the value is on
    # the following line; an empty string signals that to the caller.
    return remainder.strip()


def _narrative_fields(pages):
    """Read explicit certificate wording, independently of intake values.

    Require recipient/award cues rather than guessing from font size or an
    arbitrary name/year elsewhere in a document. Ambiguous readings are omitted.
    """
    candidates = {key: set() for key in DEFAULT_FIELDS}
    award_start = re.compile(r"^(?:bachelor|master|doctor|diploma|certificate)\b", re.I)
    for page in pages:
        positioned = page.get("lines", [])
        lines = [line.get("text", "").strip() for line in positioned if line.get("text", "").strip()]
        if not lines:
            lines = _lines_from_pages([page])
        for index, line in enumerate(lines):
            recipient = re.fullmatch(r"(?:the\s+university\s+confers\s+upon|this\s+is\s+to\s+certify\s+that)\s*[:,-]?\s*(.*)", line, re.I)
            if recipient:
                name = recipient.group(1).strip() or (lines[index + 1] if index + 1 < len(lines) else "")
                if 2 <= len(name.split()) <= 8 and all(c.isalpha() or c in " .'-’" for c in name) and not re.search(r"\b(university|degree|bachelor|master|registrar|chancellor|awarded|completed)\b", name, re.I):
                    candidates["student_name"].add(name)
            award = re.fullmatch(r"(?:the\s+)?degree\s+of\s*(.*)", line, re.I)
            if award:
                title = award.group(1).strip() or (lines[index + 1] if index + 1 < len(lines) else "")
                if award_start.match(title):
                    # A wrapped title may continue with its subject on the next line.
                    following = index + (2 if not award.group(1).strip() else 1)
                    if following < len(lines) and re.match(r"^(?:in|of)\s+", lines[following], re.I):
                        title += " " + lines[following]
                    candidates["degree_title"].add(title)
            year = re.fullmatch(r"(?:graduated|completed|awarded)(?:\s+and\s+issued)?\s+in\s+((?:19|20)\d{2})[.]?", line, re.I)
            if year:
                candidates["graduation_year"].add(year.group(1))
        # Institution headings must precede the credential body, not be a
        # university mentioned in a course, footer, or signature block.
        for index, line in enumerate(lines[:5]):
            if re.search(r"\b(certif(?:icate|y)|transcript|confers|student)\b", line, re.I):
                break
            if re.search(r"\b(university|college|polytechnic|institute)\b", line, re.I) and not re.search(r"[:|]", line) and 2 <= len(line.split()) <= 12:
                institution = line
                country = lines[index + 1].split("|", 1)[0].strip() if index + 1 < len(lines) else ""
                if normalize(country) == "sierra leone":
                    institution += " " + country
                candidates["institution"].add(institution)
    return {key: next(iter(values)) for key, values in candidates.items() if len(values) == 1}


def extract_fields(pages: list[dict], fields: tuple[str, ...] = DEFAULT_FIELDS) -> dict[str, str]:
    """Pull the configured fields out of analyzed pages.

    Returns a mapping of field name to the extracted string. A field with no
    confidence is absent from the mapping entirely, which the caller must treat
    as `not_found` rather than as agreement.
    """
    lines = _lines_from_pages(pages)
    found: dict[str, str] = {}

    for field in fields:
        labels = FIELD_LABELS.get(field)
        if not labels:
            continue

        for label in labels:
            for index, line in enumerate(lines):
                value = _split_label(line, label)
                if value:
                    found[field] = value
                    break
                if value == "":
                    # Label at end of line: take the next non-empty line.
                    for follow in lines[index + 1:index + 3]:
                        if follow.strip():
                            found[field] = follow.strip()
                            break
                    if field in found:
                        break
            if field in found:
                break

    # PDF/OCR reading order can list the whole label column before its values.
    # Use positioned lines to associate a label with the value beside it first.
    all_labels = [label for labels in FIELD_LABELS.values() for label in labels]
    extra_labels = {"student identification", "transcript reference", "department",
                    "period of study", "final classification"}
    def is_label(text):
        return text.strip().lower().rstrip(":") in set(all_labels) | extra_labels

    for field in fields:
        candidates = []
        for page in pages:
            positioned = [line for line in page.get("lines", []) if len(line.get("bbox", [])) == 4]
            for label_line in positioned:
                text = label_line.get("text", "").strip()
                if not any(_split_label(text, label) == "" for label in FIELD_LABELS.get(field, ())):
                    continue
                x0, y0, x1, y1 = label_line["bbox"]
                for line in positioned:
                    value = line.get("text", "").strip()
                    if not value or is_label(value) or line is label_line:
                        continue
                    a, b, c, d = line["bbox"]
                    overlap = min(y1, d) - max(y0, b)
                    if a >= x1 and overlap > min(y1 - y0, d - b) * .4:
                        candidates.append((0, a - x1, value))
                    elif 0 <= b - y1 < 22 and abs(a - x0) < 15:
                        candidates.append((1, b - y1, value))
        if candidates:
            found[field] = min(candidates, key=lambda item: item[:2])[2]
        elif field in found and is_label(found[field]):
            del found[field]
    if "graduation_year" in found:
        year = re.match(r"^(?:19|20)\d{2}\b", found["graduation_year"])
        if year:
            found["graduation_year"] = year.group()
    for key, value in _narrative_fields(pages).items():
        if key in fields and key not in found:
            found[key] = value
    return found


def document_text(pages: list[dict]) -> str:
    """All text in the document as one string, for substring evidence."""
    return "\n".join(str(page.get("text", "")) for page in pages if page.get("text"))


def find_verbatim(pages: list[dict], expected: str) -> bool:
    """Whether `expected` appears in the document as text, ignoring formatting.

    A certificate laid out the way certificates are actually laid out — centred,
    decorative, "This is to certify that / AMA BOATENG / ... degree of /
    BACHELOR OF SCIENCE" — has no labels at all, so label extraction finds nothing
    and every field reports `not_found`. The Registrar is then told the document
    could not be verified on a document that plainly states all of it.

    Searching for the intake value closes that gap without pretending to
    understand the layout. It is a strictly weaker claim than parsing a field,
    and it is reported as such: `extracted` stays `None`, the status carries its
    own `evidence` marker, and the detail says the value was found as text
    rather than read from a labelled field.

    It can only ever turn a `not_found` into a `match` when the expected value is
    genuinely present, so it cannot manufacture agreement. A document that names
    the wrong person leaves the field `not_found`, which is the safe direction.
    """
    needle = normalize(expected)
    if not needle:
        return False
    return needle in normalize(document_text(pages))


def compare_field(
    field: str,
    expected: str,
    extracted: str | None,
    *,
    verbatim: bool = False,
) -> dict:
    """Compare one intake value against what the document says.

    The returned dict is the unit the Registrar actually reviews, so it carries
    both the judgement and the evidence behind it.
    """
    threshold = FIELD_THRESHOLDS.get(field, 0.8)

    if extracted is None or not normalize(extracted):
        if verbatim:
            return {
                "field": field,
                # Not `match`. The value is genuinely present, so blocking the
                # issuance would strand a legible document, but reporting it as
                # an ordinary match made a substring search indistinguishable
                # from reading a labelled field — in the counts, in the chip, and
                # in the `resolve` audit trail. It is its own status so it is
                # counted, displayed and stored separately. It does not block:
                # the Registrar's approval is still required either way, and
                # `UNRESOLVED_STATUSES` is what decides whether a review can be
                # approved without a written reason.
                "status": "verbatim_match",
                "expected": expected,
                "extracted": None,
                "similarity": 1.0,
                "threshold": threshold,
                "evidence": "verbatim_text",
                "detail": (
                    f"The document has no labelled '{field}' field, but the record's "
                    f"value '{expected}' appears in its text. Verify it is in the "
                    f"position you expect before approving."
                ),
            }
        return {
            "field": field,
            "status": "not_found",
            "expected": expected,
            "extracted": None,
            "similarity": None,
            "threshold": threshold,
            "detail": "No labelled value for this field was found in the document.",
        }

    if not normalize(expected):
        return {
            "field": field,
            "status": "not_compared",
            "expected": expected,
            "extracted": extracted,
            "similarity": None,
            "threshold": threshold,
            "detail": "No intake value to compare against.",
        }

    if field == "degree_title":
        from institutions.degree_awards import canonical_award
        expected_award, extracted_award = canonical_award(expected), canonical_award(extracted)
        score = similarity(expected_award, extracted_award)
        # Matching subject words cannot erase a different degree award.
        awards = ("bachelor of science in engineering", "bachelor of science", "bachelor of arts")
        left = next((award for award in awards if expected_award.startswith(award)), None)
        right = next((award for award in awards if extracted_award.startswith(award)), None)
        if left and right and left != right:
            score = min(score, .6)
    else:
        score = similarity(expected, extracted)
    agrees = score >= threshold
    return {
        "field": field,
        "status": "match" if agrees else "mismatch",
        "expected": expected,
        "extracted": extracted,
        "similarity": score,
        "threshold": threshold,
        "detail": None if agrees else (
            f"The document reads '{extracted}' but the record says '{expected}' "
            f"(match {int(score * 100)}%, needs {int(threshold * 100)}%)."
        ),
    }


def compare_fields(
    expected: dict[str, str],
    extracted: dict[str, str],
    fields: tuple[str, ...] = DEFAULT_FIELDS,
    *,
    pages: list[dict] | None = None,
    verbatim_fallback: bool = True,
) -> list[dict]:
    """Compare every configured field, preserving `fields` order.

    Pass `pages` to let a field that has no labelled value fall back to a verbatim
    search for the record's own value. It is on by default because the alternative
    is reporting `not_found` for every field of a perfectly legible certificate.
    Pass `verbatim_fallback=False` to require a parsed label for a field to count.
    """
    results = []
    for field in fields:
        want = expected.get(field, "")
        found = extracted.get(field)
        verbatim = False
        if (
            verbatim_fallback
            and pages is not None
            and (found is None or not normalize(found))
            and normalize(want)
        ):
            verbatim = find_verbatim(pages, want)
        results.append(compare_field(field, want, found, verbatim=verbatim))
    return results


#: Statuses that require a Registrar decision before the document can be used.
#:
#: `not_compared` is excluded: it means the intake record had nothing to compare
#: against, which is a data-entry matter on the certificate rather than a
#: question about this document, and gating on it would block issuances over an
#: empty intake field.
#:
#: `verbatim_match` is excluded for a different reason. It is a weaker claim than
#: a parsed match, but it is not a *disagreement* — the value is demonstrably in
#: the document, so making it unresolved would mean an override with a written
#: reason for every field of every label-less certificate, which is the noise
#: that makes people approve without reading. The weaker claim is surfaced in the
#: status itself, in the review panel, and in the stored comparisons, so it is
#: never silently folded into the fields that were actually read.
UNRESOLVED_STATUSES = frozenset({"mismatch", "not_found"})

#: Statuses that count as agreement but were not established by reading a field.
WEAK_MATCH_STATUSES = frozenset({"verbatim_match"})


def unresolved(comparisons: list[dict]) -> list[dict]:
    """Return the comparisons still needing a Registrar decision."""
    return [item for item in comparisons if item["status"] in UNRESOLVED_STATUSES]


def weak_evidence(comparisons: list[dict]) -> list[dict]:
    """Fields confirmed by text search rather than by reading a labelled value."""
    return [item for item in comparisons if item["status"] in WEAK_MATCH_STATUSES]


def summarize(comparisons: list[dict]) -> dict:
    """Counts and a blocking verdict for a comparison result."""
    counts = {
        "match": 0,
        "mismatch": 0,
        "not_found": 0,
        "not_compared": 0,
        # Reported apart from `match` so "3 fields agree" cannot quietly include
        # 3 substring searches.
        "verbatim_match": 0,
    }
    for item in comparisons:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    pending = unresolved(comparisons)
    weak = weak_evidence(comparisons)
    return {
        "counts": counts,
        "unresolved_count": len(pending),
        "weak_evidence_count": len(weak),
        "requires_review": bool(pending),
    }
