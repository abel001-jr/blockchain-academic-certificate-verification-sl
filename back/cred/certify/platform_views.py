"""
certify/platform_views.py

Platform-wide aggregation endpoints for the Super Admin governance console.

The Super Admin dashboard previously derived every metric client-side from the
first page of `/certificates/`, `/users/`, `/institutions/` and `/audit-logs/`.
DRF caps `PAGE_SIZE` at 20 and ignores `?page_size=100`, so every donut,
bar chart and "total" on that console was silently computed from the first
20 rows of each table.

These endpoints aggregate in the database instead, so the numbers are correct
regardless of how many records exist.
"""

from datetime import datetime

from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role, User
from audit.models import AuditLog
from institutions.models import Institution, InstitutionApplication

from .models import Certificate
from .pinata_usage import get_pinata_storage_usage


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == Role.SUPER_ADMIN)


# Certificate status keys the frontend renders. `pending` is a catch-all so a
# status added to the model later still shows up somewhere rather than vanishing.
_STATUS_KEYS = ("issued", "pending", "draft", "revoked")

_EMPTY_STATUS = {key: 0 for key in _STATUS_KEYS}


def _status_breakdown(queryset):
    """Group a certificate queryset into the dashboard's status buckets."""
    rows = (
        queryset.values("status")
        .annotate(count=Count("id"))
        .order_by()
    )
    breakdown = dict(_EMPTY_STATUS)
    for row in rows:
        key = row["status"]
        if key not in breakdown:
            key = "pending"
        breakdown[key] += row["count"]
    return breakdown


def _month_start(offset=0):
    """First instant of the month `offset` months before the current one."""
    now = timezone.now()
    year  = now.year
    month = now.month - offset
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1, tzinfo=timezone.get_current_timezone())


def _month_buckets(counts_by_month, months=6):
    """
    Return `months` consecutive month buckets ending with the current month,
    zero-filled so the trend chart never has gaps.
    """
    buckets = []
    for offset in range(months - 1, -1, -1):
        start = _month_start(offset)
        buckets.append({
            "year":  start.year,
            "month": start.month,
            "count": counts_by_month.get((start.year, start.month), 0),
        })
    return buckets


class PlatformStatsView(APIView):
    """
    GET /api/certify/admin/platform-stats/

    Platform-wide totals for the Super Admin governance console: institutions,
    users, certificates (global and per-institution), verification activity
    over the last six months, and the most recent certificates.
    """

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        try:
            credential_months = int(request.query_params.get("credential_months", 6))
            verification_months = int(request.query_params.get("verification_months", 6))
        except (ValueError, TypeError):
            return Response({"detail": "Choose a supported chart period."}, status=400)
        if credential_months not in {3, 6, 9, 12, 24} or verification_months not in {3, 6, 9, 12}:
            return Response({"detail": "Credentials support 3, 6, 9, 12 or 24 months; verification supports up to 12 months."}, status=400)
        institutions = Institution.objects.all()
        certificates = Certificate.objects.all()
        applications = InstitutionApplication.objects.filter(status="pending")

        total_certs = certificates.count()
        global_status = _status_breakdown(certificates)

        # ── Per-institution certificate volume ──────────────────────────────
        per_institution_rows = (
            certificates
            .values("institution_id", "institution__name", "institution__short_name")
            .annotate(count=Count("id"))
            .order_by("-count")[:25]
        )
        by_institution = [
            {
                "institution_id": row["institution_id"],
                "name":           row["institution__name"] or "—",
                "short_name":     row["institution__short_name"] or "",
                "total":          row["count"],
            }
            for row in per_institution_rows
        ]

        # ── Users by role ────────────────────────────────────────────────────
        users_by_role = {
            row["role"]: row["count"]
            for row in User.objects.values("role").annotate(count=Count("id")).order_by()
        }

        # ── Verification activity (audit trail) ──────────────────────────────
        verifications = AuditLog.objects.filter(action="certificate.verified")
        trend_rows = (
            verifications
            .filter(timestamp__gte=_month_start(verification_months - 1))
            .annotate(month=TruncMonth("timestamp"))
            .values("month")
            .annotate(count=Count("id"))
            .order_by()
        )
        trend_counts = {(r["month"].year, r["month"].month): r["count"] for r in trend_rows}
        trend = _month_buckets(trend_counts, months=verification_months)

        # ── Most recent certificates across every institution ────────────────
        recent = list(
            certificates
            .select_related("institution")
            .order_by("-created_at")[:8]
        )

        active_institutions = institutions.filter(is_active=True)
        pending_anchor = active_institutions.filter(is_chain_active=False)
        issued = certificates.filter(status="issued")
        claimed = issued.filter(invite_tokens__used=True, invite_tokens__claimed_at__isnull=False).distinct()
        wallet_users = User.objects.filter(is_active=True, role__in=[Role.SUPER_ADMIN, Role.INSTITUTIONAL_ADMIN, Role.REGISTRAR, Role.VC, Role.CHANCELLOR])

        chart_records = certificates.filter(created_at__gte=_month_start(credential_months - 1))
        chart_institutions = [{"institution_id": row["institution_id"], "name": row["institution__name"] or "Unspecified",
            "short_name": row["institution__short_name"] or "", "total": row["count"]}
            for row in chart_records.values("institution_id", "institution__name", "institution__short_name").annotate(count=Count("id")).order_by("-count")[:8]]
        return Response({
            "chart_periods": {"credentials": credential_months, "verifications": verification_months},
            "credential_chart": {"total": chart_records.count(), "by_status": _status_breakdown(chart_records), "by_institution": chart_institutions},
            "completion": {
                "claims": {"count": claimed.count(), "total": global_status["issued"]},
                "wallets": {"count": wallet_users.exclude(wallet_address="").count(), "total": wallet_users.count()},
                "pinata": get_pinata_storage_usage(),
            },
            "institutions": {
                "total":         institutions.count(),
                "active":        active_institutions.count(),
                "pending_anchor": pending_anchor.count(),
                "pending_applications": applications.count(),
            },
            "users": {
                "total":    User.objects.count(),
                "by_role":  users_by_role,
            },
            "certificates": {
                "total":   total_certs,
                "by_status": global_status,
                "issued_rate": (
                    round(global_status["issued"] / total_certs * 100) if total_certs else 0
                ),
            },
            "verifications": {
                "total": verifications.count(),
                "trend": trend,
            },
            "by_institution": by_institution,
            "recent_certificates": [
                {
                    "id":                cert.id,
                    "certificate_id":    cert.certificate_id,
                    "student_name":      cert.student_name,
                    "degree_title":      cert.degree_title,
                    "institution_id":    cert.institution_id,
                    "institution_name":  cert.institution.name if cert.institution else "—",
                    "status":            cert.status,
                    "graduation_year":   cert.graduation_year,
                    "created_at":        cert.created_at,
                    "chain_issued_at":   cert.chain_issued_at,
                }
                for cert in recent
            ],
        })


