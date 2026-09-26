"""
certify/transcript_views.py — Transcript upload and approval workflow.

Lifecycle:
  Upload → Draft → VC approve (MetaMask tx) → Pending Dean 
       → Dean approve (MetaMask tx) → Approved
  
Can be linked to certificate in TRANSCRIPT_THEN_CERT or FULL_UPLOAD flow.
"""

import hashlib
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsRegistrar, IsRegistrarOrAbove, IsVC, IsChancellor
from audit.utils import log_action
from .ipfs import pin_file_to_ipfs
from .encrypted_documents import (
    decrypt_document,
    encrypt_document,
    is_encrypted_document,
)
from .models import Transcript, Certificate
from .serializers import (
    TranscriptListSerializer,
    TranscriptDetailSerializer,
    TranscriptUploadSerializer,
    TranscriptLinkCertificateSerializer,
    TranscriptApprovalSerializer,
)


def generate_transcript_id(institution_name: str, year: int, sequence: int) -> str:
    """
    Generate transcript ID in format: TR-YYYY-INST-NNNN
    Example: TR-2026-CUSL-0042
    """
    prefix = "".join(word[0].upper() for word in institution_name.split()[:4])
    return f"TR-{year}-{prefix}-{sequence:04d}"


def compute_transcript_hash(file_bytes: bytes) -> str:
    """Compute SHA-256 hash of transcript PDF."""
    h = hashlib.sha256(file_bytes).hexdigest()
    return f"0x{h}"


# ── Transcript CRUD ───────────────────────────────────────────────────────────

class TranscriptListCreateView(generics.ListCreateAPIView):
    """
    GET:  List all transcripts for registrar's institution
    POST: Upload a new transcript
    """
    permission_classes = [IsRegistrar]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return TranscriptUploadSerializer
        return TranscriptListSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.institution:
            return Transcript.objects.none()
        return Transcript.objects.filter(
            institution=user.institution
        ).select_related(
            "institution", "uploaded_by", "student", "certificate"
        ).order_by("-uploaded_at")

    def perform_create(self, serializer):
        """Generate transcript ID and save."""
        user = self.request.user
        institution = user.institution
        
        # Generate unique transcript ID
        year = timezone.now().year
        last_transcript = Transcript.objects.filter(
            institution=institution,
            transcript_id__startswith=f"TR-{year}-"
        ).order_by("-transcript_id").first()
        
        sequence = 1
        if last_transcript:
            try:
                parts = last_transcript.transcript_id.split("-")
                sequence = int(parts[-1]) + 1
            except (IndexError, ValueError):
                sequence = 1
        
        transcript_id = generate_transcript_id(institution.name, year, sequence)
        
        # Compute hash of uploaded file
        transcript_file = serializer.validated_data["transcript_file"]
        file_bytes = transcript_file.read()
        transcript_hash = compute_transcript_hash(file_bytes)
        transcript_file.seek(0)
        
        # Reset file pointer
        # Store only encrypted bytes on local media as well as on public IPFS.
        encrypted_file = encrypt_document(file_bytes, transcript_id, "transcript")
        transcript = serializer.save(
            transcript_id=transcript_id,
            transcript_hash=transcript_hash,
            status="draft",
        )
        transcript.transcript_file.delete(save=False)
        transcript.transcript_file.save(
            f"{transcript_id}.pdf.enc", ContentFile(encrypted_file), save=False
        )
        transcript.save(update_fields=["transcript_file", "updated_at"])
        
        # Log action
        log_action(
            user=user,
            action="transcript_upload",
            details=f"Uploaded transcript {transcript_id}",
            ip=self.request.META.get("REMOTE_ADDR"),
        )
        
        return transcript


class TranscriptDetailView(generics.RetrieveUpdateAPIView):
    """
    GET:    Retrieve transcript details
    PATCH:  Update transcript metadata
    """
    permission_classes = [IsRegistrarOrAbove]
    serializer_class = TranscriptDetailSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.institution:
            return Transcript.objects.none()
        return Transcript.objects.filter(
            institution=user.institution
        ).select_related("institution", "uploaded_by", "student", "certificate")


