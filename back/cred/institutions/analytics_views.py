from django.db.models import Count, Q, Value
from django.db.models.functions import Cast, TruncMonth, Replace
from django.db.models import CharField
from rest_framework.views import APIView
from rest_framework.response import Response
from accounts.permissions import IsFullSession, IsInstitutionSetupAdmin
from accounts.models import User, Role
from audit.models import AuditLog
from certify.models import Certificate, StudentInviteToken
from certify.platform_views import _status_breakdown, _month_start, _month_buckets


class InstitutionAnalyticsView(APIView):
    permission_classes = [IsFullSession, IsInstitutionSetupAdmin]

    def get(self, request):
        if not request.user.institution_id:
            return Response({"detail": "No institution linked."}, status=400)
        certificates = Certificate.objects.filter(institution_id=request.user.institution_id)
        officers = User.objects.filter(institution_id=request.user.institution_id, role__in=[Role.REGISTRAR, Role.VC, Role.CHANCELLOR])
        months = certificates.filter(created_at__gte=_month_start(5)).annotate(month=TruncMonth("created_at")).values("month").annotate(count=Count("id"))
        counts = {(row["month"].year, row["month"].month): row["count"] for row in months}
        ids = certificates.annotate(string_id=Replace(Cast("id", CharField()), Value("-"), Value(""))).values("string_id")
        verifications = AuditLog.objects.annotate(normalized_id=Replace("target_id", Value("-"), Value(""))).filter(action="certificate.verified", target_type="Certificate", normalized_id__in=ids)
        def monthly_counts(queryset, field):
            rows = queryset.filter(**{f"{field}__gte": _month_start(11)}).annotate(month=TruncMonth(field)).values("month").annotate(count=Count("pk"))
            return {(row["month"].year, row["month"].month): row["count"] for row in rows}
        issuance = monthly_counts(certificates, "chain_issued_at")
        claims = monthly_counts(StudentInviteToken.objects.filter(certificate__in=certificates, used=True), "claimed_at")
        checks = monthly_counts(verifications, "timestamp")
        activity = [{**bucket, "issued": issuance.get((bucket["year"], bucket["month"]), 0), "claims": claims.get((bucket["year"], bucket["month"]), 0), "verifications": checks.get((bucket["year"], bucket["month"]), 0)} for bucket in _month_buckets({}, months=12)]
        return Response({
            "total": certificates.count(), "statuses": _status_breakdown(certificates),
            "anchored": certificates.exclude(tx_hash="").count(),
            "verifications": verifications.count(),
            "activity": activity,
            "departments": list(certificates.values("department").annotate(count=Count("id")).order_by("-count", "department")),
            "stages": list(certificates.values("status").annotate(count=Count("id")).order_by("status")),
            "officers": officers.aggregate(total=Count("id"), ready=Count("id", filter=Q(is_active=True, wallet_verified=True, on_chain_authorized=True, must_change_password=False))),
            "programmes": list(certificates.values("degree_title").annotate(count=Count("id")).order_by("-count", "degree_title")[:6]),
            "monthly": _month_buckets(counts, months=6),
        })
