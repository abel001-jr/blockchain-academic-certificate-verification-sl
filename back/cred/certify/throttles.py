from rest_framework.throttling import UserRateThrottle


class OfficerDocumentPreviewThrottle(UserRateThrottle):
    """Separate authenticated preview budget from ordinary dashboard reads."""

    scope = "officer_document_preview"
