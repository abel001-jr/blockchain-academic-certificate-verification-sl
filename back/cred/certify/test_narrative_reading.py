from django.test import SimpleTestCase
from .field_extraction import extract_fields, compare_fields


CERTIFICATE = [
    "CENTRAL UNIVERSITY", "SIERRA LEONE",
    "Upon the recommendation of the appropriate academic authorities",
    "the University confers upon", "Isha Kamara", "the degree of",
    "Bachelor of Science in Computer Science", "FIRST CLASS HONOURS",
    "Department of Technology and Engineering",
    "with all the rights and privileges pertaining to this degree.",
    "Graduated and issued in 2026", "Wurrie Bah", "Registrar",
]


def page(lines, method="text_layer"):
    return {"page": 1, "method": method, "text": "\n".join(lines),
            "lines": [{"text": text, "bbox": [20, i * 20, 400, i * 20 + 12]} for i, text in enumerate(lines)]}


class NarrativeReadingTests(SimpleTestCase):
    def test_screenshot_certificate_extracts_all_fields_from_text_or_ocr(self):
        expected = {"student_name": "Isha Kamara", "degree_title": "Bachelor of Science in Computer Science",
                    "institution": "CENTRAL UNIVERSITY SIERRA LEONE", "graduation_year": "2026"}
        for method in ("text_layer", "ocr"):
            with self.subTest(method=method):
                found = extract_fields([page(CERTIFICATE, method)])
                self.assertEqual(found, expected)
                self.assertTrue(all(item["status"] == "match" for item in compare_fields(expected, found)))

    def test_intake_name_in_signature_cannot_override_document_recipient(self):
        pages = [page(CERTIFICATE)]
        comparisons = compare_fields({"student_name": "Wurrie Bah"}, extract_fields(pages), pages=pages)
        self.assertEqual(comparisons[0]["status"], "mismatch")
        self.assertEqual(comparisons[0]["extracted"], "Isha Kamara")

    def test_bare_course_and_issue_years_are_not_graduation_fields(self):
        found = extract_fields([page(["ACADEMIC TRANSCRIPT", "Year 1 2022/2023", "Issued in 2026", "Registrar", "Wurrie Bah"])])
        self.assertNotIn("student_name", found)
        self.assertNotIn("graduation_year", found)

    def test_conflicting_recipients_stay_unextracted(self):
        found = extract_fields([page(CERTIFICATE + ["the University confers upon", "Amara Sesay"])])
        self.assertNotIn("student_name", found)

    def test_labelled_transcript_values_still_take_priority(self):
        found = extract_fields([page(CERTIFICATE + ["Student full name: Amara Sesay", "Graduation year: 2025"])])
        self.assertEqual(found["student_name"], "Amara Sesay")
        self.assertEqual(found["graduation_year"], "2025")

    def test_real_pdf_preserves_narrative_extraction(self):
        import pymupdf as fitz
        from .document_analysis import analyze_pdf
        with fitz.open() as document:
            sheet = document.new_page()
            for index, text in enumerate(CERTIFICATE):
                sheet.insert_text((40, 40 + index * 24), text, fontsize=10)
            analysis = analyze_pdf(document.tobytes())
        found = extract_fields(analysis["pages"])
        self.assertFalse(analysis["ocr_used"])
        self.assertEqual(found["student_name"], "Isha Kamara")
        self.assertEqual(found["graduation_year"], "2026")

    def test_transcript_heading_excludes_department_from_institution(self):
        found = extract_fields([page(["CENTRAL UNIVERSITY", "Sierra Leone | Department of Technology and Engineering", "ACADEMIC TRANSCRIPT"])])
        self.assertEqual(found["institution"], "CENTRAL UNIVERSITY Sierra Leone")
