"use client";

import { useCallback, useEffect, useState } from "react";
import { requireEthereum } from "@/lib/walletActions";
import { readWalletAccounts } from "@/lib/walletConnection.mjs";

export function useWalletAccounts() {
  const [accounts, setAccounts] = useState([]);
  const refresh = useCallback(async () => {
    try { setAccounts(await readWalletAccounts(requireEthereum())); }
    catch { setAccounts([]); }
  }, []);
  useEffect(() => {
    let alive = true;
    let provider;
    const update = async () => {
      try { const list = await readWalletAccounts(provider); if (alive) setAccounts(list); }
      catch { if (alive) setAccounts([]); }
    };
    try {
      provider = requireEthereum();
      void update();
      provider.on?.("accountsChanged", update);
      window.addEventListener("focus", update);
      window.addEventListener("credence:wallet-connection-changed", update);
    } catch { /* The main action explains how to install/unlock MetaMask. */ }
    return () => {
      alive = false;
      provider?.removeListener?.("accountsChanged", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("credence:wallet-connection-changed", update);
    };
  }, []);
  return { accounts, refresh };
}

