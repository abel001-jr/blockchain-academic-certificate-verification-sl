"use client";
import { useEffect } from "react";

/**
 * Global error handler for browser extension timeout errors.
 * Suppresses harmless extension communication timeouts that don't affect functionality.
 */
export default function ExtensionErrorHandler() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === "undefined") return;

    // Handle unhandled promise rejections (most common for extension errors)
    const handleUnhandledRejection = (event) => {
      const error = event.reason;
      const errorMessage = error?.message || String(error);
      
      // Check if it's a browser extension timeout error
      const isExtensionError = 
        errorMessage.includes('chrome: call method') ||
        errorMessage.includes('chrome-extension://') ||
        (errorMessage.includes('timeout') && errorMessage.includes('Window message'));
      
      if (isExtensionError) {
        // Prevent the error from showing in console as "Unhandled rejection"
        event.preventDefault();
        
        // Log once for debugging (optional - remove in production)
        console.debug(
          '[ExtensionErrorHandler] Suppressed extension timeout:', 
          errorMessage.substring(0, 100)
        );
        
        return;
      }
    };

    // Handle uncaught errors
    const handleError = (event) => {
      const error = event.error;
      const errorMessage = error?.message || String(error);
      
      const isExtensionError = 
        errorMessage.includes('chrome: call method') ||
        errorMessage.includes('chrome-extension://') ||
        (errorMessage.includes('timeout') && errorMessage.includes('Window message'));
      
      if (isExtensionError) {
        event.preventDefault();
        console.debug(
          '[ExtensionErrorHandler] Suppressed extension error:', 
          errorMessage.substring(0, 100)
        );
        return;
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null; // This component doesn't render anything
}
