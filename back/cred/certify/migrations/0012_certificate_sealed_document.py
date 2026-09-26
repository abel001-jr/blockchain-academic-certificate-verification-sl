from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certify', '0011_alter_verificationsharecode_expires_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='certificate',
            name='sealed_doc_hash',
            field=models.CharField(blank=True, max_length=66),
        ),
        migrations.AddField(
            model_name='certificate',
            name='ipfs_cid_sealed_pdf',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='certificate',
            name='ipfs_url_sealed_pdf',
            field=models.URLField(blank=True),
        ),
    ]
