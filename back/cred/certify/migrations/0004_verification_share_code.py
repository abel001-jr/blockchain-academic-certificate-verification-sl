import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certify", "0003_student_invite_token"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="VerificationShareCode",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "certificate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="share_codes",
                        to="certify.certificate",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="share_codes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("code_hash",  models.CharField(max_length=64, unique=True)),
                ("label",      models.CharField(blank=True, max_length=100)),
                ("single_use", models.BooleanField(default=False)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("revoked",    models.BooleanField(default=False)),
                ("used",       models.BooleanField(default=False)),
                ("used_at",    models.DateTimeField(blank=True, null=True)),
                ("used_by_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "credence_verification_share_codes",
                "ordering": ["-created_at"],
            },
        ),
    ]
