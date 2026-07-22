"""Build final certificate PDF bytes (ReportLab) with branding + QR + signatures."""

from io import BytesIO

from django.conf import settings

from .branding import get_preset
from .qualification_wording import award_parts


def generate_certificate_pdf(certificate, *, template=None, verification_base_url: str = "") -> bytes:
    """
    Render a landscape A4-ish PDF for the given certificate.
    Includes institution branding, academic fields, optional VC/Chancellor
    signature blocks, and a verification QR code.
    """
    try:
        from reportlab.lib.pagesizes import landscape, A4
        from reportlab.lib.units import mm
        from reportlab.pdfgen import canvas
        from reportlab.lib.utils import ImageReader
    except ImportError as exc:
        raise RuntimeError(
            "reportlab is required for certificate PDF generation. "
            "pip install reportlab"
        ) from exc

    try:
        import qrcode
    except ImportError as exc:
        raise RuntimeError("qrcode is required. pip install qrcode[pil]") from exc

    preset_id = (
        (template.preset if template else None)
        or getattr(certificate, "branding_preset", None)
        or "classic_navy"
    )
    theme = get_preset(preset_id)
    primary = theme["primary"]
    accent = theme["accent"]

    buf = BytesIO()
    page = landscape(A4)
    width, height = page
    c = canvas.Canvas(buf, pagesize=page)

    # Background
    c.setFillColor(theme["bg"])
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # Outer frame
    c.setStrokeColor(primary)
    c.setLineWidth(3)
    c.rect(18 * mm, 14 * mm, width - 36 * mm, height - 28 * mm, fill=0, stroke=1)
    c.setStrokeColor(accent)
    c.setLineWidth(1)
    c.rect(20 * mm, 16 * mm, width - 40 * mm, height - 32 * mm, fill=0, stroke=1)

    inst = certificate.institution
    y = height - 32 * mm

    # Logo
    logo_path = None
    if template and template.logo:
        logo_path = template.logo.path
    if logo_path:
        try:
            c.drawImage(
                ImageReader(logo_path),
                width / 2 - 12 * mm,
                y - 8 * mm,
                width=24 * mm,
                height=24 * mm,
                mask="auto",
                preserveAspectRatio=True,
                anchor="c",
            )
            y -= 30 * mm
        except Exception:
            y -= 4 * mm

    c.setFillColor(primary)
    c.setFont("Times-Bold", 22)
    c.drawCentredString(width / 2, y, (inst.name or "CREDENCE").upper())
    y -= 8 * mm

    c.setFillColor(accent)
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, y, "Academic Certificate")
    y -= 14 * mm

    c.setFillColor(theme["muted"])
    c.setFont("Helvetica", 11)
    c.drawCentredString(width / 2, y, "This is to certify that")
    y -= 10 * mm

    c.setFillColor(primary)
    c.setFont("Times-Bold", 26)
    c.drawCentredString(width / 2, y, certificate.student_name)
    y -= 10 * mm

    qual_type = getattr(certificate, "qualification_type", None) or "bachelors"
    award = award_parts(qual_type, certificate.degree_title)

    c.setFillColor(theme["muted"])
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, y, award["study_line"])
    y -= 7 * mm
    c.drawCentredString(width / 2, y, award["award_intro"])
    y -= 8 * mm

    c.setFillColor(primary)
    c.setFont("Times-Bold", 15)
    c.drawCentredString(width / 2, y, award["award_phrase"])
    y -= 9 * mm

    if certificate.department:
        c.setFillColor(theme["muted"])
        c.setFont("Helvetica", 10)
        c.drawCentredString(width / 2, y, certificate.department)
        y -= 7 * mm

    details = []
    if certificate.grade:
        details.append(certificate.grade)
    details.append(str(certificate.graduation_year))
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(width / 2, y, " · ".join(details))
    y -= 14 * mm

    # Signature blocks — Registrar | VC | Chancellor
    # Layout leaves room above the line for cosmetic signature images (VC / Chancellor).
    c.setStrokeColor(primary)
    c.setLineWidth(0.6)
    sig_y = 42 * mm
    sig_w = 55 * mm
    left_x = 32 * mm
    mid_x = (width - sig_w) / 2
    right_x = width - 32 * mm - sig_w

    def _draw_sig_image(file_field, x):
        if not file_field:
            return
        try:
            path = file_field.path
            c.drawImage(
                ImageReader(path),
                x + 2 * mm,
                sig_y + 2 * mm,
                width=sig_w - 4 * mm,
                height=14 * mm,
                mask="auto",
                preserveAspectRatio=True,
                anchor="sw",
            )
        except Exception:
            pass

    _draw_sig_image(getattr(certificate, "vc_signature_image", None), mid_x)
    _draw_sig_image(getattr(certificate, "chancellor_signature_image", None), right_x)

    for x in (left_x, mid_x, right_x):
        c.line(x, sig_y, x + sig_w, sig_y)

    reg_name = certificate.registrar_signer_name or "Registrar"
    vc_name = certificate.vc_approver_name or "Vice Chancellor"
    ch_name = certificate.chancellor_approver_name or "Chancellor"

    c.setFillColor(primary)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left_x, sig_y - 5 * mm, reg_name[:28])
    c.drawString(mid_x, sig_y - 5 * mm, vc_name[:28])
    c.drawString(right_x, sig_y - 5 * mm, ch_name[:28])

    c.setFillColor(theme["muted"])
    c.setFont("Helvetica", 8)
    c.drawString(left_x, sig_y - 9 * mm, "Registrar")
    c.drawString(mid_x, sig_y - 9 * mm, "Vice Chancellor")
    c.drawString(right_x, sig_y - 9 * mm, "Chancellor")

    c.setFont("Helvetica", 6.5)
    y_meta = sig_y - 13 * mm
    if certificate.registrar_signed_at:
        c.drawString(left_x, y_meta, f"Digitally Verified — {certificate.registrar_signed_at.strftime('%b %d, %Y')}")
    if certificate.vc_approved_at:
        c.drawString(mid_x, y_meta, f"Digitally Verified — {certificate.vc_approved_at.strftime('%b %d, %Y')}")
        if certificate.vc_approval_tx_hash:
            tx = certificate.vc_approval_tx_hash
            short = f"{tx[:8]}…{tx[-4:]}" if len(tx) > 14 else tx
            c.drawString(mid_x, y_meta - 3.5 * mm, f"Tx: {short}")
    if certificate.chancellor_approved_at:
        c.drawString(right_x, y_meta, f"Digitally Verified — {certificate.chancellor_approved_at.strftime('%b %d, %Y')}")
        if certificate.chancellor_approval_tx_hash:
            tx = certificate.chancellor_approval_tx_hash
            short = f"{tx[:8]}…{tx[-4:]}" if len(tx) > 14 else tx
            c.drawString(right_x, y_meta - 3.5 * mm, f"Tx: {short}")

    # QR + certificate id
    base = verification_base_url.rstrip("/") or getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    verify_url = f"{base}/verify/{certificate.certificate_id}"
    qr = qrcode.QRCode(box_size=4, border=1)
    qr.add_data(verify_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=primary, back_color="white")
    qr_buf = BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)
    c.drawImage(ImageReader(qr_buf), width - 42 * mm, 18 * mm, 22 * mm, 22 * mm, mask="auto")

    c.setFillColor(theme["muted"])
    c.setFont("Helvetica", 7)
    c.drawCentredString(width / 2, 18 * mm, f"Certificate ID: {certificate.certificate_id}")
    c.drawCentredString(width / 2, 14 * mm, "Verify on CREDENCE · blockchain-anchored")

    c.showPage()
    c.save()
    return buf.getvalue()
