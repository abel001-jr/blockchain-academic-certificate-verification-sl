"use client";
import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
export default function WalletCancellationToast() {
  const [visible, setVisible] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    function cancelled() { clearTimeout(timer.current); setVisible(true); timer.current = setTimeout(() => setVisible(false), 5000); }
    window.addEventListener("credence:wallet-cancelled", cancelled);
    return () => { window.removeEventListener("credence:wallet-cancelled", cancelled); clearTimeout(timer.current); };
  }, []);
  return visible ? <div role="status" aria-live="polite" className="wallet-cancellation-toast"><AlertTriangle size={22} aria-hidden="true" className="wallet-cancellation-toast__icon" /><div><strong>MetaMask request cancelled</strong><p>Operation not completed. You cancelled the wallet request; try again when ready.</p></div><button type="button" aria-label="Dismiss notification" onClick={() => { clearTimeout(timer.current); setVisible(false); }}>&times;</button></div> : null;
}
