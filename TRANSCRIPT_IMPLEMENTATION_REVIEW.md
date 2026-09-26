# Transcript Upload Implementation Review

## Current State Analysis

### ✅ What Already Exists

1. **Two Flow Types** (Certificate model):
   - `SYSTEM_DESIGNED`: Full VC + Dean approval flow
   - `EXTERNAL_UPLOAD`: Registrar uploads pre-signed PDF
   
2. **Officer Roles** (User model):
   - `REGISTRAR`: Issues certificates, submits for approval
   - `VC`: Vice Chancellor (approval authority)
   - `CHANCELLOR`: Dean (final approval authority) — **Role name in code, "Dean" in UI**

3. **Signature Handling** (User model):
   - `signature_image`: Stored once during officer setup
   - **Every signature action requires MetaMask transaction attestation**
   - Approval tracked via on-chain transactions

4. **Document Storage**:
   - `document_file`: Local file before IPFS pinning
   - `ipfs_cid_pdf`: IPFS CID after pinning
   - `cert_hash` & `doc_hash`: SHA-256 hashes

---

## ⚠️ Gaps Against Requirements

### 1. **Transcript Support** ❌ NOT IMPLEMENTED

**Requirement:**
> Three flows: (1) upload both transcript + cert, (2) upload transcript then design cert, (3) tie together as single student record

**Current State:**
- No `Transcript` model
- No transcript file field in `Certificate` model
- No API endpoints for transcript upload
- No frontend UI for transcript handling

**Required Changes:**

#### Backend:
```python
# certify/models.py — Add Transcript model
class Transcript(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    certificate = models.OneToOneField(
        Certificate,
        on_delete=models.CASCADE,
        related_name="transcript",
        null=True, blank=True,  # Can exist before cert
    )
    student_name = models.CharField(max_length=200)
    student_email = models.EmailField()
    institution = models.ForeignKey("institutions.Institution", on_delete=models.PROTECT)
    
    # Document storage
    transcript_file = models.FileField(upload_to="transcripts/pdfs/")
    transcript_hash = models.CharField(max_length=66, blank=True)
    ipfs_cid = models.CharField(max_length=100, blank=True)
    ipfs_url = models.URLField(blank=True)
    
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "credence_transcripts"

# Add to Certificate model:
flow_type choices:
    SYSTEM_DESIGNED = "system_designed"
    EXTERNAL_UPLOAD = "external_upload"
    TRANSCRIPT_THEN_CERT = "transcript_then_cert"  # NEW
    FULL_UPLOAD = "full_upload"  # NEW (both at once)
```

#### Frontend:
- Add transcript upload step in certificate creation flow
- Show transcript preview alongside certificate
- Link transcript ↔ certificate in UI

---

### 2. **Officer Limit (Max 2)** ⚠️ PARTIALLY IMPLEMENTED

**Requirement:**
> Registrar can only add two more signers as officers (VC + Dean)

**Current State:**
- Roles exist: `VC`, `CHANCELLOR` (displayed as "Dean" in UI)
- No enforcement of "max 2 officers per institution"
- Registrar can currently invite unlimited officers

**Required Changes:**

#### Backend Validation:
```python
# institutions/views.py or accounts/officer_setup.py

def get_officer_count(institution):
    """Returns count of active VC + Dean for this institution."""
    return User.objects.filter(
        institution=institution,
        role__in=[Role.VC, Role.CHANCELLOR],  # CHANCELLOR = Dean in UI
        is_active=True,
    ).count()

# In InviteOfficerView (needs to be created):
def post(self, request):
    institution = request.user.institution
    if get_officer_count(institution) >= 2:
        return Response(
            {"detail": "Maximum 2 officers (VC + Dean) allowed per institution."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # ... proceed with invite
```

#### Database Constraint (optional but recommended):
```python
# migrations/XXXX_add_officer_constraint.py
from django.db import migrations

def check_officer_limit(apps, schema_editor):
    # Custom validation or trigger
    pass

class Migration(migrations.Migration):
    operations = [
        migrations.RunPython(check_officer_limit),
    ]
```

