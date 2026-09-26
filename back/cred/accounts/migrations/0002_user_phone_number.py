from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone_number",
            field=models.CharField(
                blank=True,
                default="",
                help_text="E.164 format e.g. +23276123456. Used for WhatsApp issuance notifications.",
                max_length=20,
            ),
        ),
    ]
