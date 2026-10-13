import time
from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from notifications.models import PushDelivery
from notifications.services import dispatch_delivery, push_configured


class Command(BaseCommand):
    help = "Deliver queued browser push notifications. Use --watch for a worker."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true")

    def handle(self, *args, **options):
        if not push_configured():
            raise CommandError("Configure WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY and WEB_PUSH_SUBJECT first.")
        while True:
            ids = list(PushDelivery.objects.filter(completed_at__isnull=True, next_attempt_at__lte=timezone.now()).values_list("pk", flat=True)[:100])
            for pk in ids:
                # Claim without holding a database write lock during network I/O.
                # A crashed worker's lease expires so another run can recover it.
                now = timezone.now()
                claimed = PushDelivery.objects.filter(pk=pk, completed_at__isnull=True, next_attempt_at__lte=now).update(next_attempt_at=now + timedelta(minutes=5))
                if claimed:
                    delivery = PushDelivery.objects.select_related("notification__recipient").get(pk=pk)
                    dispatch_delivery(delivery)
            if not options["watch"]:
                self.stdout.write(f"Processed {len(ids)} queued notifications.")
                return
            time.sleep(5)
