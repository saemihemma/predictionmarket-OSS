# Frontend Architecture Guide — THE ORCHESTRATOR

**Version:** 1.0
**Last Updated:** 2026-03-20
**Purpose:** Enable ANY agent to work on the frontend correctly without breaking conventions.

This document is the SINGLE SOURCE OF TRUTH for frontend code standards. Read this FIRST before editing any page or component.

---

## Table of Contents

1. [Styling Convention](#styling-convention)
2. [Type System](#type-system)
3. [Data Layer](#data-layer)
4. [Component Structure](#component-structure)
5. [Page Layout Pattern](#page-layout-pattern)
6. [Market Detail States](#market-detail-states)
7. [Agent Edit Protocol](#agent-edit-protocol)

---

## 1. Styling Convention

### THE RULE: Inline Styles with CSS Custom Properties — NEVER Tailwind

**THIS CODEBASE USES INLINE STYLES, NOT TAILWIND CLASSES.**

Every element is styled using inline `style` objects with `var()` references to CSS custom properties defined in `/frontend/src/index.css`.

#### ✅ CORRECT:
```tsx
<div style={{
  background: "var(--bg-panel)",
  border: "1px solid var(--border-panel)",
  padding: "1.5rem",
  color: "var(--mint)",
  fontSize: "0.9rem",
  fontWeight: 600,
  fontFamily: "'IBM Plex Mono', monospace",
}}>
  Content
</div>
```

#### ❌ WRONG:
```tsx
<div className="bg-green-100 border border-gray-300 p-6 text-green-700">
  // NEVER USE TAILWIND CLASSES
</div>
```

#### ❌ WRONG:
```tsx
<div className="terminal-panel mint-text large-padding">
  // NEVER USE CUSTOM CSS CLASSES
</div>
```

---

### CSS Custom Properties Reference

All colors and design tokens are defined as CSS custom properties in `index.css`. Use ONLY these:

| Token | Hex Value | Usage |
|-------|-----------|-------|
| `--bg-terminal` | `#020503` | Page background, main container |
| `--bg-panel` | `#06110c` | Panel backgrounds, cards, input backgrounds |
| `--mint` | `#caf5de` | Primary text, active states, main accent color |
| `--mint-dim` | `#6e9f8d` | Dimmed mint for borders, muted states |
| `--orange` | `#dd7a1f` | Warnings, time-sensitive alerts, phase transitions |
| `--orange-dim` | `#8a4a10` | Dimmed orange for borders |
| `--yellow` | `#f2c94c` | Faction A (stable ownership), SDVM voting indicators |
| `--yellow-dim` | `#8a7428` | Dimmed yellow for borders |
| `--neutral-state` | `#4f6b60` | Neutral indicator state |
| `--border-panel` | `#2a3a33` | Standard panel borders |
| `--border-active` | `#caf5de` | Active/focused borders (mint color) |
| `--border-grid` | `#0f1e18` | Grid lines, subtle dividers |
| `--border-inactive` | `#1b2b24` | Inactive state borders |
| `--border-edge` | `#6e9f8d` | Edge borders, secondary dividers |
| `--text` | `#caf5de` | Primary text (same as mint) |
| `--text-muted` | `#6e9f8d` | Secondary text, de-emphasized content |
| `--text-dim` | `#5a7a6a` | Tertiary text, very muted |
| `--tribe-a` | `#f2c94c` | Data layer: Tribe A (yellow faction) |
| `--tribe-a-dim` | `#8a7428` | Dimmed Tribe A |
| `--tribe-b` | `#4db8d4` | Data layer: Tribe B (cyan faction) |
| `--tribe-b-dim` | `#2a6e82` | Dimmed Tribe B |
| `--contested` | Same as `--orange` | Contested state indicator |
| `--glow-mint` | `rgba(202, 245, 222, 0.18)` | Mint glow background |
| `--glow-tribe-a` | `rgba(242, 201, 76, 0.18)` | Tribe A glow background |
| `--glow-tribe-b` | `rgba(77, 184, 212, 0.18)` | Tribe B glow background |
| `--glow-orange` | `rgba(221, 122, 31, 0.18)` | Orange glow background |
| `--glow-yellow` | `rgba(242, 201, 76, 0.18)` | Yellow glow background |

---

### Typography

All text uses `"IBM Plex Mono", monospace` font family. This is defined globally in `index.css`.

**Font sizes and weights in inline styles:**

```tsx
// Headings
fontSize: "1.8rem", fontWeight: 600, letterSpacing: "0.15em"  // H1
fontSize: "1.1rem", fontWeight: 600, letterSpacing: "0.1em"   // H2
fontSize: "0.9rem", fontWeight: 600, letterSpacing: "0.08em"  // H3

// Body text
fontSize: "0.85rem", fontWeight: 400, letterSpacing: "0.05em"
fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em"  // Labels
fontSize: "0.7rem", fontWeight: 400, letterSpacing: "0.06em"  // Small
fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.1em"   // Badge tags
```

**Letter spacing:**
- `0.15em` — Major headings (H1)
- `0.12em` — Button text, links
- `0.1em` — Section labels, captions
- `0.08em` — Input labels, body text
- `0.06em` — Footer text, fine print
- `0.05em` — Normal body

---

### Common Style Patterns

#### Card/Panel Pattern
```tsx
<div style={{
  background: "var(--bg-panel)",
  border: "1px solid var(--border-panel)",
  padding: "1.5rem",
  transition: "all 0.2s ease",
}}>
  {/* content */}
</div>
```

#### Button Pattern (with mint accent)
```tsx
<button style={{
  background: "transparent",
  border: "1px solid var(--border-panel)",
  color: "var(--mint)",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.1em",
  padding: "0.5rem 1rem",
  cursor: "pointer",
  fontFamily: "'IBM Plex Mono', monospace",
  transition: "all 0.2s ease",
}}
onMouseEnter={e => {
  e.currentTarget.style.borderColor = "var(--mint)";
  e.currentTarget.style.boxShadow = "0 0 12px rgba(202, 245, 222, 0.15)";
}}
onMouseLeave={e => {
  e.currentTarget.style.borderColor = "var(--border-panel)";
  e.currentTarget.style.boxShadow = "none";
}}
>
  BUTTON TEXT
</button>
```

#### Input Field Pattern
```tsx
<input
  type="text"
  placeholder="PLACEHOLDER..."
  style={{
    width: "100%",
    background: "var(--bg-panel)",
    border: "1px solid var(--border-panel)",
    color: "var(--mint)",
    padding: "0.8rem",
    fontSize: "0.85rem",
    letterSpacing: "0.08em",
    outline: "none",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    fontFamily: "'IBM Plex Mono', monospace",
  }}
/>
```

#### Hover Glow Pattern (by accent color)
```tsx
// MINT glow (for buttons, links, active states)
onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 12px rgba(202, 245, 222, 0.15)")}
onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}

// ORANGE glow (for warnings, alerts)
onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 16px rgba(221, 122, 31, 0.5)")}
onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 8px rgba(221, 122, 31, 0.3)")}

// YELLOW glow (for faction A)
// Similar pattern with --tribe-a colors
```

---

### CRT Effects

CRT scanlines and vignette are applied via CSS classes on the index page ONLY:

```tsx
<div style={{ minHeight: "100dvh", background: "var(--bg-terminal)", color: "var(--text)" }}>
  <div className="crt-scanlines" />
  <div className="crt-vignette" />
  {/* Page content */}
</div>
```

These classes are defined in `index.css` and should NOT be duplicated. They are shared globally.

---

## 2. Type System

### Enums and Constants

All types are defined in `/frontend/src/lib/market-types.ts`. **NEVER invent new type values.**

#### MarketType
```typescript
export const MarketType = {
  BINARY: 0,              // Yes/No market
  CATEGORICAL: 1,         // Multiple choice
  BUCKETED_SCALAR: 2,     // Range/bucket market
} as const;
```

**Labels:**
```typescript
MARKET_TYPE_LABELS = {
  0: "Yes / No",
  1: "Multiple Choice",
  2: "Range Market",
}
```

#### MarketState
```typescript
export const MarketState = {
  OPEN: 0,                // Trading is active
  CLOSED: 1,              // Trading ended, waiting for resolution proposal
  RESOLUTION_PENDING: 2,  // Proposal submitted, in dispute window
  DISPUTED: 3,            // Dispute filed, SDVM voting in progress
  RESOLVED: 4,            // Final outcome determined
  INVALID: 5,             // Market invalidated
} as const;
```

**Labels:**
```typescript
MARKET_STATE_LABELS = {
  0: "OPEN",
  1: "CLOSED",
  2: "RESOLUTION PENDING",
  3: "DISPUTED",
  4: "RESOLVED",
  5: "INVALID",
}
```

#### TrustTier
```typescript
export const TrustTier = {
  CANONICAL: 0,           // Official source, fully verifiable
  SOURCE_BOUND: 1,        // Source-based resolution
  CREATOR_RESOLVED: 2,    // Creator decides (community tier)
  EXPERIMENTAL: 3,        // Unverified, high-risk
} as const;
```

**Labels:**
```typescript
TRUST_TIER_LABELS = {
  0: "VERIFIED",
  1: "SOURCED",
  2: "COMMUNITY",
  3: "EXPERIMENTAL",
}
```

#### ResolutionClass
```typescript
export const ResolutionClass = {
  DETERMINISTIC: 0,       // Math/contract-based
  DECLARED_SOURCE: 1,     // External data source
  CREATOR_PROPOSED: 2,    // Creator proposes outcome
  GAME_EVENT: 3,          // On-chain game event
} as const;
```

#### CreatorInfluenceLevel
```typescript
export const CreatorInfluenceLevel = {
  NONE: 0,                // No creator influence
  INDIRECT: 1,            // Indirect influence possible
  DIRECT: 2,              // Creator directly controls outcome
} as const;
```

#### SourceClass (for resolution sources)
```typescript
export const SourceClass = {
  OFFICIAL_WEBSITE: 0,
  OFFICIAL_API: 1,
  OFFICIAL_DISCORD: 2,
  PUBLIC_ACCOUNT: 3,
  PUBLIC_DOCUMENT_URL: 4,
  ONCHAIN_STATE: 5,
  VERIFIER_OUTPUT: 6,
  WORLD_API: 7,
} as const;
```

---

### Core Interfaces

#### Market
The core market object. All required fields:

```typescript
export interface Market {
  // Identity
  id: string;
  marketNumber: number;
  creator: string;

  // Content
  title: string;                      // Max 120 chars
  description: string;                // Max 2000 chars
  resolutionText: string;             // How to resolve

  // Market structure
  marketType: MarketType;             // BINARY, CATEGORICAL, BUCKETED_SCALAR
  outcomeCount: number;               // 2+ (max varies by type)
  outcomeLabels: string[];            // ["YES", "NO"] or ["A", "B", "C", ...]
  outcomeQuantities: bigint[];        // Pool quantities per outcome
  totalCollateral: bigint;            // Total SFR in pool

  // Resolution rules
  resolutionClass: ResolutionClass;   // How outcome is determined
  sourceDeclaration: SourceDeclaration;
  creatorInfluence: CreatorInfluence;
  trustTier: TrustTier;               // CANONICAL, SOURCE_BOUND, CREATOR_RESOLVED, EXPERIMENTAL

  // Timing
  closeTimeMs: number;                // When trading stops (ms since epoch)
  resolveDeadlineMs: number;          // When resolution must occur
  disputeWindowMs: number;            // Duration of dispute window
  creatorPriorityWindowMs?: number;   // 24h = 86400000ms (creator-only proposal window)
  createdAtMs: number;

  // State
  state: MarketState;                 // OPEN, CLOSED, RESOLUTION_PENDING, DISPUTED, RESOLVED, INVALID
  frozen: boolean;                    // Emergency pause flag
  emergencyPaused: boolean;

  // Fees & accounting
  accruedFees: bigint;
  totalCostBasisSum: bigint;          // Pro-rata invalidation refunds
  invalidationSnapshotCollateral: bigint | null;

  // Policy IDs
  marketTypePolicyId: string;
  resolverPolicyId: string;
  configVersion: number;

  // Resolution flow data (populated during state transitions)
  resolution: ResolutionRecord | null;
  proposal?: ProposalData;            // Creator or community proposal
  dispute?: DisputeData;              // If dispute filed
  sdvm?: SDVMData;                    // If disputed → SDVM voting

  // User position (populated for portfolio view)
  userPosition?: {
    shares: Record<number, bigint>;   // Shares per outcome
    totalValue: bigint;
    pnl: bigint;
    unrealizedPnL: bigint;
    realizedPnL: bigint;
    hasWon: boolean;
    isClaimed: boolean;
  };
}
```

#### ProposalData
When market is CLOSED, contains creator or community proposal:

```typescript
export interface ProposalData {
  proposedOutcomeId: number;          // 0, 1, 2, etc.
  proposerAddress: string;            // Who proposed
  proposerType: "CREATOR" | "COMMUNITY";
  submittedAtMs: number;
  evidenceUrl: string;                // Link to evidence
  note?: string;
  disputeWindowEndMs: number;         // When dispute window closes
  creationBondAmount: number;         // Bond posted
}
```

#### DisputeData
When a proposal is disputed:

```typescript
export interface DisputeData {
  disputer: string;                   // Who filed dispute
  proposedOutcomeId: number;          // Which proposal outcome they dispute
  reasonText: string;                 // Why dispute was filed
  filedAtMs: number;
  bondAmount: number;
}
```

#### SDVMData
When dispute moves to SDVM voting:

```typescript
export interface SDVMData {
  phase: "COMMIT" | "REVEAL" | "TALLY";
  phaseStartMs: number;
  phaseEndMs: number;
  commitDeadlineMs?: number;
  revealDeadlineMs?: number;
  talliedOutcome?: number;            // Outcome after SDVM tally
  participantCount: number;           // Voters participating
  totalStakeParticipating: bigint;
  userVote?: {
    outcome: number;                  // User's vote (if voting)
    isRevealed: boolean;
  };
}
```

---

## 3. Data Layer

### useMarketData Hooks

All shipped market and portfolio reads flow through hooks in `/frontend/src/hooks/useMarketData.ts` and the shared transport in `/frontend/src/lib/client.ts`.

#### useMarketData(id: string)
Fetch a single market by ID.

```typescript
const { market, isLoading, error } = useMarketData("market-001");

// Returns:
// market: Market object (or undefined if not found)
//   - Enriched with calculated fields:
//     - creatorPriorityDeadlineMs: closeTimeMs + 24h
//     - timeUntilCommunityCanProposeMs: milliseconds until community can propose
// isLoading: boolean while live chain data is loading
// error: Error | null when the live transport fails
```

#### useAllMarkets()
Fetch all markets for index/listing pages.

```typescript
const { markets, isLoading, error } = useAllMarkets();

// Returns:
// markets: Market[] discovered from MarketCreatedEvent and loaded by object ID
// isLoading: boolean
// error: Error | null
```

#### useMarketStats()
Get aggregate statistics for the stats bar (index page only).

```typescript
const { totalMarkets, totalVolume, activeTraders, network } = useMarketStats();

// Returns:
// totalMarkets: number (count of all markets)
// totalVolume: string (formatted "123,456 SFR")
// activeTraders: number (count of unique traders)
// network: string ("TESTNET" or "MAINNET")
```

#### usePortfolio()
Get user's open and resolved positions.

```typescript
const { positions, isLoading, error } = usePortfolio();

// Returns:
// positions: Position[] where Position is {
//   marketId: string;
//   marketTitle: string;
//   outcome: string;
//   shares: bigint;
//   value: bigint;
//   pnl: bigint;
//   state: "open" | "resolved" | "claimable";
// }
```

---

### Live Read Path

Current live read flow:
1. `listMarketIds()` pages `MarketCreatedEvent` through Sui GraphQL.
2. `getObject()` / `getObjects()` normalize object JSON into the existing parser shape.
3. `listOwnedObjects()` and `listCoins()` power portfolio and collateral reads.
4. **Pages do NOT change** — they only consume hook interfaces

---

## 4. Component Structure

### File Organization

```
src/
├── pages/                       # Full routed pages
│   ├── MarketsIndexPage.tsx    # Market index/listing
│   ├── MarketDetailPage.tsx    # Single market view
│   ├── MarketCreatePage.tsx    # Market creation wizard
│   └── PortfolioPage.tsx       # User positions
├── components/
│   ├── ui/                      # Shared UI components (Footer, etc.)
│   │   ├── Footer.tsx
│   │   ├── TerminalScreen.tsx
│   │   ├── TerminalPanel.tsx
│   │   └── TerminalNumberInput.tsx
│   └── terminal/                # Terminal-specific components
├── hooks/                       # Data hooks
│   └── useMarketData.ts
├── lib/                         # Utilities & types
│   ├── market-types.ts
│   ├── mock-markets.ts
│   └── amm.ts                  # AMM calculations
├── index.css                    # Global design system
└── App.tsx                      # Router
```

---

### Component Rules

**Max file size: 500 lines.** If a component exceeds 500 lines:
1. Break it into smaller components
2. Put page-specific components in a `components/[feature]/` subdirectory
3. Put shared components in `components/ui/`

**Component naming:** PascalCase for component names, matching file names.

**Example of split:**
```
MarketDetailPage.tsx (400 lines, main container)
├── components/MarketDetail_LeftPanel.tsx (trading/proposals)
├── components/MarketDetail_RightPanel.tsx (position info)
└── components/MarketDetail_ActivityFeed.tsx (activity log)
```

---

### Search Before Adding

**CRITICAL: Before editing ANY file, search for existing instances of what you're adding.**

Example: Before adding a "PROPOSE" button:
1. Search the entire file for `"PROPOSE"`
2. If it exists, modify that instance — don't add a second one
3. Use grep: `grep -r "PROPOSE" src/pages/MarketDetailPage.tsx`
4. After editing, verify exactly ONE instance exists

---

## 5. Page Layout Pattern

Every page follows this consistent structure:

```tsx
export default function MyPage() {
  // State
  const { data } = useHook();

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-terminal)", color: "var(--text)" }}>
      {/* CRT Effects (INDEX PAGE ONLY) */}
      <div className="crt-scanlines" />
      <div className="crt-vignette" />

      {/* Header — consistent across all pages */}
      <header style={{
        borderBottom: "1px solid var(--border-panel)",
        padding: "1rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "var(--bg-panel)",
      }}>
        <h1>PAGE TITLE</h1>
        {/* Right-side controls (wallet, create, etc.) */}
      </header>

      {/* Stats Bar (INDEX PAGE ONLY) */}
      <div style={{ /* stats bar styles */ }}>
        Market stats...
      </div>

      {/* Main Content */}
      <main style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
        {/* For detail pages: 2-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: "2rem" }}>
          {/* Left: Information, forms, trading panel */}
          <div>{/* Left column content */}</div>

          {/* Right: User position, activity, sidebar */}
          <div>{/* Right column content */}</div>
        </div>

        {/* For index/list pages: grid of cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "1rem" }}>
          {/* Market cards */}
        </div>
      </main>

      {/* Footer (all pages) */}
      <Footer />
    </div>
  );
}
```

---

## 6. Market Detail States

### State-Specific Layout Rules

When displaying a market detail page, the layout changes based on `market.state`:

| State | Left Column (60%) | Right Column (40%) |
|-------|-------------------|--------------------|
| **OPEN** | Trading panel (BUY YES/NO form) | Current user position + activity feed |
| **CLOSED** | Propose form (creator only) OR community propose button | Position summary + activity |
| **RESOLUTION_PENDING** | Proposal details + DISPUTE button (inline form below) | Position + activity |
| **DISPUTED** | Dispute details + SDVM vote panel (inline form below) | Position + activity |
| **RESOLVED** | Resolution summary + history of proposals/disputes | Position (with CLAIM button if winner) + activity |
| **INVALID** | Invalidation reason + pro-rata refund info | Position + activity |

**Key rule:** Each UI element appears **exactly once**. If a PROPOSE button exists, there's only one instance. If DISPUTE form exists, only one.

---

### MarketsIndexPage Structure (Reference)

The index page (`MarketsIndexPage.tsx`) is the REFERENCE for styling and patterns:

```tsx
// Layout structure
<div style={{ minHeight: "100dvh", background: "var(--bg-terminal)", color: "var(--text)" }}>
  // 1. CRT Effects
  <div className="crt-scanlines" />
  <div className="crt-vignette" />

  // 2. Header (with wallet button, CREATE MARKET link, $SUFFER AIRDROP button)
  <header>
    // Title: "THE ORCHESTRATOR"
    // Subtitle: "PREDICTION MARKET FOR THE FRONTIER"
    // Buttons: + CREATE MARKET | $SUFFER AIRDROP | CONNECT WALLET
  </header>

  // 3. Stats Bar
  <div>
    MARKETS: X | 24H VOLUME: X SFR | ACTIVE TRADERS: X | NETWORK: TESTNET
  </div>

  // 4. Main Content
  <main>
    // Filter tabs: [ALL, OPEN, CLOSING, NEEDS PROPOSAL, DISPUTE WINDOW, DISPUTED, RESOLVED]
    // Search box: SEARCH MARKETS...
    // Market grid: auto-fill, 380px min, 1rem gap, 200px fixed height cards
  </main>

  // 5. Footer
  <Footer />
</div>
```

This is the EXACT pattern to follow for all pages.

---

## 7. Agent Edit Protocol

Before editing ANY file in the frontend:

### Step 1: Read the entire file
```bash
# Read the full file you're about to edit
cat src/pages/MarketsIndexPage.tsx
```

### Step 2: Search for existing instances
```bash
# Search for what you're adding/changing
grep -n "PROPOSE" src/pages/MarketDetailPage.tsx
grep -n "handleDisputeClick" src/pages/MarketDetailPage.tsx
```

### Step 3: Remove old code BEFORE adding new
If the feature already exists:
- Delete the old implementation
- Then add the new one
- Do NOT create duplicates

### Step 4: After editing, grep for uniqueness
```bash
# Verify EXACTLY ONE instance exists
grep -c "PROPOSE" src/pages/MarketDetailPage.tsx
# Should return: 1
```

### Step 5: Verify file size
```bash
# Count lines
wc -l src/pages/MarketDetailPage.tsx
# If > 500 lines, flag for splitting
```

### Step 6: Styling checklist
- [ ] All styles use `var()` references (no hardcoded colors)
- [ ] No Tailwind classes (no `bg-green-500`, `p-6`, `text-lg`)
- [ ] No CSS module imports
- [ ] Font family: `"IBM Plex Mono", monospace`
- [ ] Hover effects on buttons: use `onMouseEnter`/`onMouseLeave`

### Step 7: Type safety checklist
- [ ] All imports from `market-types.ts`
- [ ] No invented enum values (e.g., `TrustTier.VERIFIED` doesn't exist — use `CANONICAL`)
- [ ] Market interface fields spell exactly as defined
- [ ] No `any` types

### Step 8: Data layer checklist
- [ ] Pages use `useMarketData()` hooks
- [ ] Never `import mockMarkets` directly in pages
- [ ] All market data flows through hooks
- [ ] Portfolio page uses `usePortfolio()`

---

## Quick Reference Checklist

### Before every edit:
- [ ] Read the ENTIRE file (don't assume what's there)
- [ ] Grep for existing instances (don't duplicate)
- [ ] Use inline styles with `var()` (not Tailwind)
- [ ] Import types from `market-types.ts` (not invented types)
- [ ] Use data hooks in pages (not transport calls in components)
- [ ] Verify file stays under 500 lines (or plan split)

### Common Mistakes to Avoid:
- ❌ Using `bg-green-500`, `p-4`, `text-lg` (Tailwind classes)
- ❌ Creating a second "PROPOSE" button when one exists
- ❌ Using `TrustTier.VERIFIED` (correct: `TrustTier.CANONICAL`)
- ❌ Hard-coding colors like `#caf5de` (use `var(--mint)`)
- ❌ Importing `mockMarkets` in a page (use `useMarketData()` hook)
- ❌ Files over 500 lines without splitting
- ❌ Adding `.css` files (everything goes in `index.css`)

---

## Design System at a Glance

| Aspect | Value |
|--------|-------|
| **Font** | `"IBM Plex Mono", monospace` |
| **Primary Color** | `var(--mint)` (#caf5de) |
| **Background** | `var(--bg-terminal)` (#020503) |
| **Panel BG** | `var(--bg-panel)` (#06110c) |
| **Borders** | `var(--border-panel)` (#2a3a33) |
| **Warning Color** | `var(--orange)` (#dd7a1f) |
| **Faction A** | `var(--tribe-a)` (#f2c94c) |
| **Faction B** | `var(--tribe-b)` (#4db8d4) |
| **Styling Method** | Inline styles with `var()` |
| **Card Padding** | `1.5rem` |
| **Button Padding** | `0.5rem 1rem` |
| **Main Gap** | `2rem` |
| **Grid Gap (cards)** | `1rem` |
| **Max Width** | `1400px` |

---

## Support Matrix

| Page | Purpose | Key Hooks |
|------|---------|-----------|
| MarketsIndexPage | Browse all markets | `useAllMarkets()`, `useMarketStats()` |
| MarketDetailPage | View single market | `useMarketData(id)` |
| MarketCreatePage | Create new market | Form state only (mock submission) |
| PortfolioPage | User positions | `usePortfolio()` |

---

**Last Updated:** 2026-03-20
**Maintained by:** Architecture Team
**Questions?** Refer to the reference pages: `MarketsIndexPage.tsx` (index page), `market-types.ts` (types), `useMarketData.ts` (data layer)
