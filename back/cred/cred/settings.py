"""
CREDENCE – Django Settings
"""

from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env from the project root (same folder as manage.py)
load_dotenv(BASE_DIR / ".env")

# ── Security ───────────────────────────────────────────────────────────────
SECRET_KEY = os.environ["SECRET_KEY"]
DEBUG = os.getenv("DEBUG", "False") == "True"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# ── Applications ───────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
]

LOCAL_APPS = [
    "accounts",
    "institutions",
    "certify",
    "verification",
    "audit",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ── Middleware ─────────────────────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "cred.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "cred.wsgi.application"

# ── Database ───────────────────────────────────────────────────────────────
# Using SQLite for development. Switch to PostgreSQL when ready by
# setting USE_POSTGRES=True in .env and filling in the DB_* variables.

USE_POSTGRES = os.getenv("USE_POSTGRES", "False") == "True"

if USE_POSTGRES:
    DATABASES = {
        "default": {
            "ENGINE":   "django.db.backends.postgresql",
            "NAME":     os.getenv("DB_NAME", "credence_db"),
            "USER":     os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST":     os.getenv("DB_HOST", "localhost"),
            "PORT":     os.getenv("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME":   BASE_DIR / "db.sqlite3",
            # Avoid "database is locked" when admin + runserver overlap writes
            "OPTIONS": {
                "timeout": 30,
            },
        }
    }

# ── Custom User Model ──────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

# ── Password Validation ────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── Internationalisation ───────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ── Static / Media ─────────────────────────────────────────────────────────
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Django REST Framework ──────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
}

# ── SimpleJWT ──────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":  timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS":  True,
    "AUTH_HEADER_TYPES":      ("Bearer",),
    "USER_ID_FIELD":          "id",
    "USER_ID_CLAIM":          "user_id",
}

# ── CORS ───────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
).split(",")
CORS_ALLOW_CREDENTIALS = True

# ── Pinata / IPFS ──────────────────────────────────────────────────────────
# ── Pinata / IPFS ──────────────────────────────────────────────────────────────
PINATA_API_KEY        = os.getenv("PINATA_API_KEY", "")
PINATA_SECRET_API_KEY = os.getenv("PINATA_SECRET_API_KEY", "")
PINATA_JWT            = os.getenv("PINATA_JWT", "")
PINATA_GATEWAY        = os.getenv("PINATA_GATEWAY", "https://gateway.pinata.cloud")

# ── Blockchain ─────────────────────────────────────────────────────────────
ETH_RPC_URL                      = os.getenv("ETH_RPC_URL", "http://127.0.0.1:8545")
CERTIFICATE_REGISTRY_ADDRESS     = os.getenv("CERTIFICATE_REGISTRY_ADDRESS", "")
ISSUER_REGISTRY_ADDRESS          = os.getenv("ISSUER_REGISTRY_ADDRESS", "")

# ── Email (Brevo SMTP) — optional ──────────────────────────────────────────
EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "False") == "True"
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp-relay.brevo.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv(
    "DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@credence.local"
)
# If True, API always returns the one-time temp password (inbox delivery can lag / drop)
EMAIL_ALWAYS_RETURN_TEMP_PASSWORD = (
    os.getenv("EMAIL_ALWAYS_RETURN_TEMP_PASSWORD", "True") == "True"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