# ── Transcript Actions ────────────────────────────────────────────────────────

class TranscriptLinkCertificateView(APIView):
    """
    POST: Link transcript to an existing certificate
    Used in TRANSCRIPT_THEN_CERT flow
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        transcript = get_object_or_404(
            Transcript,
            pk=pk,
            institution=request.user.institution
        )
        
        # Check if already linked
        if transcript.certificate:
            return Response(
                {"detail": "Transcript is already linked to a certificate."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = TranscriptLinkCertificateSerializer(
            data=request.data,
            context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        
        certificate = serializer.validated_data["certificate_id"]
        transcript.certificate = certificate
        transcript.save(update_fields=["certificate"])
        
        log_action(
            user=request.user,
            action="transcript_link_certificate",
            details=f"Linked transcript {transcript.transcript_id} to certificate {certificate.certificate_id}",
            ip=request.META.get("REMOTE_ADDR"),
        )
        
        return Response(
            TranscriptDetailSerializer(transcript, context={"request": request}).data,
            status=status.HTTP_200_OK
        )


class TranscriptPinIPFSView(APIView):
    """
    POST: Pin transcript PDF to IPFS
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        transcript = get_object_or_404(
            Transcript,
            pk=pk,
            institution=request.user.institution
        )
        
        if transcript.ipfs_cid:
            return Response(
                {"detail": "Transcript already pinned to IPFS."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not transcript.transcript_file:
            return Response(
                {"detail": "No transcript file to pin."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Pin to IPFS
            stored_bytes = transcript.transcript_file.read()
            file_bytes = (
                decrypt_document(stored_bytes, transcript.transcript_id, "transcript")
                if is_encrypted_document(stored_bytes)
                else stored_bytes
            )
            encrypted_file = encrypt_document(
                file_bytes, transcript.transcript_id, "transcript"
            )
            ipfs_result = pin_file_to_ipfs(
                ContentFile(encrypted_file, name=f"{transcript.transcript_id}.pdf.enc"),
                filename=f"{transcript.transcript_id}.pdf.enc",
                certificate_id=transcript.transcript_id,
                content_type="application/octet-stream",
            )

            # Migrate any earlier local plaintext copy when it is next pinned.
            migrated_local_file = not is_encrypted_document(stored_bytes)
            if migrated_local_file:
                transcript.transcript_file.delete(save=False)
                transcript.transcript_file.save(
                    f"{transcript.transcript_id}.pdf.enc",
                    ContentFile(encrypted_file),
                    save=False,
                )
            
            transcript.ipfs_cid = ipfs_result["cid"]
            transcript.ipfs_url = ipfs_result["ipfs_url"]
            update_fields = ["ipfs_cid", "ipfs_url"]
            if migrated_local_file:
                update_fields.append("transcript_file")
            transcript.save(update_fields=update_fields)
            
            log_action(
                user=request.user,
                action="transcript_ipfs_pin",
                details=f"Pinned transcript {transcript.transcript_id} to IPFS: {ipfs_result['cid']}",
                ip=request.META.get("REMOTE_ADDR"),
            )
            
            return Response({
                "ipfs_cid": transcript.ipfs_cid,
                "ipfs_url": transcript.ipfs_url,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {"detail": f"IPFS pinning failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TranscriptSubmitForApprovalView(APIView):
    """
    POST: Submit transcript for VC approval
    """
    permission_classes = [IsRegistrar]

    def post(self, request, pk):
        transcript = get_object_or_404(
            Transcript,
            pk=pk,
            institution=request.user.institution
        )
        
        if transcript.status != "draft":
            return Response(
                {"detail": f"Transcript must be in draft status. Current: {transcript.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Ensure transcript is pinned to IPFS
        if not transcript.ipfs_cid:
            return Response(
                {"detail": "Transcript must be pinned to IPFS before submission."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        transcript.status = "pending_vc"
        transcript.save(update_fields=["status"])
        
        log_action(
            user=request.user,
            action="transcript_submit_approval",
            details=f"Submitted transcript {transcript.transcript_id} for VC approval",
            ip=request.META.get("REMOTE_ADDR"),
        )
        
        # TODO: Send notification to VC
        
        return Response(
            TranscriptDetailSerializer(transcript, context={"request": request}).data,
            status=status.HTTP_200_OK
        )


# ── Transcript Approvals ──────────────────────────────────────────────────────

class TranscriptVCApproveView(APIView):
    """
    POST: VC approves transcript with MetaMask attestation
    """
    permission_classes = [IsVC]

    def post(self, request, pk):
        transcript = get_object_or_404(
            Transcript,
            pk=pk,
            institution=request.user.institution
        )
        
        if transcript.status != "pending_vc":
            return Response(
                {"detail": f"Transcript must be pending VC approval. Current: {transcript.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = TranscriptApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Record VC approval with MetaMask tx hash
        transcript.vc_approved_at = timezone.now()
        transcript.vc_approval_tx_hash = serializer.validated_data["tx_hash"]
        transcript.vc_approver_name = serializer.validated_data["approver_name"]
        transcript.status = "pending_dean"
        transcript.save(update_fields=[
            "vc_approved_at", "vc_approval_tx_hash", "vc_approver_name", "status"
        ])
        
        log_action(
            user=request.user,
            action="transcript_vc_approve",
            details=f"VC approved transcript {transcript.transcript_id} (tx: {transcript.vc_approval_tx_hash})",
            ip=request.META.get("REMOTE_ADDR"),
        )
        
        # TODO: Send notification to Dean
        
        return Response(
            TranscriptDetailSerializer(transcript, context={"request": request}).data,
            status=status.HTTP_200_OK
        )


class TranscriptDeanApproveView(APIView):
    """
    POST: Dean approves transcript with MetaMask attestation
    """
    permission_classes = [IsChancellor]  # Dean role uses CHANCELLOR permission

    def post(self, request, pk):
        transcript = get_object_or_404(
            Transcript,
            pk=pk,
            institution=request.user.institution
        )
        
        if transcript.status != "pending_dean":
            return Response(
                {"detail": f"Transcript must be pending Dean approval. Current: {transcript.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Verify VC already approved
        if not transcript.vc_approval_tx_hash:
            return Response(
                {"detail": "VC approval required before Dean approval."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = TranscriptApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Record Dean approval with MetaMask tx hash
        transcript.dean_approved_at = timezone.now()
        transcript.dean_approval_tx_hash = serializer.validated_data["tx_hash"]
        transcript.dean_approver_name = serializer.validated_data["approver_name"]
        transcript.status = "approved"
        transcript.save(update_fields=[
            "dean_approved_at", "dean_approval_tx_hash", "dean_approver_name", "status"
        ])
        
        log_action(
            user=request.user,
            action="transcript_dean_approve",
            details=f"Dean approved transcript {transcript.transcript_id} (tx: {transcript.dean_approval_tx_hash})",
            ip=request.META.get("REMOTE_ADDR"),
        )
        
        # TODO: Send notification to registrar/student
        
        return Response(
            TranscriptDetailSerializer(transcript, context={"request": request}).data,
            status=status.HTTP_200_OK
        )


# ── Student Views ─────────────────────────────────────────────────────────────

class StudentTranscriptsView(generics.ListAPIView):
    """
    GET: List transcripts for authenticated student
    """
    serializer_class = TranscriptListSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or user.role != "student":
            return Transcript.objects.none()
        
        return Transcript.objects.filter(
            student=user,
            status="approved"  # Only show approved transcripts
        ).select_related("institution", "certificate")
