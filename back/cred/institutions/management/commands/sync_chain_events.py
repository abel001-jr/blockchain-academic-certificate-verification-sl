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
from django.utils import timezone

from institutions.models import ChainConfig, Institution
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
        except ImportError as exc:
            # Deliberately not a bare "web3 is not installed". A version conflict
            # between web3 and the pinned eth-account also surfaces as an ImportError
            # from deep inside web3, and telling an operator to pip install a package
            # that is already installed sends them down the wrong path.
            self.stderr.write(f"web3 could not be imported: {exc}")
            self.stderr.write(
                "If it is not installed: pip install web3==7.0.0  "
                "(see requirements.txt for the pin, which is constrained by "
                "eth-account)"
            )
            return

        # Read the same ChainConfig row the dashboard writes, not the env vars.
        # These used to come from settings.ETH_RPC_URL / ISSUER_REGISTRY_ADDRESS,
        # which meant that re-pointing the deployment through Settings → Blockchain
        # moved the signing UI and left this indexer polling the previous chain —
        # and it would then have activated and deactivated institutions and
        # registrars from a chain the app no longer considered authoritative.
        config = ChainConfig.load()
        rpc_url = config.rpc_url
        registry_addr = config.issuer_registry_address

        if not registry_addr or registry_addr == "0x0000000000000000000000000000000000000000":
            self.stdout.write("Issuer registry address not configured — skipping.")
            return

        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            self.stderr.write(f"Cannot connect to {rpc_url}")
            return

        # An RPC URL that is reachable is not the same as an RPC URL that is the
        # configured network. Without this, a copy-pasted mainnet URL against a
        # testnet deployment would index real mainnet events into this database.
        if config.chain_id:
            try:
                actual_chain_id = w3.eth.chain_id
            except Exception as exc:  # noqa: BLE001 - provider-specific failures
                self.stderr.write(f"Could not read chain id from {rpc_url}: {exc}")
                return
            if actual_chain_id != config.chain_id:
                self.stderr.write(
                    f"Chain mismatch: {rpc_url} is chain {actual_chain_id}, but the "
                    f"configured chain is {config.chain_id}. Refusing to sync — "
                    f"this would write another chain's events into this database."
                )
                return
            self.stdout.write(f"Connected to chain {actual_chain_id} at {rpc_url}")
        else:
            self.stdout.write(
                f"Warning: no expected chain id configured. Syncing whatever "
                f"{rpc_url} reports without verifying it."
            )

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
