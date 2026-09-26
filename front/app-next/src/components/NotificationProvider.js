"use client";
import { createContext, useContext, useState, useEffect } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { 
  requestNotificationPermission, 
  canShowNotifications,
  saveNotificationPreference,
  getNotificationPreference 
} from '@/lib/notifications';

const NotificationContext = createContext({});

export function useNotifications() {
  return useContext(NotificationContext);
}

export default function NotificationProvider({ children }) {
  const [permissionStatus, setPermissionStatus] = useState('loading');
  const [showBanner, setShowBanner] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    // Check permission status on mount
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const status = Notification.permission;
      setPermissionStatus(status);
      
      // Show banner if permission is 'default' (not yet requested)
      // and user hasn't previously dismissed it
      if (status === 'default') {
        const dismissed = localStorage.getItem('notification_banner_dismissed');
        if (!dismissed) {
          // Delay banner show by 2 seconds for better UX
          setTimeout(() => setShowBanner(true), 2000);
        }
      }
    } else {
      setPermissionStatus('unsupported');
    }
  }, []);

  const requestPermission = async () => {
    setRequesting(true);
    try {
      const permission = await requestNotificationPermission();
      setPermissionStatus(permission);
      
      if (permission === 'granted') {
        saveNotificationPreference(true);
        setShowBanner(false);
      } else if (permission === 'denied') {
        saveNotificationPreference(false);
        setShowBanner(false);
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setRequesting(false);
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('notification_banner_dismissed', 'true');
  };

  const value = {
    permissionStatus,
    canNotify: canShowNotifications(),
    requestPermission,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      
      {/* Notification Permission Banner */}
      {showBanner && permissionStatus === 'default' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
          <div className="bg-gradient-to-r from-[#08283F] to-[#0D3C5C] border-t-2 border-[#B98A28] shadow-2xl">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-10 h-10 rounded-full bg-[#B98A28]/20 flex items-center justify-center">
                    <Bell size={20} className="text-[#B98A28]" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold text-base mb-1">
                    Stay Updated with Credence
                  </h3>
                  <p className="text-white/80 text-sm leading-relaxed">
                    Enable notifications to receive instant updates about certificate approvals, 
                    on-chain transactions, and important system events. You can change this anytime in settings.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={requestPermission}
                    disabled={requesting}
                    className="inline-flex items-center gap-2 bg-[#B98A28] hover:bg-[#C59A3A] text-white font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requesting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        Enable
                      </>
                    )}
                  </button>
                  <button
                    onClick={dismissBanner}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Dismiss"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
