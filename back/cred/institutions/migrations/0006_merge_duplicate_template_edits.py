from django.db import migrations


def merge_duplicate_edits(apps, schema_editor):
    Revision = apps.get_model("institutions", "CertificateTemplateRevision")
    Template = apps.get_model("institutions", "CertificateTemplate")
    Certificate = apps.get_model("certify", "Certificate")
    alias = schema_editor.connection.alias
    groups = {}
    for revision in Revision.objects.using(alias).order_by("created_at", "id"):
        # The former edit endpoint copied the exact storage path and name.
        groups.setdefault((revision.institution_id, revision.master.name, revision.name), []).append(revision)
    for revisions in groups.values():
        if len(revisions) < 2:
            continue
        original, latest = revisions[0], revisions[-1]
        duplicate_ids = [revision.pk for revision in revisions[1:]]
        for field in ("fields", "analysis", "logo", "seal", "approved_at"):
            setattr(original, field, getattr(latest, field))
        original.save(using=alias, update_fields=["fields", "analysis", "logo", "seal", "approved_at"])
        Certificate.objects.using(alias).filter(template_revision_id__in=duplicate_ids).update(template_revision_id=original.pk)
        templates = Template.objects.using(alias).filter(active_revision_id__in=[revision.pk for revision in revisions])
        templates.update(active_revision_id=original.pk if latest.approved_at else None)
        Revision.objects.using(alias).filter(pk__in=duplicate_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("institutions", "0005_institution_email_domain"),
        ("certify", "0018_certificate_chain_config_snapshot"),
    ]
    operations = [migrations.RunPython(merge_duplicate_edits, migrations.RunPython.noop)]
