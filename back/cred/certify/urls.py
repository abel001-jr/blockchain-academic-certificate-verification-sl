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
)
from .share_code_views import ShareCodeListCreateView, ShareCodeRevokeView
from .document_analysis_views import DocumentAnalysisView
from .transcript_views import (
    TranscriptListCreateView,
    TranscriptDetailView,
    TranscriptLinkCertificateView,
    TranscriptPinIPFSView,
    TranscriptSubmitForApprovalView,
    TranscriptVCApproveView,
    TranscriptDeanApproveView,
    StudentTranscriptsView,
)

urlpatterns = [
    path("documents/analyze/", DocumentAnalysisView.as_view(), name="document-analysis"),
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
    
    # ── Transcripts ───────────────────────────────────────────────────────────
    path("transcripts/",                                           TranscriptListCreateView.as_view(),       name="transcript-list-create"),
    path("transcripts/<uuid:pk>/",                                 TranscriptDetailView.as_view(),           name="transcript-detail"),
    path("transcripts/<uuid:pk>/link-certificate/",                TranscriptLinkCertificateView.as_view(),  name="transcript-link-certificate"),
    path("transcripts/<uuid:pk>/pin-ipfs/",                        TranscriptPinIPFSView.as_view(),          name="transcript-pin-ipfs"),
    path("transcripts/<uuid:pk>/submit-approval/",                 TranscriptSubmitForApprovalView.as_view(), name="transcript-submit-approval"),
    path("transcripts/<uuid:pk>/vc-approve/",                      TranscriptVCApproveView.as_view(),        name="transcript-vc-approve"),
    path("transcripts/<uuid:pk>/dean-approve/",                    TranscriptDeanApproveView.as_view(),      name="transcript-dean-approve"),
    
    # ── Student portal ────────────────────────────────────────────────────────
    path("my-certificates/",                                       StudentCertificatesView.as_view(),        name="my-certificates"),
    path("my-transcripts/",                                        StudentTranscriptsView.as_view(),         name="my-transcripts"),
    
    # ── Share codes ───────────────────────────────────────────────────────────
    path("my-certificates/<str:certificate_id>/share-codes/",      ShareCodeListCreateView.as_view(),        name="share-code-list-create"),
    path("my-certificates/<str:certificate_id>/share-codes/<uuid:code_id>/", ShareCodeRevokeView.as_view(), name="share-code-revoke"),
]
