const connections = new WeakMap();

export async function readWalletAccounts(provider) {
  const accounts = await provider.request({ method: "eth_accounts" });
  return [...new Set((accounts || []).map(address => address.toLowerCase()))];
}

export function singleWalletAccount(accounts) {
  if (accounts.length > 1) throw new Error("Multiple MetaMask accounts are connected. In MetaMask, allow this site to use only the wallet registered to your signed-in account.");
  if (!accounts.length) throw new Error("No MetaMask account is connected. Connect one account to continue.");
  return accounts[0];
}

export function connectSingleWallet(provider) {
  if (connections.has(provider)) return connections.get(provider);
  const pending = (async () => {
    let accounts = await readWalletAccounts(provider);
    if (!accounts.length) {
      await provider.request({ method: "eth_requestAccounts" });
      accounts = await readWalletAccounts(provider);
    }
    return singleWalletAccount(accounts);
  })().catch(error => {
    if (error?.code === -32002) throw new Error("A MetaMask request is already open. Complete or cancel it in MetaMask before trying again.");
    throw error;
  }).finally(() => connections.delete(provider));
  connections.set(provider, pending);
  return pending;
}

export async function disconnectWalletAccounts(provider) {
  try {
    await provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch (error) {
    if (error?.code === -32601 || error?.code === 4200) throw new Error("Open MetaMask Permissions and disconnect this website's accounts, then return here.");
    throw error;
  }
  const accounts = await readWalletAccounts(provider);
  if (accounts.length) throw new Error("MetaMask still reports connected accounts. Disconnect this website from its Permissions screen.");
}
