from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certify', '0010_alter_certificate_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='verificationsharecode',
            name='expires_at',
            field=models.DateTimeField(blank=True, help_text='Closing time for full-document access. Required by create().', null=True),
        ),
    ]
