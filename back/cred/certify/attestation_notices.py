"""Server-side notice to the officer whose attestation a credential is waiting on.

Why this is a separate mechanism from the browser notifications in
`front/app-next/src/lib/notifications.js`: `new Notification(...)` renders in the
browser of whoever is looking at the page. The officer who has to act next is a
different person, in a different browser, who may not even be signed in. Aiming a
client-side notification at them is not possible, so the "a state changed and
somebody must act" signal is split by reach:

  * in-page, to the actor, confirming their own transaction was recorded;
  * email, to the next actor, telling them work is waiting.

Both are the same need. Only one of them can cross a user boundary.

The notice is best-effort by design. A credential that cannot be emailed must still
be approvable, so nothing here is allowed to raise into the request.
"""

import logging

from accounts.email_utils import send_officer_attestation_notice
from accounts.models import Role, User

logger = logging.getLogger(__name__)


#: Roles that can hold an officer seat. `CHANCELLOR` is the Chancellor's role in the data
#: model; every user-facing surface calls them Chancellor.
ROLE_LABELS = {
    Role.VC: "Vice Chancellor",
    Role.CHANCELLOR: "Chancellor",
}


def notify_officer_pending_attestation(
    *,
    institution,
    role: str,
    credential_id: str,
    credential_kind: str,
    student_name: str = "",
    detail: str = "",
) -> dict:
    """Email the institution's officer holding `role` that work is waiting on them.

    Returns `{"role", "recipients", "sent"}` so callers and tests can see what was
    attempted without having to mock the transport.
    """
    role_label = ROLE_LABELS.get(role)
    if role_label is None:
        raise ValueError(f"not an officer role: {role!r}")

    # At most one seat per role is enforced at officer-creation time, but filter on
    # the same active-officer definition rather than assuming a single row.
    officers = list(
        User.objects.filter(
            institution=institution,
            role=role,
            is_active=True,
        )
    )

    sent = 0
    for officer in officers:
        if not officer.email:
            logger.warning(
                "Officer %s has no email — cannot send attestation notice for %s",
                officer.pk,
                credential_id,
            )
            continue
        try:
            if send_officer_attestation_notice(
                officer=officer,
                role_label=role_label,
                credential_id=credential_id,
                credential_kind=credential_kind,
                student_name=student_name,
                detail=detail,
            ):
                sent += 1
        except Exception:
            # send_officer_attestation_notice already swallows transport errors;
            # this is the backstop that keeps a notice from ever blocking a
            # credential's progress.
            logger.exception(
                "Attestation notice raised unexpectedly for %s / %s",
                credential_id,
                officer.pk,
            )

    if not officers:
        logger.info(
            "No active %s at institution %s — nobody to notify for %s",
            role_label,
            getattr(institution, "pk", institution),
            credential_id,
        )

    logger.info(
        "Attestation notice for %s -> %s: %s/%s delivered",
        credential_id,
        role_label,
        sent,
        len(officers),
    )
    return {"role": role, "recipients": len(officers), "sent": sent}
