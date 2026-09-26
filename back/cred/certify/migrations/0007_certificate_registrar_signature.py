from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("certify", "0006_alter_verificationsharecode_expires_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="certificate",
            name="registrar_signature_image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="certificates/signatures/",
            ),
        ),
    ]
