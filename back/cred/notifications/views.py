import base64
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsFullSession
from .models import Notification, NotificationPreference, PushSubscription
from .services import allowed_push_endpoint, notify, push_configured
from django.conf import settings


class NotificationAPIView(APIView):
    permission_classes = [IsFullSession]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class InboxView(NotificationAPIView):

    def get(self, request):
        qs = Notification.objects.filter(recipient=request.user)
        try:
            offset = max(0, min(int(request.query_params.get("offset", 0)), 10000))
        except ValueError:
            offset = 0
        rows = list(qs.values("id", "title", "body", "url", "created_at", "read_at")[offset:offset + 20])
        return Response({"results": rows, "unread_count": qs.filter(read_at__isnull=True).count(), "next_offset": offset + 20 if qs.count() > offset + 20 else None})

    def patch(self, request):
        qs = Notification.objects.filter(recipient=request.user, read_at__isnull=True)
        if request.data.get("all") is not True:
            value = serializers.UUIDField().run_validation(request.data.get("id"))
            qs = qs.filter(pk=value)
        return Response({"updated": qs.update(read_at=timezone.now())})


class PreferenceView(NotificationAPIView):
    permission_classes = [IsFullSession]

    def get(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response({"push_enabled": pref.push_enabled, "push_configured": push_configured(), "public_key": settings.WEB_PUSH_PUBLIC_KEY if push_configured() else ""})

    def patch(self, request):
        enabled = request.data.get("push_enabled")
        if type(enabled) is not bool:
            raise serializers.ValidationError({"push_enabled": "Use true or false."})
        if enabled and not push_configured():
            raise serializers.ValidationError({"detail": "Push delivery is not configured on this server."})
        NotificationPreference.objects.update_or_create(user=request.user, defaults={"push_enabled": enabled})
        return self.get(request)


class SubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=2048)
    keys = serializers.DictField(child=serializers.CharField(max_length=200))

    def validate_endpoint(self, value):
        try:
            valid = allowed_push_endpoint(value)
        except ValueError:
            valid = False
        if not valid:
            raise serializers.ValidationError("Unsupported push service endpoint.")
        return value

    def validate_keys(self, value):
        try:
            public = base64.urlsafe_b64decode(value["p256dh"] + "=" * (-len(value["p256dh"]) % 4))
            auth = base64.urlsafe_b64decode(value["auth"] + "=" * (-len(value["auth"]) % 4))
            if len(public) != 65 or public[0] != 4 or len(auth) != 16:
                raise ValueError()
        except (KeyError, ValueError):
            raise serializers.ValidationError("Invalid browser subscription keys.")
        return {"p256dh": value["p256dh"], "auth": value["auth"]}


class SubscriptionView(NotificationAPIView):
    permission_classes = [IsFullSession]

    def post(self, request):
        if not push_configured():
            return Response({"detail": "Push delivery is not configured."}, status=503)
        serializer = SubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        value = serializer.validated_data
        PushSubscription.objects.update_or_create(endpoint=value["endpoint"], defaults={"user": request.user, **value["keys"]})
        return Response({"subscribed": True})

    def delete(self, request):
        PushSubscription.objects.filter(user=request.user, endpoint=request.data.get("endpoint", "")).delete()
        return Response(status=204)


class TestNotificationView(NotificationAPIView):
    permission_classes = [IsFullSession]

    def post(self, request):
        # One queued test per minute avoids flooding the browser or transport.
        key = f"test:{timezone.now():%Y%m%d%H%M}"
        notice = notify(request.user, event_key=key, title="Notifications are ready", body="This test appears in your inbox. Push is queued if enabled on this device.", url="/dashboard/settings")
        return Response({"id": notice.pk}, status=201)
