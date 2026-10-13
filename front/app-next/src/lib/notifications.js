/**
 * Browser Push Notifications
 * Handles notification permissions and display
 */

/**
 * Request notification permission from the user
 * @returns {Promise<string>} - 'granted', 'denied', or 'default'
 */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined') {
    return 'denied';
  }
  
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

/**
 * Check if notifications are supported and permitted
 * @returns {boolean}
 */
export function canShowNotifications() {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && Notification.permission === 'granted' && getNotificationPreference();
}

/**
 * Show a browser notification
 * @param {string} title - Notification title
 * @param {object} options - Notification options
 * @param {string} options.body - Notification body text
 * @param {string} options.icon - Icon URL
 * @param {string} options.badge - Badge URL (for mobile)
 * @param {string} options.tag - Unique tag to prevent duplicates
 * @param {boolean} options.requireInteraction - Keep notification visible
 * @param {function} options.onClick - Click handler
 * @returns {Notification|null}
 */
export function showNotification(title, options = {}) {
  if (typeof window === 'undefined') {
    console.log(`[Notification] ${title}:`, options.body);
    return null;
  }
  
  if (!canShowNotifications()) {
    console.warn('Cannot show notification: permission not granted');
    return null;
  }

  const {
    body = '',
    icon = '/logo.png',
    badge = '/logo.png',
    tag = `notification-${Date.now()}`,
    requireInteraction = false,
    onClick = null,
    data = null
  } = options;

  try {
    const notification = new Notification(title, {
      body,
      icon,
      badge,
      tag,
      requireInteraction,
      data,
      // Visual options
      vibrate: [200, 100, 200], // Vibration pattern (mobile)
      silent: false,
    });

    // Handle click
    if (onClick) {
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        onClick(event);
        notification.close();
      };
    } else {
      // Default: focus window and close notification
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }

    // Auto-close after 10 seconds unless requireInteraction is true
    if (!requireInteraction) {
      setTimeout(() => notification.close(), 10000);
    }

    return notification;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return null;
  }
}

/**
 * Human label for a raw role key. The backend stores "chancellor" for the Chancellor;
 * every user-facing surface shows "Chancellor", so notifications must too.
 */
export function roleLabel(role) {
  switch (role) {
    case 'vc': return 'VC';
    case 'chancellor': return 'Chancellor';
    case 'registrar': return 'Registrar';
    case 'student': return 'Student';
    default: return role;
  }
}

/**
 * Notification types with predefined settings
 */
export const NotificationTypes = {
  SUCCESS: {
    icon: '/logo.png',
    badge: '/logo.png',
  },
  INFO: {
    icon: '/logo.png',
    badge: '/logo.png',
  },
  WARNING: {
    icon: '/logo.png',
    badge: '/logo.png',
  },
  ERROR: {
    icon: '/logo.png',
    badge: '/logo.png',
    requireInteraction: true,
  },
};

/**
 * Show success notification
 */
export function notifySuccess(title, body, onClick) {
  return showNotification(title, {
    body,
    ...NotificationTypes.SUCCESS,
    onClick,
  });
}

/**
 * Show info notification
 */
export function notifyInfo(title, body, onClick) {
  return showNotification(title, {
    body,
    ...NotificationTypes.INFO,
    onClick,
  });
}

/**
 * Show warning notification
 */
export function notifyWarning(title, body, onClick) {
  return showNotification(title, {
    body,
    ...NotificationTypes.WARNING,
    onClick,
  });
}

/**
 * Show error notification
 */
export function notifyError(title, body, onClick) {
  return showNotification(title, {
    body,
    ...NotificationTypes.ERROR,
    onClick,
  });
}

/**
 * Confirmation that the current officer's own approval was recorded.
 *
 * This is deliberately *not* "a certificate is awaiting your approval". The
 * browser Notification API renders in the tab of whoever just clicked Approve, so
 * it cannot reach the officer whose turn is next — they are a different person in
 * a different browser. That officer is told by email from the backend, at the
 * moment the state changes. This one confirms to the actor that the transaction
 * they just signed was accepted and recorded, which is the thing they are
 * actually waiting to find out.
 */
export function notifyApprovalRecorded(certificateId, studentName, role) {
  const who = role ? ` as ${roleLabel(role)}` : '';
  return showNotification('Approval Recorded', {
    body: `Your${who} approval of ${certificateId} for ${studentName} is recorded on-chain. The next officer has been notified.`,
    ...NotificationTypes.SUCCESS,
    tag: `approval-${certificateId}`,
    onClick: () => {
      window.location.href = `/dashboard/approvals`;
    },
  });
}

/**
 * Notification for certificate issued
 */
export function notifyCertificateIssued(certificateId, studentName) {
  return showNotification('Certificate Issued', {
    body: `Certificate for ${studentName} (${certificateId}) has been issued on-chain`,
    ...NotificationTypes.SUCCESS,
    tag: `issued-${certificateId}`,
    onClick: () => {
      window.location.href = `/dashboard/certificates`;
    },
  });
}

/**
 * Notification for officer authorized
 * @param {string} officerName - Full name of the officer
 * @param {string} [role] - Raw role key, e.g. "vc" or "chancellor"
 */
export function notifyOfficerAuthorized(officerName, role) {
  const label = role ? ` as ${roleLabel(role)}` : '';
  return showNotification('Officer Authorized', {
    body: `${officerName} has been authorized on-chain${label}`,
    ...NotificationTypes.SUCCESS,
  });
}

/**
 * Store notification permission in localStorage
 */
export function saveNotificationPreference(enabled) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('notifications_enabled', enabled ? 'true' : 'false');
  }
}

/**
 * Get notification preference from localStorage
 */
export function getNotificationPreference() {
  if (typeof window === 'undefined') return false;
  const pref = localStorage.getItem('notifications_enabled');
  return pref === 'true';
}

/**
 * Initialize notifications on app load
 * Shows permission request if user hasn't decided yet
 */
export async function initializeNotifications() {
  if (typeof window === 'undefined') return;

  // Check if user has already made a choice
  const hasPermission = Notification.permission;
  
  if (hasPermission === 'default') {
    // User hasn't decided yet - we'll ask when they perform an action
    return 'default';
  }

  if (hasPermission === 'granted') {
    saveNotificationPreference(true);
    return 'granted';
  }

  return hasPermission;
}
