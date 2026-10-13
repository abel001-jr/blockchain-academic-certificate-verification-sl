import re

AWARDS = {"bsc": "Bachelor of Science", "bsc_eng": "Bachelor of Science in Engineering", "ba": "Bachelor of Arts"}


def canonical_award(value):
    value = value.strip().lower()
    value = re.sub(r"(?<=[a-z])[.](?=[a-z])", "", value)
    value = re.sub(r"\b(bsc\s*eng|bse)\b\.?", "bachelor of science in engineering", value)
    value = re.sub(r"\bbsc\b\.?", "bachelor of science", value)
    value = re.sub(r"\bba\b\.?", "bachelor of arts", value)
    return re.sub(r"\s+", " ", value).strip()


def formal_program_title(title, degree_award):
    if not degree_award:
        return title
    if canonical_award(title).startswith("bachelor of "):
        return title
    return f"{AWARDS[degree_award]} in {title}"
