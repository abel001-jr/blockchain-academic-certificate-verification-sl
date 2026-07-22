from django.urls import path
from .views import (
    CertificateListCreateView,
    CertificateDetailView,
    CertificateUploadDocumentView,
    CertificatePrepareView,
    CertificateConfirmChainView,
    CertificateConfirmVCView,
    CertificateConfirmChancellorView,
    CertificateFinalizeView,
    CertificateConfirmFinalizeView,
    CertificateRevokeView,
    StudentCertificatesView,
)

urlpatterns = [
    path("certificates/",                                    CertificateListCreateView.as_view(),   name="certificate-list-create"),
    path("certificates/<uuid:pk>/",                          CertificateDetailView.as_view(),       name="certificate-detail"),
    path("certificates/<uuid:pk>/upload-document/",          CertificateUploadDocumentView.as_view(),name="certificate-upload-doc"),
    path("certificates/<uuid:pk>/prepare/",                  CertificatePrepareView.as_view(),      name="certificate-prepare"),
    path("certificates/<uuid:pk>/confirm-chain/",            CertificateConfirmChainView.as_view(), name="certificate-confirm-chain"),
    path("certificates/<uuid:pk>/confirm-vc/",               CertificateConfirmVCView.as_view(),    name="certificate-confirm-vc"),
    path("certificates/<uuid:pk>/confirm-chancellor/",       CertificateConfirmChancellorView.as_view(), name="certificate-confirm-chancellor"),
    path("certificates/<uuid:pk>/finalize/",                 CertificateFinalizeView.as_view(),     name="certificate-finalize"),
    path("certificates/<uuid:pk>/confirm-finalize/",         CertificateConfirmFinalizeView.as_view(), name="certificate-confirm-finalize"),
    path("certificates/<uuid:pk>/revoke/",                   CertificateRevokeView.as_view(),       name="certificate-revoke"),
    path("my-certificates/",                                 StudentCertificatesView.as_view(),     name="my-certificates"),
]
