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
  const buttonClasses =
    "touch-target inline-flex min-h-11 items-center justify-center border border-mint-dim bg-transparent px-4 py-2 font-mono text-xs font-semibold tracking-[0.08em] text-mint transition-all duration-200 hover:border-mint hover:shadow-[0_0_12px_rgba(202,245,222,0.15)] disabled:cursor-not-allowed disabled:opacity-40";

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleConnect = async () => {
    if (wallets.length === 0) return;
    setConnecting(true);
    try {
      await dAppKit.connectWallet({ wallet: wallets[0] });
    } catch (error) {
      console.error("Wallet connection failed:", error);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await dAppKit.disconnectWallet();
    } catch (error) {
      console.error("Wallet disconnect failed:", error);
    }
    setOpen(false);
  };

  if (!account) {
    return (
      <button onClick={handleConnect} disabled={connecting || wallets.length === 0} className={buttonClasses}>
        {connecting ? "CONNECTING..." : wallets.length === 0 ? "NO WALLET" : "CONNECT WALLET"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((current) => !current)} className={buttonClasses}>
        {formatAddress(account.address)}
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-[1000] mt-2 w-[calc(100vw-2rem)] max-w-none -translate-x-1/2 border border-border-panel bg-bg-panel p-4 shadow-[0_4px_12px_rgba(0,0,0,0.3)] sm:left-auto sm:right-0 sm:w-80 sm:translate-x-0">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1 text-xs font-medium text-text-dim">ADDRESS</div>
              <div className="break-all font-mono text-sm text-text">{account.address}</div>
            </div>

            <Link
              to="/portfolio"
              onClick={() => setOpen(false)}
              className="touch-target inline-flex min-h-11 items-center justify-center border border-mint-dim bg-[rgba(202,245,222,0.12)] px-3 py-2 text-center text-xs font-semibold text-mint no-underline transition-all duration-200 hover:bg-[rgba(202,245,222,0.2)]"
            >
              PORTFOLIO -&gt;
            </Link>

            <button
              onClick={handleDisconnect}
              className="touch-target inline-flex min-h-11 items-center justify-center border border-orange bg-[rgba(221,122,31,0.12)] px-3 py-2 text-xs font-semibold text-orange transition-all duration-200 hover:bg-[rgba(221,122,31,0.2)]"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
