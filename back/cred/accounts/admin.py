from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Role


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display   = [
        "email", "full_name", "role", "institution", "is_active",
        "wallet_verified", "on_chain_authorized",
    ]
    list_filter    = [
        "role", "is_active", "institution",
        "wallet_verified", "on_chain_authorized", "must_change_password",
    ]
    search_fields  = ["email", "first_name", "last_name", "wallet_address"]
    ordering       = ["-date_joined"]
    fieldsets = (
        (None,           {"fields": ("email", "password")}),
        ("Personal",     {"fields": ("first_name", "last_name")}),
        ("INTELLIGENT ACADEMIC CREDENTIALING",     {"fields": ("role", "institution", "student_id", "wallet_address")}),
        ("Officer setup", {
            "fields": (
                "must_change_password", "wallet_verified", "on_chain_authorized",
            ),
        }),
        ("Permissions",  {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Timestamps",   {"fields": ("date_joined",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields":  ("email", "password1", "password2", "first_name", "last_name", "role"),
        }),
    )
    readonly_fields = ["date_joined"]

    def save_model(self, request, obj, form, change):
        # Keep Django admin flags in sync with INTELLIGENT ACADEMIC CREDENTIALING role
        if obj.role == Role.SUPER_ADMIN:
            obj.is_staff = True
            obj.is_superuser = True
        obj.email = (obj.email or "").strip().lower()
        super().save_model(request, obj, form, change)
