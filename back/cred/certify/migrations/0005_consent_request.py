import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certify", "0004_verification_share_code"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ConsentRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "certificate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="consent_requests",
                        to="certify.certificate",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="incoming_consent_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("verifier_name",  models.CharField(max_length=200)),
                ("verifier_email", models.EmailField(blank=True)),
                ("verifier_org",   models.CharField(blank=True, max_length=200)),
                ("verifier_ip",    models.GenericIPAddressField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending",  "Pending"),
                            ("approved", "Approved"),
                            ("denied",   "Denied"),
                            ("expired",  "Expired"),
                        ],
                        db_index=True,
                        default="pending",
                        max_length=16,
                    ),
                ),
                ("expires_at",    models.DateTimeField()),
                ("responded_at",  models.DateTimeField(blank=True, null=True)),
                ("whatsapp_sent", models.BooleanField(default=False)),
                ("created_at",    models.DateTimeField(auto_now_add=True)),
                ("updated_at",    models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "credence_consent_requests",
                "ordering": ["-created_at"],
            },
        ),
    ]
