"""Seed default Commonwealth-style grade classifications on institution anchor."""

DEFAULT_GRADE_CLASSIFICATIONS = [
    (1, "First Class Honours"),
    (2, "Second Class Honours (Upper Division)"),
    (3, "Second Class Honours (Lower Division)"),
    (4, "Third Class Honours"),
    (5, "Pass"),
    (6, "Distinction"),
    (7, "Merit"),
    (8, "Credit"),
]


def seed_default_grade_classifications(institution) -> int:
    """
    Idempotent: create the 8 default grades if the institution has none yet.
    Returns number of rows created.
    """
    from .models import GradeClassification

    if GradeClassification.objects.filter(institution=institution).exists():
        return 0

    objs = [
        GradeClassification(
            institution=institution,
            label=label,
            sort_order=order,
            active=True,
        )
        for order, label in DEFAULT_GRADE_CLASSIFICATIONS
    ]
    GradeClassification.objects.bulk_create(objs)
    return len(objs)
