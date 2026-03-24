import type { DAppKit, UiWallet } from "@mysten/dapp-kit-core";

export const WALLET_AUTOCONNECT_SUPPRESSED_KEY = "orchestrator:wallet-autoconnect-suppressed";

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isWalletAutoConnectSuppressed(): boolean {
  return getBrowserStorage()?.getItem(WALLET_AUTOCONNECT_SUPPRESSED_KEY) === "1";
}

export function suppressWalletAutoConnect(): void {
  getBrowserStorage()?.setItem(WALLET_AUTOCONNECT_SUPPRESSED_KEY, "1");
}

export function clearWalletAutoConnectSuppression(): void {
  getBrowserStorage()?.removeItem(WALLET_AUTOCONNECT_SUPPRESSED_KEY);
}

export async function connectSelectedWallet(
  dAppKit: Pick<DAppKit, "connectWallet">,
  wallet: UiWallet,
): Promise<void> {
  await dAppKit.connectWallet({ wallet });
  clearWalletAutoConnectSuppression();
}

export async function disconnectSelectedWallet(
  dAppKit: Pick<DAppKit, "disconnectWallet">,
): Promise<void> {
  suppressWalletAutoConnect();
  await dAppKit.disconnectWallet();
}
