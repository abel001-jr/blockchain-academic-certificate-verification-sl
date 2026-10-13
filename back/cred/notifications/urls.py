from django.urls import path
from .views import InboxView, PreferenceView, SubscriptionView, TestNotificationView

urlpatterns = [
    path("notifications/", InboxView.as_view()),
    path("notifications/preferences/", PreferenceView.as_view()),
    path("notifications/push/", SubscriptionView.as_view()),
    path("notifications/test/", TestNotificationView.as_view()),
]
