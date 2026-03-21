/**
 * Trust tier metadata — labels, colors, plain-language descriptions.
 * Used by every trust-tier-aware component.
 */

import { TrustTier } from "./market-types";

export interface TrustTierMeta {
  label: string;
  description: string;
  color: string;
  glow: string;
  dimColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  opacity: number;
}

export const TRUST_TIER_META: Record<TrustTier, TrustTierMeta> = {
  [TrustTier.CANONICAL]: {
    label: "CANONICAL",
    description: "Resolved automatically from on-chain data",
    color: "var(--pm-canonical)",
    glow: "var(--glow-mint)",
    dimColor: "var(--mint-dim)",
    borderColor: "var(--mint)",
    badgeBg: "var(--mint)",
    badgeText: "var(--bg-panel)",
    opacity: 1.0,
  },
  [TrustTier.SOURCE_BOUND]: {
    label: "SOURCE-BOUND",
    description: "Verified against a declared external source",
    color: "var(--pm-source-bound)",
    glow: "var(--glow-yellow)",
    dimColor: "var(--yellow-dim)",
    borderColor: "var(--yellow)",
    badgeBg: "transparent",
    badgeText: "var(--yellow)",
    opacity: 1.0,
  },
  [TrustTier.CREATOR_RESOLVED]: {
    label: "CREATOR-RESOLVED",
    description: "Resolved by the market creator, subject to dispute",
    color: "var(--pm-creator-resolved)",
    glow: "var(--glow-orange)",
    dimColor: "var(--orange-dim)",
    borderColor: "var(--orange)",
    badgeBg: "transparent",
    badgeText: "var(--orange)",
    opacity: 0.9,
  },
  [TrustTier.EXPERIMENTAL]: {
    label: "EXPERIMENTAL",
    description: "High-risk market — creator-resolved, limited visibility",
    color: "var(--pm-experimental)",
    glow: "none",
    dimColor: "var(--text-dim)",
    borderColor: "var(--border-panel)",
    badgeBg: "transparent",
    badgeText: "var(--text-dim)",
    opacity: 0.85,
  },
};

/** Convenience: get tier meta with safe fallback */
export function getTrustTierMeta(tier: TrustTier): TrustTierMeta {
  return TRUST_TIER_META[tier] ?? TRUST_TIER_META[TrustTier.EXPERIMENTAL];
}
