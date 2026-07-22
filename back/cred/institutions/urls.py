from django.urls import path
from .views import (
    InstitutionListCreateView,
    InstitutionDetailView,
    InstitutionApplyView,
    PendingApplicationsView,
    ReviewApplicationView,
    BindWalletView,
    AnchorOnChainView,
    InviteRegistrarView,
    AuthorizeRegistrarOnChainView,
    RevokeRegistrarOnChainView,
)
from .wallet_auth import WalletChallengeView, WalletVerifyView
from .apply_wallet import ApplyWalletChallengeView, ApplyWalletVerifyView
from .catalog_views import (
    DepartmentListCreateView,
    DepartmentDetailView,
    ProgramListCreateView,
    ProgramDetailView,
    GradeClassificationListCreateView,
    GradeClassificationDetailView,
    GradeClassificationReorderView,
)
from .branding_views import CertificateBrandingView

urlpatterns = [
    path("institutions/",            InstitutionListCreateView.as_view(), name="institution-list-create"),
    path("institutions/<uuid:pk>/",  InstitutionDetailView.as_view(),     name="institution-detail"),

    path("institutions/apply/",
         InstitutionApplyView.as_view(),          name="institution-apply"),
    path("institutions/apply/wallet/challenge/",
         ApplyWalletChallengeView.as_view(),      name="apply-wallet-challenge"),
    path("institutions/apply/wallet/verify/",
         ApplyWalletVerifyView.as_view(),         name="apply-wallet-verify"),

    path("institutions/<uuid:pk>/bind-wallet/",
         BindWalletView.as_view(),                name="institution-bind-wallet"),
    path("institutions/<uuid:pk>/anchor/",
         AnchorOnChainView.as_view(),             name="institution-anchor"),

    path("admin/institutions/pending/",
         PendingApplicationsView.as_view(),       name="admin-pending-applications"),
    path("admin/institutions/<uuid:pk>/review/",
         ReviewApplicationView.as_view(),         name="admin-review-application"),

    path("institutions/registrars/invite/",
         InviteRegistrarView.as_view(),           name="registrar-invite"),
    path("institutions/registrars/authorize/",
         AuthorizeRegistrarOnChainView.as_view(), name="registrar-authorize"),
    path("institutions/registrars/<uuid:pk>/revoke/",
         RevokeRegistrarOnChainView.as_view(),    name="registrar-revoke"),

    path("auth/wallet/challenge/",
         WalletChallengeView.as_view(),           name="wallet-challenge"),
    path("auth/wallet/verify/",
         WalletVerifyView.as_view(),              name="wallet-verify"),

    # Academic catalog (off-chain)
    path("catalog/departments/",
         DepartmentListCreateView.as_view(),      name="catalog-departments"),
    path("catalog/departments/<uuid:pk>/",
         DepartmentDetailView.as_view(),          name="catalog-department-detail"),
    path("catalog/programs/",
         ProgramListCreateView.as_view(),         name="catalog-programs"),
    path("catalog/programs/<uuid:pk>/",
         ProgramDetailView.as_view(),             name="catalog-program-detail"),
    path("catalog/grades/",
         GradeClassificationListCreateView.as_view(), name="catalog-grades"),
    path("catalog/grades/reorder/",
         GradeClassificationReorderView.as_view(), name="catalog-grades-reorder"),
    path("catalog/grades/<uuid:pk>/",
         GradeClassificationDetailView.as_view(), name="catalog-grade-detail"),

    # Certificate branding (Settings → Certificate Branding)
    path("certificate-branding/",
         CertificateBrandingView.as_view(),       name="certificate-branding"),
]
