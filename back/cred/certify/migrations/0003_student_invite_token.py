import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certify", "0002_certificate_flow_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="StudentInviteToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "certificate",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="invite_tokens",
                        to="certify.certificate",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="invite_tokens",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("used", models.BooleanField(default=False)),
                ("claimed_at", models.DateTimeField(blank=True, null=True)),
                ("whatsapp_sent", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "credence_student_invite_tokens",
                "ordering": ["-created_at"],
            },
        ),
    ]
