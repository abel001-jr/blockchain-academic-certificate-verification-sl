from types import SimpleNamespace
from django.test import TestCase
from accounts.models import User, Role
from institutions.models import Institution
from .models import Certificate
from .views import CertificateListCreateView

class ApprovalQueueTests(TestCase):
    def setUp(self):
        self.institution = Institution.objects.create(institution_id="QUEUE", name="Queue test")
        self.vc = User.objects.create_user(email="vc@queue.test", role=Role.VC, institution=self.institution)
        self.chancellor = User.objects.create_user(email="chancellor@queue.test", role=Role.CHANCELLOR, institution=self.institution)

    def create(self, code, **values):
        return Certificate.objects.create(institution=self.institution, certificate_id=code, student_name="Student Name", degree_title="Degree", graduation_year=2025, **values)

    def queue(self, user, stage):
        view = CertificateListCreateView()
        view.request = SimpleNamespace(user=user, query_params={"status": stage, "signing_ready": "true"})
        return list(view.get_queryset())

    def test_vc_queue_excludes_unsubmitted_and_other_stage(self):
        ready = self.create("READY", status="pending_vc", tx_hash="0xsubmitted", doc_hash="document")
        self.create("UNSUBMITTED", status="pending_vc", doc_hash="document")
        self.create("OTHER", status="pending_chancellor", tx_hash="0xsubmitted", doc_hash="document")
        self.assertEqual(self.queue(self.vc, "pending_vc"), [ready])

    def test_chancellor_queue_requires_prior_vc_transaction(self):
        ready = self.create("CH-READY", status="pending_chancellor", tx_hash="0xsubmitted", doc_hash="document", vc_approval_tx_hash="0xvc")
        self.create("NO-VC", status="pending_chancellor", tx_hash="0xsubmitted", doc_hash="document")
        self.assertEqual(self.queue(self.chancellor, "pending_chancellor"), [ready])

    def test_filters_combine_submission_documents_and_award_search(self):
        ready = self.create("PAIRED", status="pending_vc", tx_hash="submitted", doc_hash="document", transcript_hash="transcript")
        self.create("NO-TRANSCRIPT", status="pending_vc", tx_hash="submitted", doc_hash="document")
        self.create("NOT-SUBMITTED", status="pending_vc", doc_hash="document", transcript_hash="transcript")
        view = CertificateListCreateView()
        view.request = SimpleNamespace(user=self.vc, query_params={"submission": "submitted", "documents": "paired", "search": "Degree"})
        self.assertEqual(list(view.get_queryset()), [ready])
