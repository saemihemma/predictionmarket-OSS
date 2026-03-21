import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount, useWallets, useDAppKit } from "@mysten/dapp-kit-react";
import { formatAddress } from "../../lib/formatting";

/**
 * Shared wallet connection button.
 * Uses @mysten/dapp-kit-react for real wallet connection.
 * When no wallet extension is installed, shows "NO WALLET" state.
 */
export default function ConnectButton() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const dAppKit = useDAppKit();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleConnect = async () => {
    if (wallets.length === 0) return;
    setConnecting(true);
    try {
      await dAppKit.connectWallet({ wallet: wallets[0] });
    } catch (e) {
      console.error("Wallet connection failed:", e);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await dAppKit.disconnectWallet();
    } catch (e) {
      console.error("Wallet disconnect failed:", e);
    }
    setOpen(false);
  };

  // Not connected
  if (!account) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting || wallets.length === 0}
        className="bg-transparent border border-mint-dim text-mint text-xs font-semibold tracking-[0.08em] px-4 py-2 cursor-pointer font-mono transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {connecting ? "CONNECTING..." : wallets.length === 0 ? "NO WALLET" : "CONNECT WALLET"}
      </button>
    );
  }

  // Connected
  const address = account.address;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="bg-transparent border border-mint-dim text-mint text-xs font-semibold tracking-[0.08em] px-4 py-2 cursor-pointer font-mono transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)]"
      >
        {formatAddress(address)}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 bg-bg-panel border border-border-panel p-4 min-w-[280px] z-[1000] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-xs text-text-dim mb-1 font-medium">ADDRESS</div>
              <div className="text-sm text-text font-mono break-all">{address}</div>
            </div>
            <Link
              to="/portfolio"
              onClick={() => setOpen(false)}
              className="px-3 py-2 bg-[rgba(202,245,222,0.12)] text-mint border border-mint-dim no-underline text-xs font-semibold text-center cursor-pointer transition-all duration-200 hover:bg-[rgba(202,245,222,0.2)]"
            >
              PORTFOLIO →
            </Link>
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 bg-[rgba(221,122,31,0.12)] text-orange border border-orange text-xs font-semibold cursor-pointer transition-all duration-200 hover:bg-[rgba(221,122,31,0.2)]"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
