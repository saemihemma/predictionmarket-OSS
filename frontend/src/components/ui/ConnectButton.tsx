import { useRef, useEffect, useState } from "react";
import type { DAppKit, UiWallet } from "@mysten/dapp-kit-core";
import { Link } from "react-router-dom";
import { useCurrentAccount, useWallets, useDAppKit } from "@mysten/dapp-kit-react";
import { formatAddress } from "../../lib/formatting";
import WalletPicker from "./WalletPicker";

/**
 * Shared wallet connection button.
 * Uses @mysten/dapp-kit-react for real wallet connection.
 * When no wallet extension is installed, shows "NO WALLET" state.
 */
export default function ConnectButton() {
  const account = useCurrentAccount();
  const wallets = useWallets();
  const dAppKit = useDAppKit() as DAppKit;
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connectingWalletName, setConnectingWalletName] = useState<string | null>(null);
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

  const handleConnect = async (wallet: UiWallet) => {
    setConnectingWalletName(wallet.name);
    try {
      await dAppKit.connectWallet({ wallet });
      setPickerOpen(false);
    } catch (error) {
      console.error("Wallet connection failed:", error);
    } finally {
      setConnectingWalletName(null);
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
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={Boolean(connectingWalletName) || wallets.length === 0}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className={buttonClasses}
        >
          {connectingWalletName ? "CONNECTING..." : wallets.length === 0 ? "NO WALLET" : "CONNECT WALLET"}
        </button>
        {pickerOpen && (
          <WalletPicker
            wallets={wallets}
            connectingWalletName={connectingWalletName}
            onClose={() => setPickerOpen(false)}
            onSelect={handleConnect}
            title="CHOOSE YOUR WALLET"
            description="Pick the wallet you want the Orchestrator to use. It only connects after you choose."
          />
        )}
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClasses}
      >
        {formatAddress(account.address)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Wallet menu"
          className="absolute left-1/2 top-full z-[1000] mt-2 w-[calc(100vw-2rem)] max-w-none -translate-x-1/2 border border-border-panel bg-bg-panel p-4 shadow-[0_4px_12px_rgba(0,0,0,0.3)] sm:left-auto sm:right-0 sm:w-80 sm:translate-x-0"
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1 text-xs font-medium text-text-dim">ADDRESS</div>
              <div className="break-all font-mono text-sm text-text">{account.address}</div>
            </div>

            <Link
              to="/portfolio"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="touch-target inline-flex min-h-11 items-center justify-center border border-mint-dim bg-[rgba(202,245,222,0.12)] px-3 py-2 text-center text-xs font-semibold text-mint no-underline transition-all duration-200 hover:bg-[rgba(202,245,222,0.2)]"
            >
              PORTFOLIO -&gt;
            </Link>

            <button
              type="button"
              role="menuitem"
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
