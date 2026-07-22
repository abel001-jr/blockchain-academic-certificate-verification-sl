"""Formal certificate award wording by program qualification type."""

from .models import Program


def award_parts(qualification_type: str, degree_title: str) -> dict:
    """
    Build certificate conferral language.

    Returns:
      study_line: "has successfully completed the programme of study and"
      award_intro: "has been awarded the"
      award_phrase: e.g. "degree of Bachelor of Science in Nursing"
    """
    q = qualification_type or Program.QualificationType.BACHELORS
    title = (degree_title or "").strip() or "—"

    if q in (Program.QualificationType.BACHELORS, Program.QualificationType.MASTERS,
             Program.QualificationType.ASSOCIATE):
        kind = "degree"
        prep = "of"
    elif q in (Program.QualificationType.DIPLOMA, Program.QualificationType.POSTGRAD_DIPLOMA):
        kind = "diploma"
        prep = "of"
    elif q == Program.QualificationType.CERTIFICATE:
        kind = "certificate"
        prep = "in"
    else:
        kind = "degree"
        prep = "of"

    return {
        "study_line": "has successfully completed the programme of study and",
        "award_intro": "has been awarded the",
        "award_phrase": f"{kind} {prep} {title}",
        "qualification_type": q,
    }
