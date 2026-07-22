from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default="")

    class Meta:
        model  = AuditLog
        fields = [
            "id", "actor_email", "actor_name", "action",
            "target_type", "target_id", "detail",
            "ip_address", "timestamp",
        ]
