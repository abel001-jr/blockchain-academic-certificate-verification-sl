from .signature_readiness import SignatureReadinessView
from .chain_status_views import CertificateChainStatusView
from django.urls import path
from .views import (
    CertificateListCreateView,
    CertificateDetailView,
    CertificateUploadDocumentView,
    CertificateUploadAndAnchorView,
    CertificateUploadTranscriptView,
    CertificatePrepareView,
    CertificateConfirmChainView,
    CertificateConfirmVCView,
    CertificateConfirmChancellorView,
    CertificateFinalizeView,
    CertificateConfirmFinalizeView,
    CertificateRevokeView,
    StudentCertificatesView,
    CertificateResendInviteView,
    CertificateLinkStudentView,
    CertificateUpdateStudentEmailView,
)
from .platform_views import PlatformStatsView, PlatformCertificateOverviewView
from .document_review_views import DocumentAnalyzeView, DocumentReviewResolveView, DocumentReviewImagesView, OfficerCredentialDocumentView
from .share_code_views import ShareCodeListCreateView, ShareCodeRevokeView
from .document_analysis_views import DocumentAnalysisView
from .student_document_views import MyCertificateDocumentsView
from .draft_views import (
    CertificateDocumentPrepareView,
    CertificateAbandonView,
    CertificateDraftDocumentSaveView,
    CertificateDraftDocumentView,
)

urlpatterns = [
    path("certificates/<uuid:pk>/chain-status/", CertificateChainStatusView.as_view(), name="certificate-chain-status"),
    path("issuance/signature-readiness/", SignatureReadinessView.as_view(), name="signature-readiness"),
    path("certificates/<uuid:pk>/review-document/<str:kind>/", OfficerCredentialDocumentView.as_view(), name="officer-credential-document"),
    path("certificates/<uuid:pk>/document-reviews/<str:kind>/images/", DocumentReviewImagesView.as_view(), name="certificate-review-images"),
    path("certificates/<uuid:pk>/prepare-document/", CertificateDocumentPrepareView.as_view(), name="certificate-document-prepare"),
    path("documents/analyze/", DocumentAnalysisView.as_view(), name="document-analysis"),
    # ── Super Admin platform oversight ─────────────────────────────────────────
    path("admin/platform-stats/", PlatformStatsView.as_view(), name="platform-stats"),
    path("admin/certificates/overview/", PlatformCertificateOverviewView.as_view(), name="platform-certificate-overview"),
    # ── Certificates ──────────────────────────────────────────────────────────
    path("certificates/",                                          CertificateListCreateView.as_view(),      name="certificate-list-create"),
    path("certificates/<uuid:pk>/",                                CertificateDetailView.as_view(),          name="certificate-detail"),
    path("certificates/<uuid:pk>/upload-document/",                CertificateUploadDocumentView.as_view(),  name="certificate-upload-doc"),
    path("certificates/<uuid:pk>/upload-and-anchor/",              CertificateUploadAndAnchorView.as_view(), name="certificate-upload-anchor"),
    path("certificates/<uuid:pk>/upload-transcript/",              CertificateUploadTranscriptView.as_view(), name="certificate-upload-transcript"),
    path("certificates/<uuid:pk>/prepare/",                        CertificatePrepareView.as_view(),         name="certificate-prepare"),
    path("certificates/<uuid:pk>/confirm-chain/",                  CertificateConfirmChainView.as_view(),    name="certificate-confirm-chain"),
    path("certificates/<uuid:pk>/confirm-vc/",                     CertificateConfirmVCView.as_view(),       name="certificate-confirm-vc"),
    path("certificates/<uuid:pk>/confirm-chancellor/",             CertificateConfirmChancellorView.as_view(), name="certificate-confirm-chancellor"),
    path("certificates/<uuid:pk>/finalize/",                       CertificateFinalizeView.as_view(),        name="certificate-finalize"),
    path("certificates/<uuid:pk>/confirm-finalize/",               CertificateConfirmFinalizeView.as_view(), name="certificate-confirm-finalize"),
    path("certificates/<uuid:pk>/revoke/",                         CertificateRevokeView.as_view(),          name="certificate-revoke"),
    path("certificates/<uuid:pk>/resend-invite/",                  CertificateResendInviteView.as_view(),    name="certificate-resend-invite"),
    path("certificates/<uuid:pk>/link-student/",                   CertificateLinkStudentView.as_view(),     name="certificate-link-student"),
    path("certificates/<uuid:pk>/update-student-email/",           CertificateUpdateStudentEmailView.as_view(), name="certificate-update-student-email"),
    # ── Registrar document review (REMAINING_WORK item 4) ─────────────────────
    path("certificates/<uuid:pk>/analyze-document/",               DocumentAnalyzeView.as_view(),        name="certificate-analyze-document"),
    path("certificates/<uuid:pk>/document-reviews/<str:kind>/resolve/", DocumentReviewResolveView.as_view(), name="certificate-document-review-resolve"),

    # ── Resumable drafts (external-upload flow) ───────────────────────────────
    # Local, encrypted draft storage. These deliberately do not touch IPFS: a
    # draft is written to ordinary media storage and is pinned to Pinata once,
    # by upload-and-anchor/, at the point it is actually anchored.
    path("certificates/<uuid:pk>/save-draft-document/",          CertificateDraftDocumentSaveView.as_view(), name="certificate-save-draft-document"),
    path("certificates/<uuid:pk>/draft-document/",               CertificateDraftDocumentView.as_view(),     name="certificate-draft-document"),
    path("certificates/<uuid:pk>/abandon/",                      CertificateAbandonView.as_view(),            name="certificate-abandon"),

    # ── Student portal ────────────────────────────────────────────────────────
    path("my-certificates/",                                       StudentCertificatesView.as_view(),        name="my-certificates"),
    # The graduate's own copy of the pair. Public verification deliberately
    # serves no document, so without this a claimed student has no route to the
    # credential they were just sent a link for.
    path("my-certificates/<str:certificate_id>/documents/",        MyCertificateDocumentsView.as_view(),    name="my-certificate-documents"),
    
    # ── Share codes ───────────────────────────────────────────────────────────
    path("my-certificates/<str:certificate_id>/share-codes/",      ShareCodeListCreateView.as_view(),        name="share-code-list-create"),
    path("my-certificates/<str:certificate_id>/share-codes/<uuid:code_id>/", ShareCodeRevokeView.as_view(), name="share-code-revoke"),
]
