from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("certify", "0008_alter_certificate_flow_type_transcript"),
    ]

    operations = [
        migrations.AddField(
            model_name="certificate",
            name="transcript_hash",
            field=models.CharField(blank=True, max_length=66),
        ),
        migrations.AddField(
            model_name="certificate",
            name="ipfs_cid_transcript",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="certificate",
            name="ipfs_url_transcript",
            field=models.URLField(blank=True),
        ),
    ]
