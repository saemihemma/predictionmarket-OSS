import { useEffect } from "react";
import type { UiWallet } from "@mysten/dapp-kit-core";

interface WalletPickerProps {
  wallets: UiWallet[];
  connectingWalletName?: string | null;
  onClose: () => void;
  onSelect: (wallet: UiWallet) => void | Promise<void>;
  title?: string;
  description?: string;
}

export default function WalletPicker({
  wallets,
  connectingWalletName = null,
  onClose,
  onSelect,
  title = "CHOOSE A SUI WALLET",
  description = "Pick the wallet you want to use on Sui testnet. The app will stop guessing for you.",
}: WalletPickerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !connectingWalletName) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [connectingWalletName, onClose]);

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-[rgba(2,5,3,0.82)] px-4 py-6"
      onClick={() => {
        if (!connectingWalletName) onClose();
      }}
    >
      <div
        className="w-full max-w-lg border border-border-panel bg-bg-panel p-5 shadow-[0_0_28px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[0.72rem] font-semibold tracking-[0.14em] text-text-muted">WALLET ACCESS</div>
            <h3 className="mt-3 m-0 text-[1.1rem] font-bold tracking-[0.1em] text-mint md:text-[1.25rem]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(connectingWalletName)}
            className="touch-target inline-flex min-h-10 min-w-10 items-center justify-center border border-border-panel px-3 text-xs font-semibold tracking-[0.12em] text-text-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            CLOSE
          </button>
        </div>

        <p className="mt-4 mb-0 text-[0.84rem] leading-6 tracking-[0.04em] text-text-muted">{description}</p>

        <div className="mt-5 grid gap-3">
          {wallets.length > 0 ? (
            wallets.map((wallet) => {
              const isConnecting = connectingWalletName === wallet.name;

              return (
                <button
                  key={wallet.name}
                  type="button"
                  onClick={() => void onSelect(wallet)}
                  disabled={Boolean(connectingWalletName)}
                  className="touch-target flex min-h-14 items-center gap-3 border border-border-panel bg-[rgba(202,245,222,0.04)] px-4 py-3 text-left transition-all duration-200 hover:border-mint-dim hover:bg-[rgba(202,245,222,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <img src={wallet.icon} alt="" className="h-8 w-8 rounded-sm object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.85rem] font-semibold tracking-[0.06em] text-text">{wallet.name}</div>
                    <div className="mt-1 text-[0.72rem] tracking-[0.05em] text-text-muted">
                      {isConnecting ? "Connecting now..." : "Use this wallet for the Orchestrator on Sui testnet."}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="border border-border-panel bg-[rgba(2,5,3,0.5)] px-4 py-5 text-[0.8rem] leading-6 tracking-[0.04em] text-text-muted">
              No Sui wallet was detected in this browser yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