---

### 3. **Signature Configuration & Attestation** ✅ CLEAR REQUIREMENT

**Requirement:**
> Signatures are configured once electronically, except in extreme cases
> **Every action/sign requires MetaMask transaction attestation**

**Current State:**
- ✅ `User.signature_image` stored during officer setup
- ✅ Signatures reused across all certificates
- ✅ All approvals require on-chain transactions (MetaMask signature)

**Implementation:**
- Officers complete setup → upload signature image → stored permanently
- **Every approval action:**
  1. Officer clicks "Approve" in dashboard
  2. MetaMask prompts for transaction signature
  3. On-chain transaction confirms attestation
  4. Django records `approval_tx_hash` + timestamp
- System overlays stored signature image on generated PDFs after on-chain approval

**Attestation Flow for ALL Certificate Types:**

```
SYSTEM_DESIGNED flow:
  Registrar submits → VC approves (MetaMask tx) → Dean approves (MetaMask tx) → Issued

EXTERNAL_UPLOAD flow:
  Registrar uploads PDF → VC attests (MetaMask tx) → Dean attests (MetaMask tx) → Issued
  
TRANSCRIPT_THEN_CERT flow:
  Registrar uploads transcript → designs cert → VC approves (MetaMask tx) → Dean approves (MetaMask tx) → Issued

FULL_UPLOAD flow:
  Registrar uploads both → VC attests (MetaMask tx) → Dean attests (MetaMask tx) → Issued
```

**Key Point:** Even for external uploads where the PDF is pre-signed, VC and Dean must:
- Review the uploaded document
- Click "Approve" in dashboard
- Sign MetaMask transaction to attest: "I confirm this certificate is valid and my signature is authentic"

**No changes needed** — current implementation correct, just needs to be enforced for ALL flows.

---

### 4. **External Upload Attestation** ⚠️ NEEDS IMPLEMENTATION

**Requirement:**
> Even for uploads, VC + Dean need to confirm their signatures are theirs via MetaMask

**Current State:**
- `EXTERNAL_UPLOAD` flow may skip officer approval ❌
- Need to enforce VC → Dean approval for all flows

**Required Changes:**

#### Backend:
```python
# certify/views.py — Ensure external uploads go through full approval

def submit_external_upload(request, certificate_id):
    cert = Certificate.objects.get(id=certificate_id)
    # ... registrar uploads PDF ...
    
    # Set status to pending VC approval (not directly to issued)
    cert.status = CertificateStatus.PENDING_VC
    cert.save()
    
    # Notify VC: "New uploaded certificate awaiting your attestation"
    return Response({"detail": "Certificate submitted for VC attestation"})

# VC approval endpoint (already exists, ensure it's used):
def vc_approve(request, certificate_id):
    # ... VC reviews uploaded PDF ...
    # MetaMask transaction required
    cert.vc_approval_tx_hash = request.data["tx_hash"]
    cert.vc_approved_at = timezone.now()
    cert.status = CertificateStatus.PENDING_CHANCELLOR  # → Dean
    cert.save()

# Dean approval endpoint:
def dean_approve(request, certificate_id):
    # MetaMask transaction required
    cert.chancellor_approval_tx_hash = request.data["tx_hash"]
    cert.chancellor_approved_at = timezone.now()
    cert.status = CertificateStatus.PENDING_FINALIZE
    cert.save()
```

#### Frontend:
- Show "Pending VC Attestation" status for external uploads
- VC dashboard: List of uploaded certificates awaiting review
- Dean dashboard: List of VC-approved certificates awaiting final attestation
- Each approval shows MetaMask prompt

---

## Implementation Roadmap

