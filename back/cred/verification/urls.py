from django.urls import path
from .views import VerifyCertificateView
from .document_views import SharedCredentialDocumentsView
from .stats_views import PublicStatsView
from .consent_views import (
    ConsentRequestCreateView,
    ConsentRequestPollView,
    ConsentRequestRespondView,
    ConsentRequestPendingListView,
)

urlpatterns = [
    # ── Public landing-page stats ─────────────────────────────────────────────
    path("public/stats/", PublicStatsView.as_view(), name="public-stats"),

    # ── Public certificate verification ──────────────────────────────────────
    path("verify/<str:certificate_id>/",               VerifyCertificateView.as_view(),     name="verify-certificate"),
    path("verify/<str:certificate_id>/documents/",      SharedCredentialDocumentsView.as_view(), name="verify-credential-documents"),

    # ── Employer consent request ──────────────────────────────────────────────
    # POST  — employer submits request (no auth)
    path("verify/<str:certificate_id>/request-consent/", ConsentRequestCreateView.as_view(), name="consent-request-create"),

    # GET   — employer polls for decision (no auth)
    path("verify/consent/<uuid:request_id>/",            ConsentRequestPollView.as_view(),   name="consent-request-poll"),

    # POST  — student responds approve/deny (requires JWT)
    path("verify/consent/<uuid:request_id>/respond/",    ConsentRequestRespondView.as_view(), name="consent-request-respond"),

    # GET   — student lists pending incoming requests (requires JWT)
    path("verify/consent/pending/",                      ConsentRequestPendingListView.as_view(), name="consent-request-pending"),
]
