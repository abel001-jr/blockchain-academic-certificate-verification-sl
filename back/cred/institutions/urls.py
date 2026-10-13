from django.urls import path
from .analytics_views import InstitutionAnalyticsView
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
from .branding_views import CertificateBrandingView, InstitutionEmailSettingsView
from .template_views import TemplateSetupView, TemplateRevisionView, TemplatePageView, TemplateSampleView, CredentialTemplatePreviewView, CredentialPreflightView, TemplateRestartView, TemplateSuggestionsView
from .chain_config_views import ChainConfigView, CertificateChainConfigView
from .template_views import TemplateAISuggestionsView, TemplateDisableView, TemplateEnableView, TemplateEditView

urlpatterns = [
    path("institution-analytics/", InstitutionAnalyticsView.as_view(), name="institution-analytics"),
    path("certificate-templates/<uuid:pk>/edit/", TemplateEditView.as_view(), name="certificate-template-edit"),
    path("certificate-templates/enable/", TemplateEnableView.as_view(), name="certificate-template-enable"),
    path("certificate-templates/disable/", TemplateDisableView.as_view(), name="certificate-template-disable"),
    path("certificate-templates/<uuid:pk>/ai-suggestions/", TemplateAISuggestionsView.as_view(), name="certificate-template-ai-suggestions"),
    path("certificate-chain-config/", CertificateChainConfigView.as_view(), name="certificate-chain-config"),
    path("institution-email-settings/", InstitutionEmailSettingsView.as_view(), name="institution-email-settings"),
    path("certificate-templates/restart/", TemplateRestartView.as_view(), name="certificate-template-restart"),
    path("certificates/<uuid:pk>/preflight/", CredentialPreflightView.as_view(), name="credential-preflight"),
    path("certificate-templates/", TemplateSetupView.as_view(), name="certificate-templates"),
    path("certificate-templates/<uuid:pk>/", TemplateRevisionView.as_view(), name="certificate-template-revision"),
    path("certificate-templates/<uuid:pk>/page/", TemplatePageView.as_view(), name="certificate-template-page"),
    path("certificate-templates/<uuid:pk>/sample/", TemplateSampleView.as_view(), name="certificate-template-sample"),
    path("certificate-templates/<uuid:pk>/suggestions/", TemplateSuggestionsView.as_view(), name="certificate-template-suggestions"),
    path("certificates/<uuid:pk>/template-preview/", CredentialTemplatePreviewView.as_view(), name="credential-template-preview"),
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

    # Deployment-wide chain coordinates (Settings → Blockchain)
    path("chain-config/",
         ChainConfigView.as_view(),               name="chain-config"),
]
