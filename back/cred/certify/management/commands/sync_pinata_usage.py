"""Run outside request handlers; database lease permits only one active sync."""
import time
from django.core.management.base import BaseCommand
from certify.pinata_usage import sync_pinata_storage_usage


class Command(BaseCommand):
    help = "Synchronize shared Pinata storage totals; use --once for a scheduled task."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")

    def handle(self, *args, **options):
        self.stdout.write("Pinata storage synchronization started. Ctrl+C to stop.")
        try:
            while True:
                sync_pinata_storage_usage()
                if options["once"]:
                    return
                time.sleep(5)
        except KeyboardInterrupt:
            self.stdout.write("Storage synchronization stopped.")
