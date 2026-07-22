from django.contrib import admin
from .models import Certificate

@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display   = ["certificate_id", "student_name", "degree_title", "institution", "status", "chain_issued_at"]
    list_filter    = ["status", "institution", "graduation_year"]
    search_fields  = ["certificate_id", "student_name", "student_email", "tx_hash"]
    readonly_fields = [
        "certificate_id", "cert_hash", "doc_hash",
        "ipfs_cid_json", "ipfs_cid_pdf", "tx_hash",
        "block_number", "chain_issued_at", "created_at", "updated_at",
    ]
