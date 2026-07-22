from django.contrib import admin
from .models import AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display   = ["timestamp", "actor_email", "action", "target_type", "target_id"]
    list_filter    = ["action", "target_type"]
    search_fields  = ["actor_email", "detail", "target_id"]
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
