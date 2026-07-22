from django.urls import path
from .views import VerifyCertificateView

urlpatterns = [
    path("verify/<str:certificate_id>/", VerifyCertificateView.as_view(), name="verify-certificate"),
]