class PlatformCertificateOverviewView(APIView):
    """
    GET /api/certify/admin/certificates/overview/

    Paginated, filterable, cross-institution certificate list for the Super
    Admin. Accepts:

        ?status=<issued|pending|draft|revoked>
        ?institution=<institution uuid>
        ?search=<free text>
        ?ordering=<field>
        ?page=<n>&page_size=<1..100>

    The public `/certificates/` list is institution-scoped for everyone except
    the Super Admin, who gets everything with no way to narrow it down — this
    is the admin-level view they actually need.
    """

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        qs = Certificate.objects.select_related("institution", "issued_by", "student")

        status_param = request.query_params.get("status", "").strip()
        if status_param in _STATUS_KEYS:
            qs = qs.filter(status=status_param)

        institution_param = request.query_params.get("institution", "").strip()
        if institution_param:
            qs = qs.filter(institution_id=institution_param)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(certificate_id__icontains=search)
                | Q(student_name__icontains=search)
                | Q(student_email__icontains=search)
                | Q(institution__name__icontains=search)
            )

        allowed_ordering = {
            "-created_at", "created_at",
            "-chain_issued_at", "chain_issued_at",
            "certificate_id", "-certificate_id",
            "graduation_year", "-graduation_year",
            "student_name", "-student_name",
            "status", "-status",
        }
        ordering = request.query_params.get("ordering") or "-created_at"
        if ordering not in allowed_ordering:
            ordering = "-created_at"

        qs = qs.order_by(ordering).distinct()

        # Clamp so a caller cannot request an unbounded page.
        try:
            page_size = min(max(int(request.query_params.get("page_size", 20)), 1), 100)
        except (TypeError, ValueError):
            page_size = 20
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
        except (TypeError, ValueError):
            page = 1

        total = qs.count()
        offset  = (page - 1) * page_size
        rows   = list(qs[offset:offset + page_size])

        return Response({
            "count":       total,
            "page":        page,
            "page_size":   page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size else 1,
            "status_breakdown": _status_breakdown(qs),
            "results": [
                {
                    "id":               cert.id,
                    "certificate_id":   cert.certificate_id,
                    "student_name":     cert.student_name,
                    "student_email":    cert.student_email,
                    "degree_title":     cert.degree_title,
                    "department":       cert.department,
                    "graduation_year":  cert.graduation_year,
                    "grade":            cert.grade,
                    "flow_type":        cert.flow_type,
                    "institution_id":   cert.institution_id,
                    "institution_name": cert.institution.name if cert.institution else "—",
                    "issued_by_name":   (cert.issued_by.full_name if cert.issued_by else "—"),
                    "status":           cert.status,
                    "tx_hash":          cert.tx_hash,
                    "created_at":       cert.created_at,
                    "chain_issued_at":  cert.chain_issued_at,
                }
                for cert in rows
            ],
        })


__all__ = [
    "IsSuperAdmin",
    "PlatformStatsView",
    "PlatformCertificateOverviewView",
]
