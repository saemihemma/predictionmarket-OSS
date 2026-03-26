import { useEffect } from "react";
import { motion } from "framer-motion";
import type { SuccessAccent, SummaryTone, TransactionSuccessSummaryRow } from "../../lib/trade-success";

interface TransactionSuccessOverlayProps {
  headline: string;
  message: string;
  summaryRows: TransactionSuccessSummaryRow[];
  digest?: string | null;
  explorerUrl?: string | null;
  accent?: SuccessAccent;
  primaryActionLabel?: string;
  onPrimaryAction: () => void;
}

const accentTokens: Record<
  SuccessAccent,
  {
    textClass: string;
    borderClass: string;
    glowClass: string;
    buttonBackgroundClass: string;
    buttonHoverClass: string;
    receiptBackgroundClass: string;
    ambient: string;
  }
> = {
  mint: {
    textClass: "text-mint",
    borderClass: "border-mint-dim",
    glowClass: "shadow-[0_0_36px_rgba(202,245,222,0.12)]",
    buttonBackgroundClass: "bg-[rgba(202,245,222,0.14)]",
    buttonHoverClass: "hover:bg-[rgba(202,245,222,0.24)]",
    receiptBackgroundClass: "bg-[rgba(202,245,222,0.05)]",
    ambient: "bg-[radial-gradient(circle_at_top,rgba(202,245,222,0.12),rgba(2,5,3,0.96)_64%)]",
  },
  tribeB: {
    textClass: "text-tribe-b",
    borderClass: "border-tribe-b-dim",
    glowClass: "shadow-[0_0_36px_rgba(77,184,212,0.16)]",
    buttonBackgroundClass: "bg-[rgba(77,184,212,0.14)]",
    buttonHoverClass: "hover:bg-[rgba(77,184,212,0.24)]",
    receiptBackgroundClass: "bg-[rgba(77,184,212,0.05)]",
    ambient: "bg-[radial-gradient(circle_at_top,rgba(77,184,212,0.12),rgba(2,5,3,0.96)_64%)]",
  },
};

const toneClasses: Record<SummaryTone, string> = {
  default: "text-text",
  mint: "text-mint",
  tribeB: "text-tribe-b",
};

export default function TransactionSuccessOverlay({
  headline,
  message,
  summaryRows,
  digest,
  explorerUrl,
  accent = "mint",
  primaryActionLabel = "CONTINUE",
  onPrimaryAction,
}: TransactionSuccessOverlayProps) {
  const styles = accentTokens[accent];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[1250] flex items-center justify-center bg-[rgba(2,5,3,0.88)] px-4 py-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-success-headline"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={`w-full max-w-3xl border ${styles.borderClass} ${styles.glowClass} ${styles.ambient}`}
      >
        <div className="border-b border-border-panel px-5 py-4 md:px-6">
          <div className={`text-[0.7rem] font-semibold tracking-[0.18em] ${styles.textClass}`}>TRANSACTION CONFIRMED</div>
        </div>

        <div className="flex flex-col gap-6 px-5 py-5 md:px-6 md:py-6">
          <div className="space-y-3">
            <h2 id="transaction-success-headline" className={`m-0 text-[1.6rem] font-bold tracking-[0.12em] ${styles.textClass} md:text-[2rem]`}>
              {headline}
            </h2>
            <p className="m-0 max-w-2xl text-[0.9rem] leading-7 tracking-[0.05em] text-text-muted">{message}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {summaryRows.map((row) => (
              <div key={row.label} className="border border-border-panel bg-bg-panel px-4 py-3">
                <div className="text-[0.66rem] font-semibold tracking-[0.14em] text-text-muted">{row.label}</div>
                <div className={`mt-2 text-[0.98rem] font-semibold tracking-[0.08em] ${toneClasses[row.tone ?? "default"]}`}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>

          {digest && (
            <div className={`border ${styles.borderClass} ${styles.receiptBackgroundClass} px-4 py-4`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="text-[0.66rem] font-semibold tracking-[0.14em] text-text-muted">CHAIN RECEIPT</div>
                  <div className={`mt-2 break-all font-mono text-[0.76rem] leading-7 ${styles.textClass}`}>{digest}</div>
                </div>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center border border-border-panel px-4 py-2 font-mono text-[0.72rem] font-semibold tracking-[0.1em] text-text no-underline transition-all duration-200 hover:bg-[rgba(255,255,255,0.03)]"
                  >
                    VIEW ON EXPLORER
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={onPrimaryAction}
              className={`touch-target inline-flex min-h-12 min-w-[12rem] items-center justify-center border px-5 py-3 font-mono text-xs font-semibold tracking-[0.14em] transition-all duration-200 ${styles.borderClass} ${styles.buttonBackgroundClass} ${styles.textClass} ${styles.buttonHoverClass}`}
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
