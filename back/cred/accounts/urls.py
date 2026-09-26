"""accounts/urls.py"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CredenceTokenObtainView,
    MeView,
    ChangePasswordView,
    UserListCreateView,
    UserDetailView,
    AuthorizeOfficerOnChainView,
    RevokeOfficerOnChainView,
    ResendOfficerInviteView,
)
from .officer_setup import (
    OfficerSetupWalletChallengeView,
    OfficerSetupWalletVerifyView,
    OfficerSetupPasswordView,
)
from .signature_views import OfficerSignatureView
from .student_invite_views import StudentInviteClaimView
from .google_auth_views import GoogleAuthView

urlpatterns = [
    # Auth
    path("auth/login/",                   CredenceTokenObtainView.as_view(),  name="token-obtain"),
    path("auth/refresh/",                 TokenRefreshView.as_view(),         name="token-refresh"),
    path("auth/google/",                  GoogleAuthView.as_view(),           name="google-auth"),
    path("auth/student-invite/claim/",    StudentInviteClaimView.as_view(),   name="student-invite-claim"),

    # Profile
    path("auth/me/",             MeView.as_view(),                  name="me"),
    path("auth/change-password/",ChangePasswordView.as_view(),      name="change-password"),
    path("auth/signature/",      OfficerSignatureView.as_view(),    name="officer-signature"),

    # Officer setup gate (limited JWT only)
    path(
        "auth/officer-setup/wallet/challenge/",
        OfficerSetupWalletChallengeView.as_view(),
        name="officer-setup-wallet-challenge",
    ),
    path(
        "auth/officer-setup/wallet/verify/",
        OfficerSetupWalletVerifyView.as_view(),
        name="officer-setup-wallet-verify",
    ),
    path(
        "auth/officer-setup/password/",
        OfficerSetupPasswordView.as_view(),
        name="officer-setup-password",
    ),

    # User management (admin)
    path("users/",               UserListCreateView.as_view(),       name="user-list-create"),
    path("users/<uuid:pk>/",     UserDetailView.as_view(),           name="user-detail"),
    path(
        "users/<uuid:pk>/resend-invite/",
        ResendOfficerInviteView.as_view(),
        name="officer-resend-invite",
    ),
    path(
        "users/<uuid:pk>/authorize-on-chain/",
        AuthorizeOfficerOnChainView.as_view(),
        name="officer-authorize-on-chain",
    ),
    path(
        "users/<uuid:pk>/revoke-on-chain/",
        RevokeOfficerOnChainView.as_view(),
        name="officer-revoke-on-chain",
    ),
]
