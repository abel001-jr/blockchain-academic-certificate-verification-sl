"""
sync_chain_events.py

Django management command that polls the IssuerRegistry contract for events
and syncs Django's local state to mirror the chain.

Usage:
    python manage.py sync_chain_events [--from-block 0]

Run via cron or Celery beat every ~30s in production.

Spec §4 (indexer note): Django's copy of active/inactive is a cache of
chain state. If they disagree, the UI should trust the chain.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone

from institutions.models import Institution
from accounts.models import User, Role
from audit.utils import log_action

# ABI fragment — only the events we care about
ISSUER_REGISTRY_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "institutionAdmin", "type": "address"},
            {"indexed": False, "name": "name",             "type": "string"},
            {"indexed": False, "name": "registeredAt",     "type": "uint256"},
        ],
        "name":  "IssuerRegistered",
        "type":  "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "institutionAdmin", "type": "address"},
            {"indexed": False, "name": "revokedAt",        "type": "uint256"},
        ],
        "name":  "IssuerRevoked",
        "type":  "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "institutionAdmin", "type": "address"},
            {"indexed": True,  "name": "registrar",        "type": "address"},
            {"indexed": False, "name": "authorizedAt",     "type": "uint256"},
        ],
        "name":  "RegistrarAuthorized",
        "type":  "event",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "name": "institutionAdmin", "type": "address"},
            {"indexed": True,  "name": "registrar",        "type": "address"},
            {"indexed": False, "name": "revokedAt",        "type": "uint256"},
        ],
        "name":  "RegistrarRevoked",
        "type":  "event",
    },
]


class Command(BaseCommand):
    help = "Sync IssuerRegistry on-chain events into Django (run via cron or Celery beat)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--from-block",
            type=int,
            default=0,
            help="Block number to start scanning from (default: 0)",
        )

    def handle(self, *args, **options):
        try:
            from web3 import Web3
        except ImportError:
            self.stderr.write("web3 is not installed. Run: pip install web3")
            return

        rpc_url      = settings.ETH_RPC_URL
        registry_addr = settings.ISSUER_REGISTRY_ADDRESS

        if not registry_addr or registry_addr == "0x0000000000000000000000000000000000000000":
            self.stdout.write("ISSUER_REGISTRY_ADDRESS not configured — skipping.")
            return

        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            self.stderr.write(f"Cannot connect to {rpc_url}")
            return

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(registry_addr),
            abi=ISSUER_REGISTRY_ABI,
        )

        from_block  = options["from_block"]
        latest      = w3.eth.block_number
        self.stdout.write(f"Scanning blocks {from_block} → {latest}")

        # ── IssuerRegistered ──────────────────────────────────────────────────
        for event in contract.events.IssuerRegistered.get_logs(
            from_block=from_block, to_block=latest
        ):
            admin_wallet = event["args"]["institutionAdmin"].lower()
            self.stdout.write(f"  IssuerRegistered: {admin_wallet}")

            inst = Institution.objects.filter(wallet_address__iexact=admin_wallet).first()
            if inst and not inst.is_chain_active:
                inst.is_chain_active = True
                inst.save()
                from institutions.catalog_seed import seed_default_grade_classifications
                seed_default_grade_classifications(inst)
                log_action(
                    actor=None,
                    action="chain.issuer_registered",
                    target_type="Institution",
                    target_id=str(inst.id),
                    detail=f"On-chain IssuerRegistered event synced.",
                )
                self.stdout.write(f"    → Activated institution {inst.institution_id}")

        # ── IssuerRevoked ─────────────────────────────────────────────────────
        for event in contract.events.IssuerRevoked.get_logs(
            from_block=from_block, to_block=latest
        ):
            admin_wallet = event["args"]["institutionAdmin"].lower()
            self.stdout.write(f"  IssuerRevoked: {admin_wallet}")

            inst = Institution.objects.filter(wallet_address__iexact=admin_wallet).first()
            if inst and inst.is_chain_active:
                inst.is_chain_active = False
                inst.save()
                log_action(
                    actor=None,
                    action="chain.issuer_revoked",
                    target_type="Institution",
                    target_id=str(inst.id),
                    detail=f"On-chain IssuerRevoked event synced.",
                )
                self.stdout.write(f"    → Deactivated institution {inst.institution_id}")

        # ── RegistrarAuthorized ───────────────────────────────────────────────
        for event in contract.events.RegistrarAuthorized.get_logs(
            from_block=from_block, to_block=latest
        ):
            registrar_wallet = event["args"]["registrar"].lower()
            self.stdout.write(f"  RegistrarAuthorized: {registrar_wallet}")

            reg_user = User.objects.filter(
                wallet_address__iexact=registrar_wallet,
                role=Role.REGISTRAR,
            ).first()
            if reg_user and not reg_user.is_active:
                reg_user.is_active = True
                reg_user.save()
                log_action(
                    actor=None,
                    action="chain.registrar_authorized",
                    target_type="User",
                    target_id=str(reg_user.id),
                    detail=f"On-chain RegistrarAuthorized event synced.",
                )
                self.stdout.write(f"    → Activated registrar {reg_user.email}")

        # ── RegistrarRevoked ──────────────────────────────────────────────────
        for event in contract.events.RegistrarRevoked.get_logs(
            from_block=from_block, to_block=latest
        ):
            registrar_wallet = event["args"]["registrar"].lower()
            self.stdout.write(f"  RegistrarRevoked: {registrar_wallet}")

            reg_user = User.objects.filter(
                wallet_address__iexact=registrar_wallet,
                role=Role.REGISTRAR,
            ).first()
            if reg_user and reg_user.is_active:
                reg_user.is_active = False
                reg_user.save()
                log_action(
                    actor=None,
                    action="chain.registrar_revoked",
                    target_type="User",
                    target_id=str(reg_user.id),
                    detail=f"On-chain RegistrarRevoked event synced.",
                )
                self.stdout.write(f"    → Deactivated registrar {reg_user.email}")

        self.stdout.write(self.style.SUCCESS("Chain sync complete."))