### Phase 1: Transcript Support (High Priority)
- [ ] Create `Transcript` model
- [ ] Add `TRANSCRIPT_THEN_CERT` and `FULL_UPLOAD` flow types
- [ ] Create transcript upload API endpoints
- [ ] Frontend: Transcript upload UI
- [ ] Link transcript ↔ certificate in database and UI
- [ ] IPFS pinning for transcripts
- [ ] Generate combined verification page (cert + transcript)

### Phase 2: Officer Limit Enforcement (Medium Priority)
- [ ] Add `get_officer_count()` validation
- [ ] Block officer invite if limit reached
- [ ] Frontend: Show "2/2 officers" status
- [ ] Admin override mechanism (if needed)

### Phase 3: External Upload Attestation (High Priority)
- [ ] Update external upload flow: Registrar → VC (MetaMask) → Dean (MetaMask) → Issued
- [ ] Frontend: Show attestation queue in VC/Dean dashboards
- [ ] Email/WhatsApp notifications: "Certificate awaiting your attestation"
- [ ] Audit log: Record all MetaMask tx hashes for attestations

### Phase 4: UI Updates (Medium Priority)
- [ ] Replace "Chancellor" → "Dean" in all frontend labels
- [ ] Update role badges, dashboard headers, approval notifications
- [ ] Certificate preview: "Dean" signature block
- [ ] Backend: Keep `Role.CHANCELLOR` code unchanged, map to "Dean" in serializers/frontend

---

## Questions for Stakeholder

1. **Transcript Flow:**
   - Should transcript upload be mandatory or optional?
   - Can a certificate exist without a transcript?
   - Should transcript be anchored on-chain separately or with the certificate?

2. **Officer Limit:**
   - Is the limit strictly 2 (one VC + one Dean)?
   - Or 2 total officers (any combination of VC/Dean)?
   - Can this limit be adjusted per institution?

3. **Student Records:**
   - Should transcript + certificate form a single on-chain record?
   - Or separate records linked by student ID?
   - How should verification QR codes work (cert only, transcript only, or combined)?

4. **Attestation Failure:**
   - What happens if VC approves but Dean rejects?
   - Can certificates be sent back to registrar for revision?
   - Is there an appeals/override process?

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|----------|
| Transcript IPFS pinning failure | High | Retry mechanism + local backup |
| Officer limit bypass | Medium | Database constraints + frontend validation |
| Missing MetaMask attestation | **CRITICAL** | Block certificate issuance until both tx hashes recorded |
| Flow type confusion (4 flows now) | Medium | Clear UI labeling + flow selection wizard |
| Dean/Chancellor naming inconsistency | Low | Frontend display logic (code: CHANCELLOR, UI: Dean) |

---

## Critical Implementation Notes

### MetaMask Attestation Requirements

**Every approval MUST:**
1. Check user has MetaMask connected
2. Prompt transaction signature
3. Wait for blockchain confirmation
4. Record `tx_hash` in database
5. **Block progression if tx_hash missing**

**Backend validation:**
```python
# Before marking certificate as issued:
if not cert.vc_approval_tx_hash or not cert.chancellor_approval_tx_hash:
    raise ValidationError("Missing required officer attestation transactions")
```

**Frontend guard:**
```javascript
// VC Approve button
async function handleVCApprove() {
  if (!window.ethereum) {
    alert("MetaMask required for attestation");
    return;
  }
  
  const txHash = await signApprovalTransaction(certId);
  if (!txHash) {
    alert("Attestation failed - transaction not signed");
    return;
  }
  
  await apiSubmitApproval(certId, txHash);
}
```

---

## Next Steps

1. **Immediate:** Update all "Chancellor" → "Dean" in frontend (keep backend code as-is)
2. **Week 1:** Implement Transcript model + basic upload + IPFS pinning
3. **Week 2:** Enforce officer limit (max 2: VC + Dean)
4. **Week 3:** Update external upload flow to require VC + Dean MetaMask attestation
5. **Week 4:** Integration testing + audit all MetaMask transaction flows
6. **Week 5:** Frontend polish + combined cert+transcript verification page
