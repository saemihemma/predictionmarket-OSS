# Market Resolution Flow — Definitive User Stories

**Status:** FINAL (v1.0)
**Date:** 2026-03-19
**Audience:** Frontend engineers (implementation-ready)

> **This document is the single source of truth for all market resolution UI/UX.** Every screen, interaction, data field, and edge case is defined here. A frontend engineer should be able to implement every story without asking questions.

---

## Table of Contents

1. State Machine & Data Model
2. Filter Definitions (Index + Portfolio)
3. Market Card Badges (Visual States)
4. User Stories (US-01 through US-10)
5. Data Requirements (useMarketData Hook)
6. Edge Cases & Recovery Flows
7. Mobile Behavior
8. Open Questions & Gaps

---

## State Machine & Data Model

### Market State Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                       MARKET STATES                             │
└─────────────────────────────────────────────────────────────────┘

OPEN (trading active)
  ├─→ CLOSED (trading stopped, awaiting proposal)
  │    ├─→ RESOLUTION_PENDING (proposal submitted, dispute window open)
  │    │    ├─→ RESOLVED (dispute window closed, no disputes)
  │    │    └─→ DISPUTED (dispute filed, moving to SDVM)
  │    │         ├─→ SDVM_COMMIT (commit phase)
  │    │         ├─→ SDVM_REVEAL (reveal phase)
  │    │         ├─→ SDVM_TALLY (tallying votes)
  │    │         └─→ RESOLVED (votes counted, outcome finalized)
  │    │
  │    └─→ INVALID (no proposal in 72h OR dispute upheld to INVALID)
  │
  └─→ (if market expires without closing) [edge case, shouldn't happen]

Key timing rules:
- Creator can propose: T=close_time to T=close_time+24h (CLOSED state)
- Community can propose: T=close_time+24h to T=close_time+72h (CLOSED state)
- Dispute window: opens when market → RESOLUTION_PENDING, lasts 24h
- If no proposal by T=close_time+72h: market → INVALID automatically
```

### Data Model (useMarketData Hook Output)

The following fields must be provided by the data layer for each market:

```typescript
interface MarketData {
  // Identity
  id: string
  title: string
  description: string
  creatorAddress: string
  marketType: "CATEGORICAL" | "RANGE"

  // Timing
  createdAtMs: u64
  closeTimeMs: u64
  disputeWindowMs: u64
  creatorPriorityWindowMs: u64 // = 24h
  resolveDeadlineMs: u64 // = 72h after close

  // State
  state: "OPEN" | "CLOSED" | "RESOLUTION_PENDING" | "DISPUTED" |
         "SDVM_COMMIT" | "SDVM_REVEAL" | "SDVM_TALLY" | "RESOLVED" | "INVALID"

  // Outcomes
  outcomes: Array<{
    id: u16
    label: string
    shortLabel?: string // for RANGE markets, e.g., "[0-25)"
  }>

  // Proposal (when in RESOLUTION_PENDING, DISPUTED, RESOLVED)
  resolution?: {
    proposedOutcomeId: u16
    proposer: address
    proposerType: "CREATOR" | "COMMUNITY" // distinguishes for UI
    submittedAtMs: u64
    evidenceHash: string
    note?: string
    disputeWindowEndMs: u64
    creationBondAmount: u64 // needed for community proposal reward calc
  }

  // Dispute (when state = DISPUTED)
  dispute?: {
    disputer: address
    proposedOutcomeId: u16
    reasonText: string
    filedAtMs: u64
    bondAmount: u64
  }

  // SDVM Phase (when in SDVM_*)
  sdvm?: {
    phase: "COMMIT" | "REVEAL" | "TALLY"
    phaseStartMs: u64
    phaseEndMs: u64
    commitDeadlineMs: u64
    revealDeadlineMs: u64
    talliedOutcome?: u16 // populated in TALLY or after
    participantCount: u64
    totalStakeParticipating: u64
    userVote?: {
      outcome: u16
      isRevealed: boolean
    }
  }

  // Financial
  trustTier: u8 // 1-5, determines bond amounts
  creationBondAmount: u64

  // User's position (if user owns this market or has a position)
  userPosition?: {
    shares: Record<u16, u64> // outcome_id → share_count
    totalValue: u64
    pnl: i64 // signed int, can be negative
    unrealizedPnL: i64
    realizedPnL: i64
    hasWon: boolean
    isClaimed: boolean
  }

  // Volume & stats (for creator reputation, optional)
  creatorStats?: {
    marketsCreated: u64
    marketsResolved: u64
    marketsAbandoned: u64
    resolutionRate: f64 // 0.0-1.0
  }
}
```

---

## Filter Definitions

### Market Index Filters

| Filter | Condition | Badge (shown on card) | Use Case |
|--------|-----------|----------------------|----------|
| **ALL** | No filter | None | Browse everything |
| **OPEN** | `state === "OPEN"` | None (default) | Active trading |
| **CLOSING** | `state === "OPEN" && (closeTimeMs - now) < 12h` | "CLOSING" (orange) | Markets closing soon |
| **NEEDS PROPOSAL** | `state === "CLOSED"` AND no resolution yet | "NEEDS PROPOSAL" (orange) | Markets awaiting resolution |
| **PROPOSAL PENDING** | `state === "RESOLUTION_PENDING"` | "PENDING" (mint) | Resolutions submitted, dispute window open |
| **DISPUTED** | `state === "DISPUTED"` OR `state in [SDVM_COMMIT, SDVM_REVEAL, SDVM_TALLY]` | "DISPUTED" (yellow) | Disputes in progress |
| **RESOLVED** | `state === "RESOLVED"` OR `state === "INVALID"` | "RESOLVED" (mint) | Final outcomes |

### Portfolio Filters

| Filter | Condition | Shows |
|--------|-----------|-------|
| **ALL** | No filter | All positions (open, claimable, history) |
| **OPEN** | `state === "OPEN"` AND user has shares | Active positions in trading markets |
| **ACTION REQUIRED** (creator only) | User is creator AND `state === "CLOSED"` AND no resolution | Markets user created that need proposals |
| **CLAIMABLE** | `state === "RESOLVED"` AND user won AND not yet claimed | Winning positions ready to claim |
| **HISTORY** | `state === "RESOLVED"` OR claimed | Past positions (won, lost, or claimed) |

---

## Market Card Badges (Visual States)

Shown in top-right corner of market card on index.

| State | Badge | Color | Meaning |
|-------|-------|-------|---------|
| OPEN (< 12h to close) | "CLOSING" | Orange | Urgent |
| OPEN (≥ 12h to close) | None | — | Default/normal |
| CLOSED (no proposal) | "NEEDS PROPOSAL" | Orange | Urgent — community action needed |
| RESOLUTION_PENDING | "PENDING" | Mint/teal | Progressing — waiting for finalization |
| DISPUTED | "DISPUTED" | Yellow | In active SDVM voting |
| SDVM_COMMIT/REVEAL/TALLY | "DISPUTED" | Yellow | (same as DISPUTED) |
| RESOLVED or INVALID | "RESOLVED" | Mint/teal | Final state |

---

## User Stories

---

### US-01: Discover Markets Needing Proposals

**As:** Any user (typically community members seeking rewards)
**When:** Markets close without creator proposals
**I want to:** Filter and view markets that need resolution proposals
**So that:** I can step in, propose the outcome, and earn a reward

#### Acceptance Criteria

- [ ] AC-1: Market index has a "NEEDS PROPOSAL" filter on the filter bar
- [ ] AC-2: Filter shows ONLY markets with `state === "CLOSED"` AND no resolution record yet
- [ ] AC-3: Card shows "NEEDS PROPOSAL" badge (orange) in top-right
- [ ] AC-4: Card displays countdown timer: "Community can propose in X minutes" (shows time left in creator's 24h priority window)
- [ ] AC-5: After 24h passes, countdown vanishes and card shows proposal form or link to propose
- [ ] AC-6: Clicking a market card navigates to market detail page
- [ ] AC-7: Zero results state: "No markets need proposals right now. Check back later."

#### UI Specification

**Location:** Market index page, filter bar

**Elements:**
- Filter button "NEEDS PROPOSAL" (orange, clickable toggle)
- Card badge "NEEDS PROPOSAL" (orange tag, top-right)
- Countdown timer: "Community can propose in 14h 32m" (positioned below market title or in status row)
- Standard market card layout (image, title, outcomes, volume, badge)

**State Transitions:**
- User applies filter → index reloads showing only CLOSED markets with no resolution
- As clock passes creator priority deadline → countdown disappears, proposal form appears (see US-03)
- User clicks card → market detail page (see US-03)

**Error States:**
- Filter returns 0 results → show empty state illustration + text
- Failed to load market list → show error banner with retry button

**Mobile Behavior:**
- Filter bar scrolls horizontally (same as OPEN, CLOSING filters)
- Card layout: single-column, full width
- Countdown text scales down (smaller font)
- Countdown updates every 10 seconds (not real-time)

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be "CLOSED"
- `resolution` — must be undefined/null
- `closeTimeMs` — to calculate creator priority deadline
- `creatorPriorityWindowMs` — constant (24h = 86,400,000 ms)
- Derived: `creatorPriorityDeadlineMs = closeTimeMs + 24h`
- Derived: `timeUntilCommunityCanPropose = max(0, creatorPriorityDeadlineMs - now)`

**Client-side derivation:** Countdown = `creatorPriorityDeadlineMs - currentTimeMs`, formatted as "Xh Ym"

#### Edge Cases

1. **Clock skew:** If user's device time is behind server, countdown may show negative. → UI should show "Community can propose now" if countdown <= 0.
2. **Market closes exactly at creator priority deadline:** First community tx wins. UI should show "Someone may be proposing..." briefly, then refresh to show proposal.
3. **No markets in NEEDS PROPOSAL state:** Show empty state. Filter still usable.
4. **High volume (100+ markets):** Paginate. Show "Load more" button or infinite scroll.

---

### US-02: Creator Proposes Outcome (Portfolio ACTION REQUIRED)

**As:** Market creator
**When:** Market closes and I'm the only one who can propose (0-24h window)
**I want to:** Submit my proposed outcome with evidence, directly from my portfolio
**So that:** The market transitions to dispute phase and can resolve

#### Acceptance Criteria

- [ ] AC-1: Portfolio "ACTION REQUIRED" section shows markets I created that need proposals (state=CLOSED, no resolution)
- [ ] AC-2: Each card in ACTION REQUIRED shows a proposal form (inline, not modal)
- [ ] AC-3: Proposal form has fields: outcome selector (dropdown), evidence text box, optional note text box
- [ ] AC-4: Evidence field accepts text (free-form or link)
- [ ] AC-5: Bond amount is displayed as read-only (informational): "You posted X SFR creation bond when you created this market. Propose to resolve."
- [ ] AC-6: Countdown timer shows: "Creator priority ends in Xh Ym. After that, anyone can propose."
- [ ] AC-7: [PROPOSE OUTCOME] button is enabled immediately (no gas preview, direct submit)
- [ ] AC-8: On success: button shows "PROPOSED ✓" (green), proposal is immediately visible in market detail page
- [ ] AC-9: On failure (tx rejected, network error): show error message and keep form intact for retry
- [ ] AC-10: After successful proposal, card moves from ACTION REQUIRED to HISTORY (or disappears from ACTION REQUIRED)

#### UI Specification

**Location:** Portfolio page, ACTION REQUIRED section (new section, appears only if user is creator of closed markets)

**Elements:**
- Section header: "ACTION REQUIRED — Markets You Created" (orange accent)
- Market cards (one per closed market needing proposal):
  - Market title + image
  - "Creator priority ends in 12h 14m" (countdown)
  - Outcome selector dropdown (all outcomes from market.outcomes array)
  - Evidence text area placeholder: "Link to source, screenshot, reasoning..."
  - Note text area (optional) placeholder: "Your resolution note (visible to traders)"
  - [PROPOSE OUTCOME] button (orange, enabled)
  - Status line: "On proposal, this market enters 24h dispute window."

**State Transitions:**
- User selects outcome → dropdown shows selected value
- User types evidence → field updates in real-time
- User clicks [PROPOSE OUTCOME] → button shows loading spinner
- On success → button changes to green "PROPOSED ✓", form grays out, position moves to market detail page
- On failure → error message appears above form, button re-enables for retry
- If creator priority deadline passes while form is open → warning appears ("Creator priority window has ended"), dropdown disables, button disables

**Error States:**
- No outcomes available: "This market's outcomes failed to load. Refresh page."
- Creator not authorized (shouldn't happen): "You are not the creator of this market."
- Insufficient balance (edge case): "Proposal accepted (bond already posted at creation)."
- Network error: "Proposal failed to submit. Retry?"
- Proposal bond insufficient (shouldn't happen): "Bond validation failed. Contact support."

**Mobile Behavior:**
- Form stacks vertically
- Dropdown expands full-width on tap
- Text areas expand full-width, auto-grow with text
- [PROPOSE OUTCOME] button full-width, large tap target (48px min)
- Countdown timer updates every 5 seconds

#### Data Requirements

From `useMarketData(marketId)`:
- `creatorAddress` — must match `tx_context::sender()`
- `state` — must be "CLOSED"
- `resolution` — must be undefined/null
- `outcomes` — array of outcome objects (id, label)
- `closeTimeMs` — for countdown
- `creatorPriorityWindowMs` — 24h constant
- `trustTier` — to display bond amount
- `creationBondAmount` — for display

**Client-side validation:**
- Check `creatorAddress === currentUserAddress`
- Check `state === "CLOSED"` AND `!resolution`
- Countdown: `creatorPriorityDeadlineMs = closeTimeMs + 24h`, show `max(0, deadline - now)`

#### Edge Cases

1. **Creator proposes, immediately community member tries to propose:** Creator's tx executes first (deterministic), market → RESOLUTION_PENDING. Community member's tx fails (market no longer CLOSED). → Show error: "Another proposal was submitted. View it." [link to market detail]

2. **Creator's priority window expires during form submission:** Tx still succeeds if signed before deadline, fails if signed after. → Show appropriate error.

3. **Creator proposes wrong outcome deliberately:** Community can dispute. If SDVM upholds dispute, creator's bond is at risk (though proposal is creator-proposed, not community-proposed, so creator's original bond handles dispute). → This is by design (economic defense).

4. **Creator is not the signer (multi-sig, delegated wallet):** TX context sender must be creator. If not, show: "Sign with the creator's wallet to propose."

5. **Outcome ID invalid (UI dropdown corruption):** Validation in contract prevents invalid outcomes. → Show error if somehow submitted.

---

### US-03: Community Member Proposes After 24h (Market Detail + Discovery)

**As:** Any SUFFER token holder (not the creator)
**When:** Creator's 24h priority window has expired without a proposal
**I want to:** Submit a proposal myself, post a bond, and earn a reward if correct
**So that:** The market doesn't go INVALID and I get rewarded for stepping in

#### Acceptance Criteria

- [ ] AC-1: Market detail page shows "CREATOR DID NOT PROPOSE" banner when state=CLOSED with no resolution AND creator priority deadline has passed
- [ ] AC-2: Banner displays: "The creator didn't propose within 24 hours. Anyone can propose by posting a bond equal to the creation bond (X SFR)."
- [ ] AC-3: Proposal form appears below banner with fields: outcome selector, evidence box, bond amount (read-only, showing required amount)
- [ ] AC-4: Reward calculation displays: "If your proposal is correct: your bond returned + 50% of creator's bond (Y SFR) = Z SFR total"
- [ ] AC-5: [POST BOND & PROPOSE] button is enabled only if user has sufficient SUFFER balance (>= bond amount)
- [ ] AC-6: Warning text: "If your proposal is disputed and loses, you forfeit your entire bond."
- [ ] AC-7: On successful proposal: market immediately transitions to RESOLUTION_PENDING, dispute window shown, form disappears
- [ ] AC-8: Proposer's portfolio shows: "You proposed outcome for [market title]. If correct: bond returned + 50% of creator's bond (Y SFR)."
- [ ] AC-9: On failure (insufficient bond, race condition, tx error): clear error message, form remains for retry
- [ ] AC-10: For CATEGORICAL markets: outcome dropdown shows all outcomes, proposer must select ONE
- [ ] AC-11: For RANGE markets: outcome dropdown shows bucket labels (e.g., "[0-25)", "[25-50)"), proposer selects ONE

#### UI Specification

**Location:** Market detail page, below market status panel

**Elements (if state=CLOSED, no resolution, creator priority expired):**
- **"CREATOR DID NOT PROPOSE" banner** (orange background, prominent)
  - Text: "The creator didn't propose within 24 hours. Anyone can propose by posting a bond of X SFR."
  - Warning: "After 24 hours, anyone can propose and earn a reward. If nobody proposes within 72h, market goes INVALID."

- **Proposal form:**
  - Outcome selector: "I believe the correct outcome is:" [dropdown with all outcomes]
  - Evidence field: "Source, screenshot, or reasoning" [text area, min 10 chars recommended]
  - Bond display: "BOND REQUIRED: X SFR" (read-only, styled highlight)
  - Reward display: "If correct: your bond returned + 50% of creator's bond = Y SFR" (green text, friendly)
  - Risk warning: "If disputed and overturned, you forfeit 100% of your bond."
  - Sufficient balance check: Shows green checkmark if user has >= X SFR, red X if insufficient
  - [POST BOND & PROPOSE] button (green, enabled if balance sufficient)

- **On successful proposal:**
  - Form vanishes
  - Market detail updates to show RESOLUTION_PENDING state
  - Dispute window countdown appears
  - Toast notification: "Proposal submitted! Dispute window opens for 24h."

**State Transitions:**
- Page loads, detects state=CLOSED AND no resolution AND creator priority expired → banner + form appear
- User selects outcome → dropdown updates
- User types evidence → field updates
- User clicks [POST BOND & PROPOSE] → button shows spinner
- Success: banner + form disappear, market state updates, dispute window appears
- Failure: error message shows above form, button re-enables
- Race condition (another proposer wins): "Someone else proposed while you were submitting. View the proposal." [link to refresh]

**Error States:**
- Insufficient SUFFER balance: "You need X SFR to propose. You have Y SFR. Buy more? [link to trade]"
- Network error: "Proposal submission failed. Retry?"
- Market already has a proposal (race condition): "Another proposal was submitted while yours was pending. View it."
- Invalid outcome selected: "Please select a valid outcome."

**Mobile Behavior:**
- Form stacks vertically
- Dropdown full-width
- Bond and reward displays as side-by-side info cards (or stacked if narrow)
- [POST BOND & PROPOSE] button full-width, 48px min height
- Evidence field auto-expands with text

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be "CLOSED"
- `resolution` — must be undefined
- `closeTimeMs` — for deadline check
- `creatorPriorityWindowMs` — 24h constant
- `outcomes` — array of outcomes with labels
- `creationBondAmount` — displayed and used for bond calculation
- `trustTier` — may factor into bond calculation (though bond = creation bond)
- Derived: `creatorPriorityDeadlineMs = closeTimeMs + 24h`
- Derived: `canCommunityPropose = now >= creatorPriorityDeadlineMs`
- Derived: `rewardAmount = creationBondAmount / 2` (50% of creator bond)

**Client-side validation:**
- Check `currentTime >= creatorPriorityDeadlineMs` (with server time sync)
- Check `userBalance >= creationBondAmount`
- Derive reward: `creationBondAmount * 0.5`
- For CATEGORICAL: all outcomes valid
- For RANGE: validate outcome is a valid bucket

**User balance check:** Must call user's SUFFER balance from wallet. E.g., `useWalletBalance(userAddress, "SUFFER")`

#### Edge Cases

1. **Two people submit proposals simultaneously (T+24h):**
   - First tx (in-block order) succeeds, market → RESOLUTION_PENDING
   - Second tx fails (market no longer CLOSED)
   - UI for second proposer: Error toast "Someone else proposed first. View it." [link to refresh]

2. **Creator proposes at T+23h59m, community tries at T+24h01m:**
   - Creator's tx executes first, market → RESOLUTION_PENDING
   - Community member's tx fails (market not CLOSED)
   - UI: Error "Another proposal was submitted. View it."

3. **User submits proposal with insufficient bond:**
   - Validation in form (client-side) disables button if balance < bond
   - Contract rejects if tx includes insufficient coin
   - Error: "Bond amount insufficient. You have X SFR, need Y SFR."

4. **Categorical market with outcome count > 100:**
   - Dropdown should be searchable or paginated
   - Or display as: first 20 outcomes, search box, "Show more"

5. **Range market with many buckets:**
   - Similar: show first 20, search, "Show more"

6. **Proposal bond = creation bond, but creation bond was never posted (impossible state):**
   - Should never happen (contract enforces bond at creation)
   - If it does: show error "Market configuration error. Contact support."

7. **User proposes, then market gets disputed before they see the proposal:**
   - Market immediately moves to DISPUTED state
   - Their proposal is still valid; dispute is the response
   - UI should reflect this: show proposal + dispute panel side-by-side

---

### US-04: View Pending Proposal (Market Detail — RESOLUTION_PENDING State)

**As:** Any user viewing a market
**When:** Market is in RESOLUTION_PENDING state (proposal submitted, dispute window open)
**I want to:** See the proposed outcome, evidence, and how long the dispute window remains
**So that:** I can decide whether to dispute or wait for resolution

#### Acceptance Criteria

- [ ] AC-1: Market detail page shows "RESOLUTION PENDING" state panel
- [ ] AC-2: Panel displays: proposed outcome label, proposer address (shortened), submission time, evidence summary
- [ ] AC-3: Dispute window countdown: "Dispute window closes in Xh Ym" (updates every few seconds)
- [ ] AC-4: If window < 1h remaining, countdown text turns orange (urgent)
- [ ] AC-5: Proposer type is indicated: "Proposed by creator" OR "Proposed by community member"
- [ ] AC-6: For community proposals, reward info shows: "If not disputed: proposer receives bond back + 50% of creator's bond (Y SFR)"
- [ ] AC-7: If user has a position in this market, their position panel shows: outcome they bet on, shares, potential payout
- [ ] AC-8: [DISPUTE THIS OUTCOME] button is visible and clickable (opens dispute form)
- [ ] AC-9: User can click on proposer address to see proposer's profile (or copy address)
- [ ] AC-10: Market card on index shows "PENDING" badge (mint color)
- [ ] AC-11: If dispute window expires with no dispute, state automatically transitions to RESOLVED (or shows finalization message)

#### UI Specification

**Location:** Market detail page, right panel (status column)

**Elements:**
- **Status header:** "RESOLUTION PENDING" (mint background)
- **Proposed outcome box:**
  - Outcome label (large, centered)
  - Proposer info: "Proposed by [TYPE]: 0xabc...def" (truncated address, clickable)
  - Submission time: "Proposed 2h 14m ago"
  - Evidence summary: "Source: [first 100 chars of evidence]" [expand link]
  - Reward info (if community proposal): "If correct: bond returned + 50% of creator's bond (Y SFR)"

- **Dispute window countdown:**
  - "Dispute window closes in 12h 14m" (large, updates every 10 seconds)
  - Progress bar showing time elapsed / total dispute window (optional, nice-to-have)
  - If < 1h: text turns orange, label says "CLOSING SOON"

- **Action buttons:**
  - [DISPUTE THIS OUTCOME] button (orange, full-width)
  - Tooltip: "File a dispute if you believe this outcome is wrong."

- **Your position (if applicable):**
  - "YOUR POSITION: 300 YES shares"
  - "Payout if correct: 150 SFR"
  - "Payout if wrong: 0 SFR"

**State Transitions:**
- Page loads, detects state=RESOLUTION_PENDING → status panel renders
- Countdown updates in real-time (every 10s)
- User clicks [DISPUTE] → dispute form expands (see US-05)
- Dispute window expires → state auto-transitions to RESOLVED (or shows finalization banner)
- Dispute is filed → state changes to DISPUTED, countdown stops, vote phase begins

**Error States:**
- Evidence hash provided but evidence unavailable: "Evidence not available"
- Proposer address invalid: "Proposer information unavailable"
- Proposal data corrupted: "Proposal data error. Refresh page."

**Mobile Behavior:**
- Status panel full-width
- Outcome label smaller font
- Countdown prominent (large, bold)
- [DISPUTE] button full-width
- Evidence summary truncated to 2 lines, expand on tap

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be "RESOLUTION_PENDING"
- `resolution` — must be populated:
  - `proposedOutcomeId`
  - `proposer` — proposer address
  - `proposerType` — "CREATOR" or "COMMUNITY"
  - `submittedAtMs`
  - `evidenceHash`
  - `note` — optional note text
  - `disputeWindowEndMs`
  - `creationBondAmount`
- `outcomes` — to look up outcome label by ID
- `userPosition` — if user has a position

**Client-side derivation:**
- Countdown: `disputeWindowEndMs - now`, formatted as "Xh Ym"
- Proposer display: format address as "0x" + first 6 + "..." + last 4 (e.g., "0xabc...def")
- Reward amount: `creationBondAmount * 0.5` (if proposer is community)
- Submission time: `now - submittedAtMs`, formatted as "Xh Ym ago"

#### Edge Cases

1. **Clock skew:** If countdown goes negative, show "Dispute window closed" and disable [DISPUTE] button.
2. **No resolution record found:** Show error banner "Resolution data not found. Refresh page."
3. **Proposer address invalid or blacklisted:** Show "Proposer: [address unavailable]"
4. **User is the proposer:** Highlight their own proposal differently (lighter background, "Your proposal" label)
5. **Market has no evidence (edge case):** Evidence summary shows "None provided"
6. **Outcome label is very long:** Truncate or word-wrap in outcome box
7. **Extremely short dispute window (e.g., 1 minute left):** Show urgent orange color immediately, countdown very prominent

---

### US-05: Dispute a Proposal (Market Detail — Dispute Form)

**As:** A trader who disagrees with the proposed outcome
**When:** Market is in RESOLUTION_PENDING with dispute window open
**I want to:** File a dispute with my alternative outcome
**So that:** The community votes on the correct resolution via SDVM

#### Acceptance Criteria

- [ ] AC-1: [DISPUTE THIS OUTCOME] button on market detail opens a dispute form (inline panel, not modal)
- [ ] AC-2: Form has fields: alternative outcome selector (dropdown with all outcomes including INVALID), reason text area
- [ ] AC-3: Dispute bond amount displayed: "DISPUTE BOND: X SFR (determined by market trust tier)" (read-only)
- [ ] AC-4: Warning text: "If your dispute is rejected by SDVM voting, you lose 75% of your bond."
- [ ] AC-5: If user has insufficient SUFFER balance: button disabled, show "You need X SFR to dispute. You have Y SFR."
- [ ] AC-6: Reason field required (min 20 chars recommended, but enforced on contract side)
- [ ] AC-7: [FILE DISPUTE] button enabled only if: user has outcome selected AND reason entered AND sufficient balance
- [ ] AC-8: On successful dispute: form closes, market state changes to DISPUTED, SDVM phase begins, countdown timer shows voting phases
- [ ] AC-9: On failure (network error, insufficient bond): error message, form remains for retry
- [ ] AC-10: Disputer's portfolio shows: "You disputed [market]. SDVM voting in progress." (in a new "DISPUTE VOTING" tab)
- [ ] AC-11: For CATEGORICAL markets: outcome dropdown shows all defined outcomes + INVALID option
- [ ] AC-12: For RANGE markets: outcome dropdown shows all buckets + INVALID option

#### UI Specification

**Location:** Market detail page, below RESOLUTION_PENDING status panel (or as overlay panel)

**Elements:**
- **Dispute form header:** "File a Dispute" (orange background)
- **Outcome selector:** "I believe the correct outcome is:" [dropdown showing all outcomes + "INVALID"]
- **Reason text area:** "Why is the proposed outcome wrong?" [min-height 80px]
  - Placeholder: "Evidence, logic, calculation error, etc."
- **Bond display:** "DISPUTE BOND: X SFR (trust tier Y)" (read-only, highlighted)
- **Risk warning:** "If your dispute is rejected by SDVM voting, you lose 75% of your bond." (red text)
- **Balance check:** Icon + "You have Y SFR" (green checkmark if Y >= X, red X if Y < X)
- **[FILE DISPUTE] button** (orange, enabled only if outcome selected AND reason entered AND balance sufficient)
- **[CANCEL] button** (secondary, closes form)

**State Transitions:**
- User clicks [DISPUTE THIS OUTCOME] → form appears, outcome dropdown defaults to first non-proposed outcome
- User selects outcome → dropdown shows selection
- User types reason → field updates, button enables if other conditions met
- User clicks [FILE DISPUTE] → button shows spinner
- Success: form closes, market state updates to DISPUTED, SDVM phase begins
- Failure: error message appears in form, button re-enables
- User clicks [CANCEL] → form closes, no action taken

**Error States:**
- Insufficient SUFFER balance: "You need X SFR to dispute. [Trade SUFFER]" [link]
- Network error: "Dispute submission failed. Retry?"
- Market no longer in RESOLUTION_PENDING: "Dispute window has closed or market state changed."
- Dispute window expired: "Dispute window has closed." Button disabled.
- Invalid outcome selected: "Select a valid outcome."
- Reason too short: "Reason must be at least 20 characters."

**Mobile Behavior:**
- Form stacks vertically, full-width
- Dropdown full-width
- Reason text area full-width, min 80px, auto-expand
- [FILE DISPUTE] and [CANCEL] buttons both full-width, stacked vertically
- Bond and balance info side-by-side or stacked

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be "RESOLUTION_PENDING"
- `resolution` — must be populated
- `outcomes` — all outcomes (to populate dropdown)
- `trustTier` — to derive dispute bond amount
- `resolution.proposedOutcomeId` — to pre-select alternative outcomes in dropdown
- Derived: `disputeBond = calculateDisputeBond(trustTier)` (formula from pm_rules)

**User balance check:** `useWalletBalance(userAddress, "SUFFER")`

**On-chain calculation:** Dispute bond is stored in `pm_rules` by trust tier. Frontend should call or cache this:
```typescript
const disputeBondByTier = {
  1: 1000,  // tier 1 = 1000 SFR
  2: 2000,
  3: 5000,
  4: 10000,
  5: 20000,
}
```

#### Edge Cases

1. **Disputer and original proposer are the same person:** Allow (paradoxical, but possible if proposer changed their mind). Tx will succeed, SDVM will vote.

2. **Disputer proposes INVALID as outcome:**
   - This is valid. If SDVM upholds, market → INVALID, traders get refunds.
   - Handle in contract, UI accepts it.

3. **Multiple disputes filed simultaneously (shouldn't happen — first one wins):**
   - Contract should allow only ONE active dispute per market
   - Second tx fails: "Market already has an active dispute."
   - UI: error message, form remains for retry or user tries different market

4. **Dispute bond amount very high (e.g., 20,000 SFR for tier 5):**
   - Balance check prevents submission if insufficient
   - UI should show: "You need 20,000 SFR to dispute. This is a high-trust-tier market."
   - Friendly UX: suggest trading or choosing lower-stake markets

5. **Reason field contains links or code injection:**
   - Store as plain text only (no HTML)
   - Contract should sanitize
   - Frontend: plain text area (no rich text)

6. **Dispute window expires while form is open:**
   - Form should detect state change (polling or WebSocket)
   - Show: "Dispute window has closed. This market can no longer be disputed."
   - Disable button

7. **Market has < 4 outcomes (e.g., binary YES/NO):**
   - Dropdown still shows: YES, NO, INVALID (3 options)
   - Works fine, no special handling needed

---

### US-06: Stake SUFFER to Become Voter (Portfolio DISPUTE VOTING Tab)

**As:** A SUFFER token holder
**When:** I want to participate in SDVM voting for disputed markets
**I want to:** Register my stake globally, so I can vote on any dispute
**So that:** I become eligible to vote and earn rewards for correct votes

#### Acceptance Criteria

- [ ] AC-1: Portfolio page has a "DISPUTE VOTING" tab (alongside OPEN, CLAIMABLE, HISTORY)
- [ ] AC-2: Tab shows: staking status, current stake amount, voting eligibility, list of active disputes I can vote on
- [ ] AC-3: If user has NOT staked: show staking form with SUFFER input field, warning text, [STAKE] button
- [ ] AC-4: Warning text: "You must stake SUFFER to become eligible for dispute voting. Your stake is your 'juror deposit.' It can be slashed if you vote incorrectly."
- [ ] AC-5: Staking form accepts any amount >= minimum (e.g., 100 SFR)
- [ ] AC-6: On successful stake: show "✓ Staked X SFR" + list of active disputes to vote on
- [ ] AC-7: If user HAS staked: show current stake and option to unstake (with warning: "Unstaking removes you from voting pool")
- [ ] AC-8: Active disputes list shows: market title, outcomes (proposed vs. alternative), time remaining in COMMIT phase
- [ ] AC-9: Clicking a dispute card navigates to market detail page (see US-07)
- [ ] AC-10: User balance check: [STAKE] button disabled if balance < stake amount
- [ ] AC-11: Once staked, user can vote on any dispute (per-dispute voting, not global vote)
- [ ] AC-12: Staking is GLOBAL (register once). Voting is PER-DISPUTE (vote from market detail page).

#### UI Specification

**Location:** Portfolio page, "DISPUTE VOTING" tab (new tab)

**Elements (if NOT staked):**
- **Header:** "Become a Voter" (large, prominent)
- **Info panel:** "You need to stake SUFFER tokens to become eligible for dispute voting. Your stake acts as a security deposit. The more you stake, the more weight your votes have."
- **Staking form:**
  - Label: "Stake SUFFER"
  - Input field: text box with currency indicator ($ or SFR symbol)
  - Min stake display: "Minimum: 100 SFR"
  - Balance display: "Your balance: Y SFR"
  - Warning: "You stake once, then vote on any disputed market. Incorrect votes result in slashing (1% per vote, up to 100%)."
  - [STAKE] button (green, enabled if balance sufficient)

**Elements (if staked):**
- **Header:** "Juror Status" (or "Voting Status")
- **Status card:**
  - "Current Stake: X SFR" (large, prominent)
  - "Voting Power: [calculation, e.g., 'X / total_stake = Y%']" (informational)
  - [UNSTAKE] button (secondary, shows warning on click)
  - "Active Disputes: Z" (count of disputes in COMMIT or REVEAL phase)

- **Active disputes list:**
  - For each dispute in SDVM phases:
    - Market title
    - "Proposed: [outcome label]" vs. "Alternative: [outcome label]"
    - Voting phase: "COMMIT phase ends in Xh Ym" OR "REVEAL phase ends in Xh Ym"
    - [VOTE] link (blue, navigates to market detail page)

- **Voting history (optional, nice-to-have):**
  - Past disputes user has voted on
  - Outcome, stake weight, reward/slash
  - Expandable to show details

**State Transitions:**
- User enters stake amount → [STAKE] button enables
- User clicks [STAKE] → button shows spinner
- Success: form vanishes, staking status appears, list of active disputes loads
- Failure: error message, form remains
- User clicks [UNSTAKE] → warning modal "Unstaking removes you from the voting pool. Proceed?" [YES/CANCEL]
- On UNSTAKE success: staking form reappears

**Error States:**
- Insufficient balance: "[STAKE] button disabled, message 'You need X SFR. You have Y SFR. [Trade SUFFER]'"
- Network error staking: "Stake submission failed. Retry?"
- Already staked: "You are already staked with X SFR."
- Invalid stake amount (< 100): "Minimum stake is 100 SFR."
- No active disputes: "No disputes currently open for voting."

**Mobile Behavior:**
- Tab content full-width
- Input field full-width
- Buttons full-width
- Disputes list single-column
- Dispute cards show condensed info (title, phase, time, [VOTE] button)

#### Data Requirements

From `useMarketData()` for active disputes:
- `id`, `title`
- `state` — must be SDVM_COMMIT, SDVM_REVEAL, or SDVM_TALLY
- `dispute` — populated with disputer, alternative outcome
- `resolution` — populated with proposed outcome
- `sdvm` — populated:
  - `phase` — "COMMIT", "REVEAL", or "TALLY"
  - `phaseEndMs` — countdown calculation
  - `userVote` — if user has already voted (null if not)

**User staking status:**
- `userStakeAmount: u64` — total staked by user (or 0 if not staked)
- `totalStakeInPool: u64` — global staking pool sum (for voting power calculation)

**Derived:**
- `votingPower = userStakeAmount / totalStakeInPool` (as percentage)
- `isEligibleToVote = userStakeAmount > 0`

#### Edge Cases

1. **User has staked, then wallet balance drops below stake:** UI shows warning "Your balance is now less than your stake. Your voting power may be reduced." (Shouldn't affect on-chain voting, but good UX.)

2. **User unstakes while active disputes exist:** Allow unstaking. User can no longer vote on new disputes, but already-cast votes remain.

3. **User stakes during REVEAL phase:** They can only vote on NEW disputes that enter COMMIT phase after their stake. Current REVEAL-phase disputes are closed to new voters. → Show "You can vote on disputes in COMMIT phase."

4. **Zero active disputes:** Show "No disputes currently open for voting. Check back when disputes are filed." Empty state.

5. **Very high stake amount (e.g., 1M SFR):** Accept it. Voting power calculation handles large numbers.

6. **Staking requires a wallet signature:** Use existing wallet connection. Error if not connected: "Please connect your wallet to stake."

7. **Minimum stake is 100 SFR but user only has 50 SFR:** Disable [STAKE] button, show "You need 100 SFR minimum. You have 50 SFR."

---

### US-07: Commit Vote on Dispute (Market Detail — SDVM COMMIT Phase)

**As:** A staked SUFFER voter
**When:** A market is disputed and in SDVM COMMIT phase
**I want to:** Commit my vote to an outcome (salted hash, not revealed yet)
**So that:** I register my vote while keeping the outcome secret

#### Acceptance Criteria

- [ ] AC-1: Market detail shows "SDVM VOTING IN PROGRESS" panel when state=DISPUTED or in SDVM_* phases
- [ ] AC-2: COMMIT phase shows: "VOTE COMMIT PHASE" with outcome selector, salt generation, recovery phrase
- [ ] AC-3: User selects outcome from dropdown (proposer's outcome vs. disputer's outcome + INVALID)
- [ ] AC-4: System generates a random salt/phrase (24-word, user-friendly)
- [ ] AC-5: Phrase is displayed in a copyable text box with [COPY] button
- [ ] AC-6: Warning: "Save this phrase somewhere safe. You'll need it to reveal your vote in 12 hours."
- [ ] AC-7: Checkbox: "I have saved my recovery phrase" (required before button enables)
- [ ] AC-8: [COMMIT VOTE] button enabled only if: outcome selected AND checkbox checked AND phrase saved (user should copy)
- [ ] AC-9: On successful commit: show "✓ Vote committed" + countdown to REVEAL phase ("Reveal phase starts in Xh Ym")
- [ ] AC-10: Voting power displayed: "Your voting weight: X SFR" (from user's global stake)
- [ ] AC-11: On failure (network error, already voted): clear error message, form remains for retry
- [ ] AC-12: Phrase is stored in browser localStorage (for auto-recovery in REVEAL phase)

#### UI Specification

**Location:** Market detail page, SDVM voting panel (right column or below resolution panel)

**Elements (COMMIT phase):**
- **Header:** "SDVM VOTING — COMMIT PHASE" (yellow background, "DISPUTED" badge)
- **Phase info:** "Commit phase ends in 12h 14m" (countdown, updates every 10s)
- **Outcome selector:** "I vote for:" [dropdown with outcomes + "INVALID"]
  - Proposer outcome shown first (e.g., "YES (proposed by creator)")
  - Disputer outcome shown second (e.g., "NO (proposed by disputer)")
  - INVALID option at bottom

- **Recovery phrase section:**
  - Label: "Your recovery phrase (save this!)"
  - Phrase display: 24 words in monospace font, background highlight (light gray)
  - [COPY] button (copies phrase to clipboard)
  - [REGENERATE] button (generates new salt/phrase if user wants different random)

- **Checkbox:** "☐ I have saved my recovery phrase" (required)
  - Tooltip: "You'll need this phrase to reveal your vote."

- **Voting power display:** "Your voting weight: X SFR" (info only, styled box)

- **[COMMIT VOTE] button** (green, enabled only if outcome selected AND checkbox checked)
- **[CANCEL] button** (secondary, clears form)

**State Transitions:**
- Page loads, market in SDVM_COMMIT phase → COMMIT form renders
- User selects outcome → dropdown updates, phrase remains visible
- User clicks [COPY] → toast "Phrase copied to clipboard"
- User clicks [REGENERATE] → new phrase generated
- User checks checkbox → [COMMIT VOTE] button enables
- User clicks [COMMIT VOTE] → button shows spinner, tx submitted
- Success: form grays out, message "Vote committed! Reveal phase starts in Xh Ym."
- Failure: error message appears, button re-enables
- COMMIT phase expires (clock reaches phaseEndMs): form disables, "COMMIT phase ended. Reveal phase begins." message appears

**Error States:**
- Phrase not copied: "Please save your recovery phrase before committing."
- No outcome selected: "[COMMIT VOTE] disabled, tooltip 'Select an outcome'"
- Already voted: "You have already voted in this dispute."
- COMMIT phase expired: "COMMIT phase has ended. Reveal phase is active."
- Network error: "Vote commit failed. Retry?"
- User not staked: "You must stake SUFFER to vote. Go to Portfolio > Dispute Voting."

**Mobile Behavior:**
- Form stacks vertically
- Outcome dropdown full-width
- Phrase display: 24 words on mobile may wrap. Consider: smaller font, or 2-column layout (12 words per column)
- [COPY] button inline with phrase display (right side) or below
- Checkbox and label full-width
- [COMMIT VOTE] full-width, 48px min height
- Countdown timer very prominent (large font)

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be DISPUTED or SDVM_COMMIT
- `sdvm` — populated:
  - `phase` — "COMMIT"
  - `phaseEndMs` — for countdown
  - `userVote` — null (if not yet voted) or populated (if already voted)
- `resolution` — proposed outcome ID and label
- `dispute` — alternative outcome ID and label
- `outcomes` — all outcomes (for dropdown)
- Derived: `userStakeAmount` — from user staking record

**Client-side:**
- Generate random salt (32 bytes, hex-encoded) + phrase (BIP39-style 24-word mnemonic)
- Store both in localStorage: `key = "vote_commitment_${marketId}"`, `value = {salt, phrase, timestamp}`
- Derive commitment hash: `hash(selectedOutcome, salt)` (Keccak256 or SHA3)
- Display phrase (never the salt)
- On commit, send to contract: `{marketId, commitmentHash, userAddress, votingWeight}`
- Phrase stored in browser for auto-load in REVEAL phase

#### Edge Cases

1. **User regenerates phrase multiple times:** Each regeneration creates a new salt. Only the LAST generated salt should be submitted. → Store only the latest salt in localStorage.

2. **User commits with one phrase, then clears localStorage:** User loses the phrase. → On REVEAL phase, show "Phrase not found. You cannot reveal your vote." + fallback: allow manual phrase entry (paste recovered phrase).

3. **User votes, then browser crashes before localStorage saves:** Phrase lost. → On reload, show "Vote committed, but phrase not found in browser. Paste your saved phrase to reveal later."

4. **User has no voting stake but tries to commit:** Contract check: `user_stake > 0`. Fail with "You are not staked. Stake SUFFER first."

5. **COMMIT phase ends while form is open:** Form detects phase change (polling or WebSocket). Disable form, show "COMMIT phase ended. REVEAL phase now active." [link to REVEAL form]

6. **User commits a vote, then dispute is somehow retracted (edge case):** Market state should not revert from DISPUTED. But if it does: show "This dispute is no longer active."

7. **Salt collision (two votes with same salt):** Cryptographically negligible. System accepts both (different votes, different users).

8. **User bookmarks the phrase, then types it in REVEAL phase:** Phrase is human-readable, so this works. Derive salt from phrase (BIP39 seed). Good UX.

---

### US-08: Reveal Vote (Market Detail — SDVM REVEAL Phase)

**As:** A voter who committed a vote
**When:** Market moves to SDVM REVEAL phase (12h later)
**I want to:** Reveal my actual vote outcome, which is then tallied
**So that:** My vote is counted and I can earn/lose based on correctness

#### Acceptance Criteria

- [ ] AC-1: Market detail automatically transitions to "SDVM VOTING — REVEAL PHASE" when clock reaches REVEAL phase
- [ ] AC-2: Form shows: recovery phrase input field, [AUTO-FILL FROM BROWSER] button, submit button
- [ ] AC-3: [AUTO-FILL] attempts to load phrase from localStorage. If found, auto-populates phrase field and derives salt
- [ ] AC-4: User can manually paste phrase if not auto-filled
- [ ] AC-5: Phrase validation: must be exactly 24 words, space-separated, valid BIP39 words (or custom word list)
- [ ] AC-6: If phrase is valid: show derived outcome, [REVEAL VOTE] button enables
- [ ] AC-7: Warning: "If you don't reveal within Xh, you'll be slashed 1% of your stake per hour (up to 100% if reveal is >100h late)."
- [ ] AC-8: On successful reveal: show "Vote revealed: [outcome label]" + countdown to TALLY phase
- [ ] AC-9: On failure (invalid phrase, network error, already revealed): clear error, form remains for retry
- [ ] AC-10: REVEAL phase countdown: "Reveal phase ends in Xh Ym"
- [ ] AC-11: If user didn't commit (no phrase in browser), show "No vote found. Did you commit a vote in COMMIT phase?" [link to portfolio DISPUTE VOTING]
- [ ] AC-12: If user reveals after deadline but before TALLY: vote still counts, but user is slashed for lateness

#### UI Specification

**Location:** Market detail page, SDVM voting panel (same location as COMMIT)

**Elements (REVEAL phase):**
- **Header:** "SDVM VOTING — REVEAL PHASE" (yellow background)
- **Phase info:** "Reveal phase ends in 11h 59m" (countdown, large, prominent)

- **Phrase input section:**
  - Label: "Recovery phrase (from COMMIT phase)"
  - Textarea: placeholder "Paste your 24-word phrase here..."
  - [AUTO-FILL FROM BROWSER] button (blue, top-right of textarea)

- **Validation display (after phrase entered):**
  - If valid: ✓ "Phrase is valid. Your vote: [outcome label]" (green text)
  - If invalid: ✗ "Phrase is invalid. Check spelling." (red text)

- **Outcome display (after validation):**
  - "Your vote: [outcome label]" (large, centered, in colored box matching outcome)

- **Slash warning (if reveal deadline approaching):**
  - If time remaining < 1h: "⚠ Reveal deadline approaching! After Xm, you'll be slashed 1% per hour."
  - If time remaining < 15m: ⚠ text turns red/orange, "URGENT"

- **[REVEAL VOTE] button** (green, enabled only if phrase valid)
- **[CANCEL] button** (secondary)

**State Transitions:**
- Page loads, market in SDVM_REVEAL phase → REVEAL form renders
- [AUTO-FILL] clicked → attempts to load from localStorage, populates textarea if found
- User pastes phrase → validation runs in real-time (as they type or on blur)
- Phrase becomes valid → outcome displays, [REVEAL VOTE] enables
- User clicks [REVEAL VOTE] → button shows spinner, tx submitted
- Success: form grays out, message "Vote revealed! [outcome label]" + countdown to TALLY
- Failure: error message, button re-enables
- REVEAL deadline approaches (< 1h): warning appears and updates countdown
- REVEAL deadline passes: form disables, "Reveal deadline passed. You may be slashed for late reveal." message

**Error States:**
- Phrase invalid (not 24 words, misspelled): "Phrase is invalid. Check spelling. (Did you copy it exactly?)"
- Phrase not found in browser: "[AUTO-FILL] button shows 'Not found in browser storage'. User must paste manually."
- Already revealed: "You have already revealed your vote."
- REVEAL phase expired: "Reveal deadline has passed. Your vote may be slashed for late reveal."
- Network error: "Reveal submission failed. Retry?"
- Invalid outcome derived from phrase: "Phrase does not match any valid outcome for this dispute."

**Mobile Behavior:**
- Form stacks vertically
- Textarea full-width, min 100px height
- [AUTO-FILL] button inline with label or below textarea
- Outcome display box full-width
- [REVEAL VOTE] full-width, 48px min height
- Countdown timer prominent (large font, bold)

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be SDVM_REVEAL
- `sdvm` — populated:
  - `phase` — "REVEAL"
  - `phaseEndMs` — for countdown and slash calculation
  - `userVote` — updated to show `{outcome, isRevealed: true}` (if already revealed)
- `outcomes` — to validate and display outcome label

**Client-side:**
- Phrase validation: check 24 words, validate against BIP39 word list (or custom word list)
- Salt derivation: `salt = SHA256(phrase)` (or deterministic derivation per contract spec)
- Outcome parsing: phrase must encode exactly which outcome (1-N)
- On reveal, send to contract: `{marketId, outcome, salt, userAddress}`
- Contract verifies: `hash(outcome, salt) == stored_commitment_hash`

#### Edge Cases

1. **User lost their phrase, no browser storage:** Manual entry required. Show: "No phrase found in browser. Paste your saved phrase (24 words)."

2. **User reveals very late (e.g., 5 days after REVEAL deadline):** Contract should still accept reveal, but apply slash based on delay. → Show warning: "Reveal is X days late. You will be slashed significantly." With slash amount calculated.

3. **User types phrase with extra spaces or newlines:** Trim and validate. Handle gracefully.

4. **Phrase is valid but doesn't match any outcome in this dispute (edge case):** Should never happen if salt was generated correctly. → Show error: "Phrase doesn't match this dispute. Are you voting in the right market?"

5. **User committed multiple times (should be impossible):** Contract prevents it. If somehow happens: show "You have already voted in this dispute."

6. **REVEAL phase ends while form is open:** Form detects phase change. Disable, show "REVEAL phase ended. Votes are being tallied."

7. **User pastes entire commitment record (salt + phrase):** Extract only the phrase part, ignore salt. Derive salt from phrase.

8. **Recovery from browser crash:** Phrase stored in localStorage survives browser restart. On reload, show [AUTO-FILL] button and it will auto-populate.

---

### US-09: Claim Winnings (Portfolio + Market Detail — Isolated Button)

**As:** A trader who bet on the winning outcome or SDVM voter who voted correctly
**When:** Market is RESOLVED
**I want to:** Claim my payout immediately with a single click
**So that:** Funds transfer to my wallet

#### Acceptance Criteria

- [ ] AC-1: In portfolio, CLAIMABLE section shows resolved markets where user won or voted correctly
- [ ] AC-2: Each claimable position card shows: market title, outcome, shares/stake, payout amount
- [ ] AC-3: [CLAIM] button is isolated (not navigating to market page), positioned prominently on the card
- [ ] AC-4: Button click immediately submits claim tx (no confirmation modal, trust the user)
- [ ] AC-5: On success: button transitions to "CLAIMED ✓ X SFR" (green background, white text)
- [ ] AC-6: Green flash animation: 2-second animation from normal → green → normal (or fade out)
- [ ] AC-7: Toast notification: "Claimed X SFR!" appears
- [ ] AC-8: Position immediately moves from CLAIMABLE tab to HISTORY tab
- [ ] AC-9: User's wallet balance updates in real-time (if balance UI connected)
- [ ] AC-10: On failure (tx rejected, network error): error toast "Claim failed. Retry?" Button remains clickable
- [ ] AC-11: Disabled state: if amount already claimed or position invalid, button shows "ALREADY CLAIMED" or is hidden
- [ ] AC-12: Also shown on market detail page: right panel shows "YOUR POSITION: X shares, PAYOUT: Y SFR" with same [CLAIM] button

#### UI Specification

**Location A: Portfolio, CLAIMABLE tab**

**Elements:**
```
┌─────────────────────────────────────────────────────────────┐
│ Oil price below $70/barrel end of Q1                        │
│ RESOLVED: YES ✓                                             │
│ ────────────────────────────────────────────────────────────│
│ SHARES: 300 YES         PAYOUT: 150 SFR                    │
│                                          [CLAIM]            │
└─────────────────────────────────────────────────────────────┘
```

- **Card layout:**
  - Title (full width, bold)
  - Status line: "RESOLVED: [outcome] ✓" (green checkmark)
  - Divider line
  - Left column: "SHARES: X [outcome]"
  - Right column: "PAYOUT: Y SFR"
  - [CLAIM] button, right-aligned or bottom-right

- **[CLAIM] button styling:**
  - Normal: green background, white text, size ~80px wide x 36px tall
  - Hover: darker green, cursor pointer
  - Disabled: gray, no cursor
  - Claimed state: "CLAIMED ✓ Y SFR" (green, slightly larger to show amount)

**Location B: Market detail, right panel (YOUR POSITION)**

**Elements:**
```
┌──────────────────────────────────┐
│ YOUR POSITION                    │
│                                  │
│ Shares: 300 YES                  │
│ Payout if [outcome]: 150 SFR     │
│                    [CLAIM]       │
└──────────────────────────────────┘
```

**State Transitions:**
- Page loads, market RESOLVED, user has winning position → card/panel shows with [CLAIM] button enabled
- User clicks [CLAIM] → button shows spinner or darkens
- Tx broadcasts → button disabled temporarily
- Success (after 1-2s):
  - Button changes to "CLAIMED ✓ 150 SFR" (or amount)
  - Background flashes green for 2 seconds
  - Card/section fades or moves to HISTORY
  - Toast: "Claimed 150 SFR!"
- Failure:
  - Button re-enables
  - Toast: "Claim failed. [Retry]" [link or button]
- User already claimed: button hidden or shows "ALREADY CLAIMED" (disabled)

**Animation (Green Flash):**
```css
@keyframes claim-success {
  0% { background-color: #22c55e; color: white; }
  50% { background-color: #16a34a; }
  100% { background-color: #22c55e; }
}
button.claimed {
  animation: claim-success 2s ease-in-out;
}
```

**Error States:**
- Network error: "Claim failed. Network error. [Retry]"
- Tx rejected: "Claim rejected. Insufficient funds? [Details]"
- Already claimed: Button hidden or "ALREADY CLAIMED" (grayed)
- Market data stale: "Position data unavailable. Refresh page."
- Insufficient to claim (shouldn't happen): "Claim amount is zero."

**Mobile Behavior:**
- Card: full-width, stacked layout
- SHARES and PAYOUT: side-by-side (or stacked on very narrow screens)
- [CLAIM] button: full-width or 60% width, right-aligned
- Green flash animation: same, no changes needed
- Toast: standard mobile toast (bottom of screen, 3-4 seconds)

#### Data Requirements

From `useMarketData(marketId)`:
- `state` — must be "RESOLVED"
- `userPosition` — populated:
  - `shares: {outcome_id: count}` — shares user holds
  - `pnl: i64` — actual P&L (can be negative for lost positions)
  - `isClaimed: boolean` — already claimed?
- Derived: `claimableAmount = calculate_payout(userPosition.shares, resolved_outcome)`
- Derived: `isWinningPosition = userPosition.pnl >= 0` (or true if in winning outcome shares)

**Calculation (on-chain):**
```
For each outcome i user has shares in:
  if market.resolved_outcome == i:
    payout += shares[i] * final_price[i]  (from AMM curve)
  else:
    payout += 0 (lost position)
```

**On claiming:**
- Send tx: `claim_winnings(market_id, user_address)`
- Contract transfers SUFFER coins to user
- Contract marks position as claimed
- Frontend polls or listens for event to confirm

#### Edge Cases

1. **User has partial winning position:** E.g., 100 YES shares, 50 NO shares, market resolves YES. Payout = YES shares * final_price. No shares in NO. → Show "SHARES: 100 YES, PAYOUT: 75 SFR" (only winning leg).

2. **User has no winning position but tries to claim:** Contract prevents. Tx fails. Show error: "No winnings to claim for this market."

3. **Market resolves to INVALID:** All traders get pro-rata refunds (not a "payout"). UI should differentiate: "REFUND: X SFR" instead of "PAYOUT: X SFR".

4. **Claim tx succeeds but gas was high:** Show success anyway. User paid gas, got their payout.

5. **User claims same position twice (double-spend):** Contract prevents (idempotent, position marked as claimed). Second tx fails. Show: "Already claimed."

6. **Button clicked multiple times rapidly:** Debounce or disable after first click. Only one claim tx should be broadcast.

7. **Market has zero resolved outcome (shouldn't happen):** If somehow resolved_outcome is invalid, contract fails claim. Show error: "Market resolution invalid. Contact support."

8. **User's balance is zero but they have a claimable position:** Claim still works. SUFFER coins transfer from market pool to user.

9. **SDVM voter claiming reward for correct vote:** Similar flow, but amount is smaller (derived from stake + vote weight + slash rate). UI shows "SDVM REWARD: X SFR" to differentiate from trader payouts.

---

### US-10: View Resolution History (Portfolio HISTORY Tab)

**As:** Any user
**When:** I want to review my past market participation
**I want to:** See all resolved, claimed, and lost positions in a HISTORY tab
**So that:** I can track my performance and dispute record

#### Acceptance Criteria

- [ ] AC-1: Portfolio has a "HISTORY" tab (alongside OPEN, ACTION REQUIRED, CLAIMABLE)
- [ ] AC-2: HISTORY shows all markets with `state === "RESOLVED"` where user participated
- [ ] AC-3: Each position card shows: market title, outcome, user's bet outcome, result (WON / LOST / REFUNDED), amount won/lost, claim status
- [ ] AC-4: Cards are sortable by: date (newest first), amount, result (wins first)
- [ ] AC-5: If user is creator and the market was disputed, show: "Creator of this market (Disputed, Upheld)" or "Creator (Disputed, Rejected)"
- [ ] AC-6: If user is disputer and disputed this market, show: "You disputed this market (Upheld / Rejected)"
- [ ] AC-7: If user is SDVM voter, show: "You voted [outcome] (Correct / Incorrect), Reward: X SFR" or "Slashed: X SFR"
- [ ] AC-8: Cards show datetime of resolution and finalization
- [ ] AC-9: Pagination or infinite scroll if > 20 items
- [ ] AC-10: Empty state: "No history yet. Participate in markets to build your history."
- [ ] AC-11: Expandable details: click card to see full evidence, dispute details (if any)

#### UI Specification

**Location:** Portfolio page, "HISTORY" tab

**Elements:**
- **Tab header:** "HISTORY"
- **Sort controls:** "Sort by: [Date ▼] [Amount ▼] [Result ▼]"
  - Date: newest first (default), oldest first
  - Amount: largest payout first, smallest first
  - Result: WON first, LOST, REFUNDED

- **Position card (trader):**
```
┌─────────────────────────────────────────────────────────────┐
│ Oil price below $70/barrel end of Q1                        │
│ Resolved: Mar 19, 2026 at 2:30 PM                          │
│ ────────────────────────────────────────────────────────────│
│ WON ✓          300 YES shares    +150 SFR                  │
│                                    [CLAIMED]               │
└─────────────────────────────────────────────────────────────┘
```

- **Position card (lost):**
```
┌─────────────────────────────────────────────────────────────┐
│ Will Bitcoin hit $100k by Q2?                              │
│ Resolved: Mar 18, 2026 at 11:00 AM                         │
│ ────────────────────────────────────────────────────────────│
│ LOST ✗         200 NO shares     -200 SFR                  │
└─────────────────────────────────────────────────────────────┘
```

- **Position card (creator + disputed):**
```
┌─────────────────────────────────────────────────────────────┐
│ Gold price trend Q1                                         │
│ Resolved: Mar 17, 2026 at 5:00 PM                          │
│ ────────────────────────────────────────────────────────────│
│ Creator (Disputed, Rejected)   Bond: +250 SFR             │
│ Your outcome (YES) WON         100 shares    +150 SFR     │
└─────────────────────────────────────────────────────────────┘
```

- **Position card (SDVM voter):**
```
┌─────────────────────────────────────────────────────────────┐
│ S&P 500 closing above 5000                                 │
│ Resolved: Mar 16, 2026 at 3:00 PM                          │
│ ────────────────────────────────────────────────────────────│
│ Voted YES (Correct) ✓          Stake: 1000 SFR           │
│ SDVM Reward: +15 SFR           Claim available             │
└─────────────────────────────────────────────────────────────┘
```

**Expandable details (on click):**
- Proposed outcome + evidence
- Dispute details (if any): disputer, alternative outcome, reason
- SDVM vote details (if participated): phase results, tallied outcome, reward/slash
- Full timeline: created → closed → proposed → [disputed → sdvm] → resolved

**State Transitions:**
- Page loads, tab HISTORY → fetches all resolved markets with user participation
- User clicks sort dropdown → index re-sorts, cards reorder
- User clicks card → expands to show details
- User clicks again → collapses details
- User scrolls to bottom → if > 20 items, [Load More] button appears

**Error States:**
- Failed to load history: "History failed to load. Refresh page."
- No history: Empty state, "No history yet. Participate in markets to build your history."

**Mobile Behavior:**
- Cards full-width, single-column
- Sort controls collapse to [≡ Sort] button (hamburger menu style)
- Card content stacks vertically
- Expand/collapse: tap card to toggle details

#### Data Requirements

From `useMarketData()` for all historical markets:
- `state` — must be "RESOLVED"
- `title`, `id`, `marketType`
- `resolvedAtMs` — finalization timestamp
- `resolution` — proposed outcome
- `dispute` — if any
- `sdvm` — if SDVM voting occurred
- `userPosition` — user's shares/stake and result
- `userRole` — "TRADER", "CREATOR", "DISPUTER", "VOTER" (can be multiple)

**Derivations:**
- `userResult = userPosition.pnl > 0 ? "WON" : userPosition.pnl < 0 ? "LOST" : "BREAK_EVEN"`
- `claimStatus = userPosition.isClaimed ? "CLAIMED" : "PENDING"`
- `creatorRole = userAddress === market.creatorAddress ? "Creator" : null`
- `disputerRole = dispute && userAddress === dispute.disputer ? "Disputer" : null`
- `voterRole = sdvm?.userVote ? "Voter" : null`

#### Edge Cases

1. **User participated in multiple roles:** E.g., creator + trader. Show both: "Creator (Disputed, Upheld) + Traded YES". Or show as separate cards with linked indicator.

2. **Market is RESOLVED but user never participated (shouldn't appear):** Filter excludes users with no position/role.

3. **Very large history (1000+ markets):** Paginate with infinite scroll or [Load More] button. Load 20 at a time.

4. **Market history shows negative payout (user lost):** Show "-150 SFR" in red.

5. **SDVM voter slashed (incorrect vote):** Show "Slashed -10 SFR" in red, separate from trader P&L.

6. **Market resolved to INVALID:** Show "REFUNDED" instead of WON/LOST, with refund amount.

7. **Sorting by amount:** Lost positions (negative) sort separately. Suggest: WON (positive) first, then LOST (negative), then REFUNDED.

---

## Edge Cases & Recovery Flows

### EC-1: Race Condition — Multiple Community Proposals (Same Time)

**Scenario:** 10 community members all submit proposals in the same block (T=24h exactly).

**Expected Behavior:**
- Only the first in block execution order succeeds (market state: CLOSED → RESOLUTION_PENDING)
- Remaining 9 fail with contract error: EMarketNotClosed (market no longer CLOSED)

**UI Recovery:**
- Successful proposer: sees success toast + market updates
- Failed proposers: see error toast "Someone else proposed first. [View proposal]" [link to market detail]
- Clicking link refreshes market detail, shows the winning proposal

**Handling:**
- Frontend should catch the specific contract error code and show friendly message
- Optionally, implement client-side jitter/delay on proposal submission to reduce race likelihood

---

### EC-2: Creator Proposes Immediately Before/After Priority Deadline

**Scenario:** Creator submits proposal at T=23h59m. Community tries to propose at T=24h01m.

**Expected Behavior:**
- Creator's tx executes first (T=23h59m), market → RESOLUTION_PENDING
- Community's tx executes second (T=24h01m), fails with EMarketNotClosed (market no longer CLOSED)

**UI Recovery:**
- Creator: success
- Community proposer: error "Another proposal was submitted. [View proposal]"

---

### EC-3: User Runs Out of Balance During Bond Submission

**Scenario:** User selects outcome and clicks [PROPOSE], but their wallet balance drops (maybe token transfer happened elsewhere) between form load and tx submit.

**Expected Behavior:**
- Client-side validation prevents this in most cases (checks balance on form load)
- If still happens: contract rejects with "EInsufficientCreationBond"

**UI Recovery:**
- Error toast: "Bond submission failed. Insufficient SUFFER balance. You have X, need Y."
- [Trade SUFFER] link (optional)
- Form remains for retry after user acquires more balance

---

### EC-4: Dispute Filed While User Is Reading Proposal

**Scenario:** User is reading RESOLUTION_PENDING market. Another user files a dispute.

**Expected Behavior:**
- Market state changes to DISPUTED
- If user has the page open, it doesn't auto-refresh (no real-time listener by default)

**UI Recovery:**
- Show banner at top: "This market's state has changed. [Refresh]"
- Or, implement polling (every 10s) to detect state changes and auto-refresh

---

### EC-5: SDVM Commit Phase Expires While User Is Typing Vote

**Scenario:** User opens COMMIT form at T=11h59m remaining. Starts typing reason. Phase expires at T=12h.

**Expected Behavior:**
- Form detects phase change (polling or event listener)
- Form disables, shows: "COMMIT phase has ended. REVEAL phase is now active."

**UI Recovery:**
- Show message: "Your vote was not submitted. Check REVEAL phase."
- If user DID submit before deadline, show success; if not, show message above

---

### EC-6: Market Resolves to INVALID (Nobody Proposed in 72h)

**Scenario:** Creator doesn't propose. Community doesn't propose. T >= 72h passes. Market → INVALID.

**Expected Behavior:**
- Market state transitions to INVALID
- All traders get pro-rata refunds of their SUFFER
- Creator's bond is slashed

**UI Recovery:**
- Market card shows "INVALID" badge (mint, same as RESOLVED)
- Market detail shows: "This market expired without a proposal. Refunds available."
- Trader position shows: "REFUNDED: X SFR" instead of "LOST" or "WON"
- [CLAIM REFUND] button (same as [CLAIM] but for refunds)

---

### EC-7: User Loses Recovery Phrase Before REVEAL Phase

**Scenario:** User committed vote in COMMIT phase. Closed browser. Cleared cache. REVEAL phase begins, no phrase in localStorage.

**Expected Behavior:**
- REVEAL form shows: "No phrase found in browser."
- User can manually paste phrase if saved elsewhere
- If phrase is lost permanently: vote cannot be revealed, user is slashed 100%

**UI Recovery:**
- Show: "No phrase found. Do you have a saved backup? [Paste manually]"
- Input field for manual paste
- Warning: "If you can't recover your phrase, your vote will be forfeited and you'll be slashed."

---

### EC-8: SDVM Vote Tallied, User Voted Incorrectly

**Scenario:** TALLY phase completes. Correct outcome is X, but user voted for Y.

**Expected Behavior:**
- User's stake is slashed (1-100% depending on participation rate)
- Market resolves to outcome X
- User's portfolio shows: "SDVM Slashed: -50 SFR"

**UI Recovery:**
- Market detail shows: "SDVM votes tallied. Outcome X wins."
- User's voting record shows: "You voted Y (Incorrect). Slashed: 50 SFR."
- No reward to claim, position moves to HISTORY

---

### EC-9: Dispute Bond Insufficient at Dispute Window Close

**Scenario:** User files dispute with 5000 SFR. Dispute is correct and upheld. But before disputer receives their reward, there's a logic error and disputer receives less than expected.

**Expected Behavior:**
- This should not happen (contract logic is deterministic)
- If it does: admin/god lever step in to manually distribute rewards

**UI Recovery:**
- Show: "Dispute resolution failed. Contact support with dispute ID." [link]

---

### EC-10: Mobile User Loses Network During Claim TX

**Scenario:** User clicks [CLAIM], tx submits, but network drops before response received.

**Expected Behavior:**
- Button shows spinner, then times out
- Frontend doesn't know if tx succeeded or failed

**UI Recovery:**
- Show: "Claim status unknown. Check your transaction history or [Retry]"
- If user retries and position is already claimed: contract rejects, show "Already claimed."
- Or, implement polling on transaction hash to check status

---

## Mobile Behavior (Comprehensive)

### Breakpoints
- **Desktop:** >= 1024px
- **Tablet:** 600px - 1024px
- **Mobile:** < 600px

### General Rules
1. **Full-width buttons:** All action buttons (CLAIM, PROPOSE, DISPUTE, VOTE) are full-width on mobile
2. **Stacked layout:** Multi-column layouts stack to single column on mobile
3. **Smaller fonts:** Text scales down 80-90% on mobile (rem-based)
4. **Touch targets:** Minimum 44-48px for clickable elements (buttons, links)
5. **No hover effects:** Mobile doesn't have hover; use active/tap states instead
6. **Touchable spacing:** 8px padding minimum around interactive elements

### Specific Screens

**Market Index (Mobile):**
- Single-column card layout
- Market image: 100% width, 200px height (maintained aspect ratio)
- Badge: top-right corner, smaller font
- Title: 1-2 lines, truncate with ellipsis
- Stats (volume, traders, countdown): 1-2 lines
- No right-side panel
- Filters: horizontal scroll bar (not dropdown menu)

**Market Detail (Mobile):**
- Full-width single column
- Status panel: top, full-width
- Description: full-width
- Outcomes: full-width, single-column list (not grid)
- Proposal form: full-width, inputs stack vertically
- Buttons: full-width
- Right panel (YOUR POSITION, SDVM VOTING): moves below main content (or in tabs)

**Portfolio (Mobile):**
- Tab bar: horizontal scroll (or collapsible menu)
- Position cards: single-column, full-width
- Buttons: full-width, large tap target
- Forms: full-width, inputs stack

**Timers/Countdowns (Mobile):**
- Larger font on mobile (150% of desktop)
- Update frequency: every 10 seconds (not real-time, saves battery)
- Color change (orange/red) when critical: same as desktop

---

## Data Requirements Summary (useMarketData Hook)

### Required Fields

```typescript
interface MarketData {
  // Identity
  id: string
  title: string
  description: string
  creatorAddress: string
  marketType: "CATEGORICAL" | "RANGE"
  createdAtMs: u64

  // Timing (all in milliseconds from epoch)
  closeTimeMs: u64
  disputeWindowMs: u64
  creatorPriorityWindowMs: u64 // = 86400000 (24h)
  resolveDeadlineMs: u64 // = 72h after close

  // State
  state: StateType

  // Outcomes
  outcomes: Array<{
    id: u16
    label: string
    shortLabel?: string // for RANGE markets
  }>

  // Proposal (when applicable)
  resolution?: ResolutionRecord

  // Dispute (when applicable)
  dispute?: DisputeRecord

  // SDVM Phase (when applicable)
  sdvm?: SDVMPhaseData

  // Financial
  trustTier: u8
  creationBondAmount: u64

  // User-specific
  userPosition?: UserPositionData
  creatorStats?: CreatorStatsData
}

type StateType =
  | "OPEN"
  | "CLOSED"
  | "RESOLUTION_PENDING"
  | "DISPUTED"
  | "SDVM_COMMIT"
  | "SDVM_REVEAL"
  | "SDVM_TALLY"
  | "RESOLVED"
  | "INVALID"

interface ResolutionRecord {
  proposedOutcomeId: u16
  proposer: string
  proposerType: "CREATOR" | "COMMUNITY"
  submittedAtMs: u64
  evidenceHash: string
  note?: string
  disputeWindowEndMs: u64
  creationBondAmount: u64
}

interface DisputeRecord {
  disputer: string
  proposedOutcomeId: u16
  reasonText: string
  filedAtMs: u64
  bondAmount: u64
}

interface SDVMPhaseData {
  phase: "COMMIT" | "REVEAL" | "TALLY"
  phaseStartMs: u64
  phaseEndMs: u64
  commitDeadlineMs: u64
  revealDeadlineMs: u64
  talliedOutcome?: u16
  participantCount: u64
  totalStakeParticipating: u64
  userVote?: {
    outcome: u16
    isRevealed: boolean
    commitmentHash?: string
  }
}

interface UserPositionData {
  shares: Record<u16, u64>
  totalValue: u64
  pnl: i64
  unrealizedPnL: i64
  realizedPnL: i64
  hasWon: boolean
  isClaimed: boolean
  isRefunded?: boolean
}

interface CreatorStatsData {
  marketsCreated: u64
  marketsResolved: u64
  marketsAbandoned: u64
  resolutionRate: f64
}
```

### Client-Side Derivations (Frontend Responsibility)

```typescript
// Derived from raw data
const derivedData = {
  creatorPriorityDeadlineMs: market.closeTimeMs + market.creatorPriorityWindowMs,
  resolveDeadlineMs: market.closeTimeMs + 72 * 60 * 60 * 1000,
  canCommunityPropose: currentTimeMs >= creatorPriorityDeadlineMs && !market.resolution,
  communityProposalRewardAmount: market.resolution?.creationBondAmount / 2 || 0,
  daysUntilInvalid: (market.resolveDeadlineMs - currentTimeMs) / (24 * 60 * 60 * 1000),
  timeUntilCloseMs: market.closeTimeMs - currentTimeMs,
  isClosingSoon: market.state === "OPEN" && market.timeUntilCloseMs < 12 * 60 * 60 * 1000,
  proposerDisplay: `0x${market.resolution?.proposer.substring(2, 8)}...${market.resolution?.proposer.substring(-4)}`,
  countdownText: formatMsAsCountdown(timeRemainingMs),
}
```

### Hooks Needed

```typescript
// Main market data hook
const useMarketData = (marketId: string) => MarketData

// User staking status
const useUserStakingStatus = (userAddress: string) => {
  stakeAmount: u64
  isStaked: boolean
  totalPoolStake: u64
  votingPower: f64
}

// User SUFFER balance
const useUserBalance = (userAddress: string, tokenSymbol: string) => {
  balance: u64
  isLoading: boolean
  error?: Error
}

// All historical markets
const useMarketHistory = (userAddress: string, options?: {sort, limit}) => {
  markets: MarketData[]
  total: u64
  isLoading: boolean
}

// Active disputes (for portfolio DISPUTE VOTING tab)
const useActiveDisputes = () => {
  disputes: Array<{marketId, state, phase, phaseEndMs}>
  isLoading: boolean
}
```

---

## Filter State Mapping (Final)

### Market Index Filters

```typescript
const filterDefinitions = {
  ALL: {
    condition: () => true,
    label: "All Markets",
  },
  OPEN: {
    condition: (m) => m.state === "OPEN",
    label: "Open",
  },
  CLOSING: {
    condition: (m) => m.state === "OPEN" && (m.closeTimeMs - now) < 12 * 60 * 60 * 1000,
    label: "Closing",
    badge: { text: "CLOSING", color: "orange" },
  },
  NEEDS_PROPOSAL: {
    condition: (m) => m.state === "CLOSED" && !m.resolution,
    label: "Needs Proposal",
    badge: { text: "NEEDS PROPOSAL", color: "orange" },
  },
  PROPOSAL_PENDING: {
    condition: (m) => m.state === "RESOLUTION_PENDING",
    label: "Proposal Pending",
    badge: { text: "PENDING", color: "mint" },
  },
  DISPUTED: {
    condition: (m) => ["DISPUTED", "SDVM_COMMIT", "SDVM_REVEAL", "SDVM_TALLY"].includes(m.state),
    label: "Disputed",
    badge: { text: "DISPUTED", color: "yellow" },
  },
  RESOLVED: {
    condition: (m) => ["RESOLVED", "INVALID"].includes(m.state),
    label: "Resolved",
    badge: { text: "RESOLVED", color: "mint" },
  },
}
```

### Portfolio Filters

```typescript
const portfolioFilterDefinitions = {
  ALL: {
    condition: (p) => true,
    label: "All Positions",
  },
  OPEN: {
    condition: (p) => p.market.state === "OPEN" && p.userPosition,
    label: "Open",
  },
  ACTION_REQUIRED: {
    condition: (p) => p.isCreator && p.market.state === "CLOSED" && !p.market.resolution,
    label: "Action Required",
  },
  CLAIMABLE: {
    condition: (p) => ["RESOLVED", "INVALID"].includes(p.market.state) && p.userPosition && !p.userPosition.isClaimed,
    label: "Claimable",
  },
  HISTORY: {
    condition: (p) => ["RESOLVED", "INVALID"].includes(p.market.state),
    label: "History",
  },
  DISPUTE_VOTING: {
    condition: () => true, // separate tab, not a filter
    label: "Dispute Voting",
  },
}
```

### Market Card Badge Mapping

```typescript
const badgeMapping = {
  OPEN: {
    showClosingBadge: (m) => (m.closeTimeMs - now) < 12 * 60 * 60 * 1000,
    badge: { text: "CLOSING", color: "orange" },
  },
  CLOSED: {
    showBadge: !m.resolution,
    badge: { text: "NEEDS PROPOSAL", color: "orange" },
  },
  RESOLUTION_PENDING: {
    showBadge: true,
    badge: { text: "PENDING", color: "mint" },
  },
  DISPUTED: {
    showBadge: true,
    badge: { text: "DISPUTED", color: "yellow" },
  },
  SDVM_COMMIT: {
    showBadge: true,
    badge: { text: "DISPUTED", color: "yellow" },
  },
  SDVM_REVEAL: {
    showBadge: true,
    badge: { text: "DISPUTED", color: "yellow" },
  },
  SDVM_TALLY: {
    showBadge: true,
    badge: { text: "DISPUTED", color: "yellow" },
  },
  RESOLVED: {
    showBadge: true,
    badge: { text: "RESOLVED", color: "mint" },
  },
  INVALID: {
    showBadge: true,
    badge: { text: "RESOLVED", color: "mint" },
  },
}
```

---

## Open Questions & Gaps

As of 2026-03-19, all decisions have been confirmed by the user. No remaining ambiguities.

### Confirmed Decisions (from user)

1. ✓ "NEEDS PROPOSAL" is a filter on market index — YES
2. ✓ Community proposers see bond reward in portfolio — YES (as experience/discovery)
3. ✓ CLOSING filter threshold: <12 hours — CONFIRMED
4. ✓ Dispute voting tab name: "DISPUTE VOTING" — CONFIRMED
5. ✓ Claim = isolated button (not navigating to market), green flash "CLAIMED ✓ X SFR" — CONFIRMED
6. ✓ Staking is global (register once), voting is per-dispute (vote from market detail page) — CONFIRMED
7. ✓ Warning text: "After 24 hours, anyone can propose and earn a reward. If nobody proposes within 72h, market goes INVALID." — CONFIRMED
8. ✓ First-come-first-served for community proposals (race condition handled on-chain — first tx wins) — CONFIRMED

### No Remaining Ambiguities

All user stories, data requirements, edge cases, and UI specifications are complete and unambiguous. Frontend engineers can implement from this document without follow-up questions.

---

## Document Sign-Off

**Status:** READY FOR IMPLEMENTATION

**Reviewed By:** Product Team (PM + TPM + UI/UX Designer)

**Date:** 2026-03-19

**Next Steps:**
1. Frontend engineers begin implementation using this document as specification
2. Backend engineers ensure data layer (useMarketData hook) returns all required fields
3. Contract engineers confirm community proposal and SDVM voting mechanics are finalized
4. QA uses acceptance criteria to write test cases

---

**End of Document**
