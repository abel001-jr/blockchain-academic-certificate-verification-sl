from django.contrib import admin
from .models import (
    Institution, InstitutionApplication, WalletNonce,
    Department, Program, GradeClassification, CertificateTemplate,
)


@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display  = ["institution_id", "name", "country", "is_chain_active", "is_active", "wallet_address"]
    search_fields = ["institution_id", "name"]
    list_filter   = ["is_active", "is_chain_active", "country"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(InstitutionApplication)
class InstitutionApplicationAdmin(admin.ModelAdmin):
    list_display  = ["institution_name", "admin_email", "status", "submitted_at"]
    list_filter   = ["status"]
    search_fields = ["institution_name", "admin_email"]
    readonly_fields = ["submitted_at", "updated_at"]


@admin.register(WalletNonce)
class WalletNonceAdmin(admin.ModelAdmin):
    list_display  = ["address", "used", "created_at"]
    list_filter   = ["used"]
    readonly_fields = ["address", "nonce", "message", "used", "created_at"]

    def has_add_permission(self, request):
        return False


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ["name", "institution", "active"]
    list_filter = ["active", "institution"]
    search_fields = ["name"]


@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ["title", "qualification_type", "department", "active"]
    list_filter = ["active", "qualification_type", "department__institution"]
    search_fields = ["title"]


@admin.register(GradeClassification)
class GradeClassificationAdmin(admin.ModelAdmin):
    list_display = ["sort_order", "label", "institution", "active"]
    list_filter = ["active", "institution"]
    ordering = ["institution", "sort_order"]


@admin.register(CertificateTemplate)
class CertificateTemplateAdmin(admin.ModelAdmin):
    list_display = ["institution", "preset", "updated_at"]
    list_filter = ["preset"]
