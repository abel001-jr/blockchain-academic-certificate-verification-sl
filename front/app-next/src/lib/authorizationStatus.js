"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

const methods = { institutional_admin: "isActiveIssuer", registrar: "isAuthorizedRegistrar", vc: "isAuthorizedVC", chancellor: "isAuthorizedChancellor" };
export function useAuthorizationStatus(users) {
  const [state, setState] = useState({ statuses: {}, error: "", loading: true });
  useEffect(() => {
    let alive = true, provider;
    async function read() {
      if (!users.length) { if (alive) setState({ statuses: {}, error: "", loading: false }); return; }
      setState({ statuses: {}, error: "", loading: true });
      try {
        const config = await api.get("/chain-config/");
        const { ethers } = await import("ethers");
        if (!config.rpc_url || !config.chain_id || !config.issuer_registry_address) throw new Error("Missing chain configuration");
        provider?.destroy();
        const connection = new ethers.FetchRequest(config.rpc_url);
        connection.timeout = 8000;
        provider = new ethers.JsonRpcProvider(connection, undefined, { batchMaxCount: 1 });
        if ((await provider.getNetwork()).chainId !== BigInt(config.chain_id)) throw new Error("Wrong RPC network");
        if (await provider.getCode(config.issuer_registry_address) === "0x") throw new Error("Registry not deployed");
        const registry = new ethers.Contract(config.issuer_registry_address,
          Object.values(methods).map(method => `function ${method}(address) view returns (bool)`), provider);
        const statuses = {};
        await Promise.all(users.map(async user => {
          const method = methods[user.role];
          if (method && user.wallet_address) statuses[user.id] = await registry[method](user.wallet_address);
        }));
        if (alive) setState({ statuses, error: "", loading: false });
      } catch {
        if (alive) setState({ statuses: {}, error: "Live authorization could not be checked. Check the RPC server and blockchain configuration; saved authorization records may be outdated.", loading: false });
      }
    }
    void read();
    window.addEventListener("focus", read);
    return () => { alive = false; window.removeEventListener("focus", read); provider?.destroy(); };
  }, [users]);
  return state;
}
