"""
verification/throttles.py

Scoped throttle classes for the public certificate verification endpoint.

Rates are configured in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]:
    "public_verify_anon": "20/minute"   — unauthenticated callers
    "public_verify_user": "60/minute"   — authenticated callers (logged-in
                                          staff / students using the dashboard)

Using ScopedRateThrottle lets us tighten the public endpoint independently
of the global anon/user rates that cover every other API view.
"""

from rest_framework.throttling import SimpleRateThrottle


class PublicVerifyAnonThrottle(SimpleRateThrottle):
    """Rate-limit anonymous (unauthenticated) verification requests by IP."""
    scope = "public_verify_anon"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return None  # Not this throttle — let PublicVerifyUserThrottle handle it
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PublicVerifyUserThrottle(SimpleRateThrottle):
    """Rate-limit authenticated verification requests by user ID."""
    scope = "public_verify_user"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None  # Not this throttle — let PublicVerifyAnonThrottle handle it
        return self.cache_format % {
            "scope": self.scope,
            "ident": str(request.user.pk),
        }
