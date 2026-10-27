export async function ensureWalletChain(ethereum, config) {
  if (!config.chain_id) throw new Error("The signing network is not configured. Contact the system administrator.");
  const expected = BigInt(config.chain_id);
  const chainId = `0x${expected.toString(16)}`;
  if (BigInt(await ethereum.request({ method: "eth_chainId" })) === expected) return;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (error) {
    const code = error?.code ?? error?.data?.originalError?.code;
    if (code === 4001) throw new Error("Network change cancelled. Submit again and approve the network change in MetaMask.");
    if (code !== 4902) throw new Error("MetaMask could not change networks. Unlock MetaMask and check its pending network request before submitting again.");
    if (!config.rpc_url || ![1n, 11155111n, 31337n].includes(expected)) {
      throw new Error(`Network ${config.chain_id} is not added in MetaMask. Ask the administrator for its network settings, add it in MetaMask, then submit again.`);
    }
    try {
      await ethereum.request({ method: "wallet_addEthereumChain", params: [{
        chainId, chainName: expected === 31337n ? "Hardhat Local" : expected === 11155111n ? "Sepolia" : "Ethereum Mainnet",
        rpcUrls: [config.rpc_url], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      }] });
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (failure) {
      if (failure?.code === 4001) throw new Error("Network setup cancelled. Submit again and approve the network request in MetaMask.");
      throw new Error(`MetaMask could not connect to network ${config.chain_id}. Check that its RPC server is running and reachable from this device, then submit again.`);
    }
  }
  if (BigInt(await ethereum.request({ method: "eth_chainId" })) !== expected) {
    throw new Error(`MetaMask is still on another network. Approve network ${config.chain_id} in MetaMask before submitting again.`);
  }
}
