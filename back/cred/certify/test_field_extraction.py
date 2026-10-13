"""Focused checks on the field-extraction core, run without the Django test DB.

The comparison thresholds are the part most likely to be quietly wrong, and a
wrong threshold either flags correct documents or waves through wrong ones.
These assertions pin the cases that motivated the configuration.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cred.settings")

from certify.field_extraction import (  # noqa: E402
    DEFAULT_FIELDS,
    _lines_from_pages,
    compare_field,
    compare_fields,
    extract_fields,
    similarity,
    summarize,
    unresolved,
    weak_evidence,
)


def _page(text, line_height=12.0):
    """Build one analyzed page from a list of lines, as analyze_pdf would."""
    items = []
    for row, line in enumerate(text):
        left = 0.0
        for token in line.split():
            items.append({
                "text": token,
                "bbox": [left, row * line_height, left + 6 * len(token), row * line_height + 9],
            })
            left += 6 * len(token) + 4
    return {"page": 1, "method": "text_layer", "text": " ".join(text), "items": items}


CASES = []


def case(fn):
    CASES.append(fn)
    return fn


@case
def test_label_same_line():
    pages = [_page(["Certificate of Achievement", "Name: Ada Lovelace", "Degree: BSc Computer Science"])]
    found = extract_fields(pages)
    assert found["student_name"] == "Ada Lovelace", found
    assert found["degree_title"] == "BSc Computer Science", found


@case
def test_label_value_on_next_line():
    # Common when the label sits in a left column and the value is underlined.
    pages = [_page(["Student Name:", "Grace Hopper", "Award:", "BSc Mathematics"])]
    found = extract_fields(pages)
    assert found["student_name"] == "Grace Hopper", found
    assert found["degree_title"] == "BSc Mathematics", found


@case
def test_specific_label_beats_generic():
    # "Student:" must win over the bare "name" fallback on the same document.
    pages = [_page(["Full Name: Ada Lovelace", "Name of Institution: Uni of Mines SL"])]
    found = extract_fields(pages)
    assert found["student_name"] == "Ada Lovelace", found
    assert found["institution"] == "Uni of Mines SL", found


@case
def test_absent_field_is_absent_not_empty():
    # The important property: a missing field must be missing, so the caller can
    # report not_found instead of silently agreeing.
    pages = [_page(["Certificate of Achievement", "Name: Ada Lovelace"])]
    found = extract_fields(pages)
    assert "institution" not in found, found
    assert "degree_title" not in found, found


@case
def test_accent_and_case_folding():
    assert similarity("Zoë Müller", "Zoe Muller") == 1.0
    assert similarity("ADA LOVELACE", "ada lovelace") == 1.0


@case
def test_name_word_reordering():
    assert similarity("Ada Lovelace", "Lovelace, Ada") >= 0.82


@case
def test_genuinely_different_name_fails():
    assert similarity("Ada Lovelace", "Alan Turing") < 0.82


@case
def test_punctuation_insensitive_degree():
    assert similarity("B.Sc. Computer Science", "BSc Computer Science") == 1.0
    assert similarity("BSc Computer Science", "BSc Computer Scienc") >= 0.78


@case
def test_institution_abbreviation_tolerated():
    # The same institution legitimately renders several ways.
    assert similarity("University of Mines", "Uni of Mines SL") >= 0.70


@case
def test_different_institution_fails():
    assert similarity("University of Mines", "University of Ghana") < 0.70


@case
def test_year_is_exact():
    assert compare_field("graduation_year", "2026", "2026")["status"] == "match"
    assert compare_field("graduation_year", "2026", "2025")["status"] == "mismatch"


@case
def test_not_found_is_distinct_from_match():
    result = compare_field("student_name", "Ada Lovelace", None)
    assert result["status"] == "not_found", result
    assert result["extracted"] is None, result


@case
def test_empty_extraction_counts_as_not_found():
    assert compare_field("student_name", "Ada Lovelace", "   ")["status"] == "not_found"


@case
def test_missing_intake_value_does_not_gate():
    # An empty intake field is a certificate data-entry problem, not a problem
    # with this document, so it must not block the document review.
    result = compare_field("degree_title", "", "BSc Computer Science")
    assert result["status"] == "not_compared", result
    assert result not in unresolved([result]), result


@case
def test_summarize_counts_and_verdict():
    comparisons = compare_fields(
        expected={
            "student_name": "Ada Lovelace",
            "degree_title": "BSc Computer Science",
            "institution": "University of Mines",
            "graduation_year": "2026",
        },
        extracted={
            "student_name": "Ada Lovelace",
            "degree_title": "BSc Computer Science",
            "institution": "University of Ghana",
        },
    )
    summary = summarize(comparisons)
    assert summary["counts"]["match"] == 2, summary
    assert summary["counts"]["mismatch"] == 1, summary
    assert summary["counts"]["not_found"] == 1, summary
    assert summary["requires_review"] is True, summary

    fields = {item["field"] for item in unresolved(comparisons)}
    assert fields == {"institution", "graduation_year"}, fields


@case
def test_fully_matching_document_does_not_gate():
    comparisons = compare_fields(
        expected={
            "student_name": "Ada Lovelace",
            "degree_title": "BSc Computer Science",
            "institution": "University of Mines",
            "graduation_year": "2026",
        },
        extracted={
            "student_name": "Ada Lovelace",
            "degree_title": "BSc Computer Science",
            "institution": "University of Mines",
            "graduation_year": "2026",
        },
    )
    summary = summarize(comparisons)
    assert summary["requires_review"] is False, summary
    assert summary["unresolved_count"] == 0, summary


@case
def test_heading_is_not_mistaken_for_a_label():
    """A heading that merely starts with a label word must not become a value.

    "Faculty of Science" begins with "faculty", which is in the institution label
    list. Read as a label it yields "of Science" — a confident wrong answer, and
    worse than nothing because it looks like a successful extraction. A real label
    is followed by a separator or ends the line; a heading is followed by prose.
    """
    pages = [_page([
        "Northern University",
        "Faculty of Science",
        "Name: Ada Lovelace",
    ])]
    found = extract_fields(pages)
    assert "institution" not in found, found
    assert found["student_name"] == "Ada Lovelace", found


@case
def test_generic_label_with_separator_is_still_honoured():
    """The fix must not throw out the real use of the same word."""
    pages = [_page(["Faculty: Uni of Mines SL", "Name: Ada Lovelace"])]
    found = extract_fields(pages)
    assert found["institution"] == "Uni of Mines SL", found


@case
def test_generic_label_ending_the_line_is_still_honoured():
    pages = [_page(["Name:", "Grace Hopper", "Faculty:", "Uni of Mines SL"])]
    found = extract_fields(pages)
    assert found["institution"] == "Uni of Mines SL", found


@case
def test_absence_of_all_labels_reads_as_not_found():
    """A centred certificate with no labels must yield nothing, not guesses.

    This is the common real shape: "CERTIFICATE OF ACHIEVEMENT / this is to
    certify that / AMA BOATENG / ... degree of / BACHELOR OF SCIENCE". Every
    field is absent, and the correct answer is that none of them were found.
    """
    pages = [_page([
        "CERTIFICATE OF ACHIEVEMENT",
        "This is to certify that",
        "AMA BOATENG",
        "has satisfied all the requirements for the degree of",
        "BACHELOR OF SCIENCE IN COMPUTER SCIENCE",
        "Northern University",
        "2026",
    ])]
    found = extract_fields(pages)
    assert found == {}, found


@case
def test_verbatim_fallback_verifies_an_unlabelled_document():
    """A centred certificate states everything and labels nothing.

    Without the fallback every field is not_found, so a Registrar is told a
    perfectly legible document could not be verified. The fallback is a weaker
    claim than parsing, and must be reported as one.
    """
    pages = [_page([
        "CERTIFICATE OF ACHIEVEMENT",
        "This is to certify that",
        "AMA BOATENG",
        "BACHELOR OF SCIENCE IN COMPUTER SCIENCE",
        "Northern University",
        "2026",
    ])]
    found = extract_fields(pages)
    assert found == {}, found

    comparisons = compare_fields(
        {
            "student_name": "Ama Boateng",
            "degree_title": "Bachelor of Science in Computer Science",
            "institution": "Northern University",
            "graduation_year": "2026",
        },
        found,
        pages=pages,
    )
    by_field = {item["field"]: item for item in comparisons}
    for field in ("student_name", "degree_title", "institution", "graduation_year"):
        # Its own status, not `match`: a substring search and a parsed field must
        # never be indistinguishable in the counts or the audit trail.
        assert by_field[field]["status"] == "verbatim_match", by_field[field]
        assert by_field[field]["evidence"] == "verbatim_text", by_field[field]
        assert by_field[field]["extracted"] is None, by_field[field]
    assert summarize(comparisons)["requires_review"] is False


@case
def test_verbatim_matches_are_counted_apart_from_parsed_matches():
    """A summary that reports "4 agree" for 4 text searches is the bug itself.

    The whole point of a separate status is that the counts cannot hide it.
    """
    pages = [_page(["AMA BOATENG", "Northern University", "2026"])]
    comparisons = compare_fields(
        {"student_name": "Ama Boateng", "institution": "Northern University"},
        {"student_name": "Ama Boateng"},
        pages=pages,
    )
    by_field = {item["field"]: item for item in comparisons}
    assert by_field["student_name"]["status"] == "match", by_field["student_name"]
    assert by_field["institution"]["status"] == "verbatim_match", by_field["institution"]

    counts = summarize(comparisons)["counts"]
    assert counts["match"] == 1, counts
    assert counts["verbatim_match"] == 1, counts
    assert summarize(comparisons)["weak_evidence_count"] == 1
    assert [item["field"] for item in weak_evidence(comparisons)] == ["institution"]


@case
def test_verbatim_matches_do_not_block_but_are_still_reported():
    """Non-blocking, but never silent: the weaker claim has to survive to the UI."""
    pages = [_page(["AMA BOATENG", "2026"])]
    comparisons = compare_fields(
        {"student_name": "Ama Boateng", "graduation_year": "2026"},
        {},
        pages=pages,
        fields=("student_name", "graduation_year"),
    )
    assert unresolved(comparisons) == [], comparisons
    summary = summarize(comparisons)
    assert summary["requires_review"] is False
    assert summary["unresolved_count"] == 0
    assert summary["weak_evidence_count"] == 2


@case
def test_verbatim_fallback_never_manufactures_agreement():
    """The load-bearing safety property.

    If the document names somebody else, the field must stay unresolved. A
    fallback that can turn a wrong document into a match is worse than no
    fallback at all, because the Registrar stops reading.
    """
    pages = [_page([
        "CERTIFICATE OF ACHIEVEMENT",
        "AMA BOATENG",
        "BACHELOR OF SCIENCE",
    ])]
    comparisons = compare_fields(
        {"student_name": "Yaw Mensah", "degree_title": "BACHELOR OF SCIENCE"},
        {},
        pages=pages,
    )
    by_field = {item["field"]: item for item in comparisons}
    assert by_field["student_name"]["status"] == "not_found", by_field["student_name"]
    assert by_field["student_name"]["field"] in {
        item["field"] for item in unresolved(comparisons)
    }
    assert summarize(comparisons)["requires_review"] is True


@case
def test_verbatim_fallback_can_be_switched_off():
    pages = [_page(["AMA BOATENG", "Northern University"])]
    strict = compare_fields(
        {"student_name": "Ama Boateng"}, {}, pages=pages, verbatim_fallback=False
    )
    assert strict[0]["status"] == "not_found", strict
    assert "evidence" not in strict[0]


@case
def test_verbatim_fallback_does_not_override_a_real_disagreement():
    """A parsed field that disagrees stays a mismatch.

    The fallback only applies to fields with no value at all. Where the document
    has a label and it says something different, that reading wins.
    """
    pages = [_page(["Name: Yaw Mensah", "BACHELOR OF SCIENCE"])]
    comparisons = compare_fields(
        {"student_name": "Ama Boateng"},
        {"student_name": "Yaw Mensah"},
        pages=pages,
    )
    assert comparisons[0]["status"] == "mismatch", comparisons[0]
    assert "evidence" not in comparisons[0]


# --- Extraction against a system-generated certificate -------------------------
#
# Characterisation, not endorsement. These pin what the extractor does to a PDF
# our own renderer produced, so that any later change is visible as a diff. The
# layout of a generated certificate is known exactly and needs no OCR, so these
# results say nothing about scanned registry-issued documents.
#
# The requirements for real documents are still being discussed, so nothing here
# changes the extraction logic; two of these cases document behaviour that is
# wrong and should be fixed once that is decided.


def _analyzed_sample(variant="issued"):
    import django
    from django.apps import apps

    if not apps.ready:
        django.setup()

    from certify.document_analysis import analyze_pdf
    from certify.management.commands.render_sample_certificate import (
        build_sample_certificate,
    )
    from institutions.pdf_certificate import generate_certificate_pdf

    data = generate_certificate_pdf(
        build_sample_certificate(),
        template=None,
        include_attestations=(variant == "issued"),
    )
    return analyze_pdf(data)


@case
def test_generated_certificate_yields_a_text_layer_without_ocr():
    """The reason a generated certificate is the right fixture: no OCR in the path."""
    pages = _analyzed_sample()["pages"]
    assert len(pages) == 1, pages
    assert pages[0]["method"] == "text_layer", pages[0]
    assert "Amara Sesay" in pages[0]["text"], pages[0]["text"]


@case
def test_label_matching_finds_nothing_in_our_own_certificate():
    """A known gap, pinned.

    Every field is correctly decided by the verbatim fallback, but nothing is
    read from a label. "This is to certify that", "degree of" and "has been
    awarded the" are not in FIELD_LABELS, and the word "University" in the
    institution's own name is part of the value, not a label preceding it.

    The consequence: a name appearing anywhere in the document — a reference
    number, a footer, a signature rendered as text — satisfies the fallback,
    because the fallback cannot tell a value read from the name field apart
    from a string found somewhere else.
    """
    pages = _analyzed_sample()["pages"]
    assert extract_fields(pages, DEFAULT_FIELDS) == {}


@case
def test_generated_certificate_fields_all_settle_as_verbatim_evidence():
    """Correct answers, reached by the weaker route — and reported as such."""
    pages = _analyzed_sample()["pages"]
    comparisons = compare_fields(
        {
            "student_name": "Amara Sesay",
            "degree_title": "Bachelor of Science in Computer Science",
            "institution": "Cavendish University Sierra Leone",
            "graduation_year": "2026",
        },
        extract_fields(pages, DEFAULT_FIELDS),
        pages=pages,
    )
    assert {item["field"] for item in comparisons} == set(DEFAULT_FIELDS), comparisons
    assert all(item["status"] == "verbatim_match" for item in comparisons), comparisons
    assert [item["field"] for item in weak_evidence(comparisons)] == list(DEFAULT_FIELDS)


@case
def test_signature_row_columns_are_merged_into_one_line():
    """A known defect, pinned so that fixing it shows up as a failing test.

    "Registrar", "Vice Chancellor" and "Dean" share a baseline, and so does the
    centred review-copy marker on the same page. Grouping by Y alone concatenates
    all four, in X order, into a single line that reads as nonsense:

        Registrar Vice Review Chancellor copy — unsigned, not yet issued Dean

    The same grouping merges the three approver names and the three
    "Digitally Verified" lines on the issued copy. A value sitting in any of
    those positions cannot be attributed to its label.
    """
    review = _lines_from_pages(_analyzed_sample("review")["pages"])
    merged = [
        line
        for line in review
        if "Registrar" in line and "Dean" in line and "unsigned" in line
    ]
    assert len(merged) == 1, review

    issued = _lines_from_pages(_analyzed_sample("issued")["pages"])
    names = [line for line in issued if "Kamara" in line and "Conteh" in line]
    assert len(names) == 1, issued


if __name__ == "__main__":
    failures = 0
    for test in CASES:
        try:
            test()
            print(f"  ok  {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {test.__name__}: {exc}")
    print(f"\n{len(CASES) - failures}/{len(CASES)} passed")
    sys.exit(1 if failures else 0)
