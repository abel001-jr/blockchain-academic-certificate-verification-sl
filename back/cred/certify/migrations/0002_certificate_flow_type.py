from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('certify', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='certificate',
            name='flow_type',
            field=models.CharField(
                choices=[
                    ('system_designed', 'System Designed'),
                    ('external_upload', 'External Upload'),
                ],
                default='system_designed',
                db_index=True,
                help_text='Determines which issuance lifecycle this certificate follows.',
                max_length=20,
            ),
        ),
    ]
