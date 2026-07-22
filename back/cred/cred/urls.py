"""cred/urls.py — Root URL configuration."""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),

    # API v1
    path("api/", include("accounts.urls")),
    path("api/", include("institutions.urls")),
    path("api/", include("certify.urls")),
    path("api/", include("verification.urls")),
    path("api/", include("audit.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
