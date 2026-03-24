# SDVM Architecture — Decentralized Voting & Dispute Resolution

**Document role:** SDVM-specific architecture for agents working on voting/staking/dispute resolution.
**Priority of truth:** On-chain code > this document > older specs.
**Line references:** Semantic anchors (function names), not stable API guarantees.

---

## 1. What This Is

**TL;DR:** A community-built prediction market on Sui (Move smart contracts), using an external SUFFER (SFR) collateral family. Markets are created, traded via CPMM AMM, then resolved through a 4-tier system. When disputed, tokenholders vote on outcomes (SDVM) for rewards or slashing.

### The Stack

- **Blockchain:** Sui (Move 2024 edition, shared + owned object model)
- **Token:** SUFFER (SFR) — 2 decimals, 10M supply, for bonds, staking, and trading
- **Contracts:** Move (18 modules in `prediction_market` package)
- **Frontend:** React + TypeScript, staking/voting/dispute dashboard
- **Gas Relay:** Node.js Express, sponsors voting/staking transactions
- **Phase Bot:** Node.js service, advances voting phases on deadline

### Module Map

```
prediction_market package:
├── suffer.move              — SUFFER token (Coin<SUFFER>, treasury, minting)
├── pm_rules.move            — Constants, enums, validators
│
├── MARKET CORE:
├── pm_market.move           — Market lifecycle (create, close, transitions)
├── pm_trading.move          — CPMM AMM (buy/sell/claim/refund)
├── pm_resolution.move       — 3-tier resolution system
│
├── DISPUTE SYSTEM:
├── pm_dispute.move          — Dispute filing, bond distribution
├── pm_sdvm.move             — Commit-reveal voting, tally, results
├── pm_staking.move          — Staking pool, slashing, cooldown
│
├── SUPPORTING:
├── pm_registry.move         — Global config (PMConfig, PMAdminCap)
├── pm_treasury.move         — Fee collection, bond forfeiture
├── pm_position.move         — User position tracking
├── pm_policy.move           — Market type policies
├── pm_source.move           — Verification source management
├── pm_math.move             — Math helpers for AMM
├── pm_view.move             — View functions
├── pm_admin.move            — Admin operations
├── pm_events.move           — Event types and emissions
├── swap_pool.move           — Secondary liquidity pool
└── (1 other)                — Supporting modules
```

---

## 2. SDVM Architecture Overview [Concept]

### **Dispute Entry Points & Path Selection** [Concept]

When market reaches RESOLUTION_PENDING, two paths are available:

| Path | When Used | Who Resolves? | Speed | Tier |
|------|-----------|---------------|-------|------|
| **Path A (Appointed Resolvers)** | Legacy, fallback | PMResolverSet votes (simple majority) | Fast (hours) | Tier 2 |
| **Path B (SDVM Tokenholders)** | Primary (Phase 2 onward) | SUFFER stakers vote (Schelling point, 65% SPAT) | Slow (days) | Tier 3 |

**Can both be active simultaneously?** No — dispute filing triggers Path B. Path A is fallback if SDVM bootstrap fails.

**Who chooses?** Market creator's trust tier (set at creation) determines which path `pm_policy.move` enforces. God lever `AdminResolve` can override either path during testnet.

### **Two-Level Voting Architecture** [Concept]

**Problem:** If all voters commit to a single shared SDVMVoteRound object, only one commit executes per block. 1000 concurrent voters = 1000 blocks of latency (hours or days).

**Solution (D3 from design docs):**
- **Owned Layer:** Each voter gets `SDVMCommitRecord` (owned, has `key` + `store`, carries `round_number` for salt validation on round rolls) [pm_sdvm.move]. 1000 commits execute in parallel with zero contention.
- **Shared Layer:** `SDVMVoteRound` stays shared but read-only during commit. Mutated only during reveal (one write per voter) and tally (once).

**Why Critical:** Enables 100+ concurrent commits vs ~20 on shared objects alone. **Core innovation that makes SDVM viable on Sui.**

[Implementation Anchor: pm_sdvm.move (voting logic), pm_staking.move (stake tracking)]

### Market & Dispute Lifecycle

```
Market States:
  OPEN (trading) → CLOSED (at close_time) → RESOLUTION_PENDING

Dispute Flow:
  RESOLUTION_PENDING → DISPUTED (if disputed)
                    → RESOLVED (directly if no dispute, or after SDVM vote)
                    → INVALID (via timeout, max rolls, or Tier 4)
```

---

## 3. Resolution & Dispute System

### Four-Tier Resolution

```
Tier 1: Deterministic (on-chain data)
  → If source available, auto-resolve

Tier 2: Declared Source (trusted verifier)
  → Verifier with PMVerifierCap proposes → settles

Tier 3: Creator Proposed + SDVM Voting
  → Market creator proposes outcome
  → Community can dispute (goes to SDVM)
  → SDVM: Staker-weighted Schelling point voting
     - 4 phases: COMMIT (12h) → REVEAL (12h) → TALLY → SETTLED
     - Outcome must reach 65% supermajority (SPAT)
     - Quorum decreases per roll: 5% → 3% → 1% (GAT)
     - Max 2 rolls testnet, 3 rolls mainnet
     - Correct voters: earn pro-rata rewards
     - Wrong voters: lose 0.1% stake
     - Non-reveals: lose 1% stake (10x penalty)

Tier 4: Emergency Invalidation (2-of-3 multisig)
  → Nuclear option, all bonds returned
```

### Two Resolution Paths for Disputes

When a market is disputed, pm_dispute.move supports **two parallel resolution paths**:

**Path A: Appointed Resolver Set (Tier 2, centralized, fast)**
The original system. A global PMResolverSet of appointed addresses votes directly via `cast_vote()`. When quorum is reached, `try_resolve_dispute()` tallies and resolves. Simple majority wins (with defender-wins-ties). This path exists in production today and remains as fallback.

**Path B: SDVM Tokenholder Vote (Tier 3, decentralized, slower)**
The new system. After dispute is filed, `create_sdvm_vote_round()` creates a commit-reveal voting round. All SUFFER stakers can vote. Uses Schelling point economics (slash/reward) instead of trusted resolvers. This is the primary path going forward — appointed resolvers become the fallback for when SDVM is bootstrapping.

Both paths coexist in pm_dispute.move. The market creator's trust tier determines which path is used. God lever AdminResolve can override either path during testnet.

### **Staking Pool Economics** [Concept]

`SufferStakePool` (shared object) [pm_staking.move, lines 138-145] holds two balances:
- `pending_rewards`: staked SUFFER from all voters (grows on new stakes, shrinks on unstakes/slashes)
- `pending_slash`: accumulated from incorrect/non-reveal voters (correct voters claim from this after tally)

**Flow:**
1. Voter stakes → SUFFER goes to `pending_rewards` [pm_staking.move::stake(), lines 203-240]
2. Voter votes correctly → receives pro-rata share from `pending_slash` [pm_sdvm.move::claim_voter_reward()]
3. Voter votes incorrectly → slashed; amount moves from `pending_rewards` → `pending_slash` [pm_staking.move::apply_slash(), lines 416-442]
4. Tally caller gets 0.1% of `pending_slash` as incentive [pm_sdvm.move, ~line 340]

**Closed loop:** Slashed SUFFER funds rewards. Zero tokens created/destroyed. **Source of truth for amounts:** Move code in pm_staking.move + pm_sdvm.move.

### **Dispute Lifecycle: 7 Steps (SDVM Path)** [Concept + Implementation Anchor]

**Step 1: Dispute Filed** [pm_dispute.move::file_dispute(), lines 198-267]
User calls `file_dispute()`. Market transitions RESOLUTION_PENDING → DISPUTED. PMDispute created and shared.

**Step 2: SDVM Round Created** [pm_dispute.move::create_and_share_sdvm_vote_round(), lines 323-332] ⚠️ **[RT-INTEGRATION-001: SDVMVoteRound Sharing Responsibility Gap]**

⚠️ **CRITICAL FAILURE SCENARIO:** Always use `create_and_share_sdvm_vote_round()`. If you call `create_sdvm_vote_round()` and forget `transfer::share_object(round)`, the round becomes inaccessible and all voters are slashed 1% for non-reveal. No recovery. The wrapper handles sharing automatically — use it.

**Step 3: Commit Phase** [pm_sdvm.move::commit_vote(), 12h default]
Any SUFFER staker calls `commit_vote(round, pool, position, commitment_hash, clock, ctx)`. Hash = `sha3_256(bcs::to_bytes(&outcome_u16) ++ salt_bytes)` — BCS is little-endian. Creates owned `SDVMCommitRecord` per voter (carries `round_number` field for salt cache safety on round rolls). Zero contention — 100+ concurrent commits. Also calls `pm_staking::register_dispute()` to block premature unstaking.

**Step 4: Reveal Phase** [pm_sdvm.move::reveal_vote(), 12h default]
Triggered by `advance_to_reveal_phase()` (permissionless). Voters call `reveal_vote(round, commit_record, position, voted_outcome, salt, clock, ctx)`. Verifies hash match. Consumes SDVMCommitRecord.

**Explicit Abstention:** Vote with outcome = 0xFFFF (65535). Outcome 0xFFFF = explicit abstain. Not slashed, not rewarded. Counts toward commit count but NOT toward revealed_weight (excluded from GAT/SPAT calculations).

**Step 5: Tally** [pm_sdvm.move::tally_votes(), permissionless]
Checks:
1. **GAT (Governance Attendance):** revealed_weight ≥ (committed_weight × GAT%)
   - Round 1: 5%, Round 2: 3%, Round 3: 1% [pm_sdvm_architecture_principles.md, table]
2. **SPAT (Supermajority):** winning_outcome_weight ≥ (revealed_weight × **65%**)
3. Both pass → SETTLED. Fail → rolls with GAT decreased. Max rolls or 7-day deadline → INVALID.

**Slash Formula** [pm_staking.move::apply_slash(), lines 416-442]:
- Correct: reward = (voter_stake / total_correct_weight) × slash_pool
- Incorrect: slash = 0.1% of stake
- Non-reveal: slash = 1% of stake (10x penalty)

**Step 6: Slash & Reward (Post-Tally, Permissionless)** [pm_sdvm.move, ~lines 340-380]
After SETTLED, slash/reward happen in separate permissionless calls (not inside tally):
- `apply_voter_slash()` — per incorrect/non-reveal voter [pm_staking.move:416-442]
- `claim_voter_reward()` — per correct voter; transfers Coin<SUFFER> from pending_slash
- Both unregister dispute to free unstake lock

**Dispute-Aware Unstaking** [pm_staking.move, lines 154-165]:
Positions track `pending_dispute_ids_pre_unstake` (filed before unstake) vs `pending_dispute_ids_post_unstake` (filed after). Only pre-unstake disputes block `complete_unstake()`. Prevents "vote and run" without penalizing voters pulled into new disputes.

**Step 7: Resolution** [pm_dispute.move::resolve_from_sdvm(), lines 351-454]
Checks round is SETTLED. Distributes bonds (D2 — Design Decision 2):
- ⚠️ **Bond Distribution (CRITICAL):**
  - **Upheld** (outcome == proposed): 75% of **proposer's bond** to disputer, 25% to treasury
    - For creator-proposed: 75% of creation bond to disputer, 25% to treasury
    - For community-proposed: 75% of community proposer's bond to disputer, 25% to treasury
  - **Rejected** (outcome != proposed): 75% of **disputer's bond** to proposer, 25% to treasury
- **75/25 Rationale:** Strongly incentivizes accurate proposals (proposer keeps 75% of disputer's bond when correct) + feeds treasury. UMA uses 50/50; we're more generous to correct parties because market is smaller, needs stronger bootstrap incentives.
- Market → RESOLVED (rejected) or INVALID (upheld)

### Key Parameters

**Code defaults** (hardcoded in pm_sdvm.move/pm_staking.move):

| Parameter | Code Default | Mainnet Target | Constant |
|-----------|-------------|----------------|----------|
| **Commit phase** | 12h (43,200,000ms) | 12h | `DEFAULT_COMMIT_DURATION_MS` |
| **Reveal phase** | 12h (43,200,000ms) | 12h | `DEFAULT_REVEAL_DURATION_MS` |
| **Expedited** | 4h (14,400,000ms) | 4h | `EXPEDITED_DURATION_MS` |
| **Hard deadline** | 7 days | 7 days | `HARD_DEADLINE_MS` |
| **Unstake cooldown** | 48h | 48h | `DEFAULT_COOLDOWN_MS` |
| **Emergency penalty** | 5% (500 bps) | 5% | `EMERGENCY_UNSTAKE_PENALTY_BPS` |
| **GAT Round 1** | 5% (500 bps) | 5% | `GAT_ROUND_1_BPS` |
| **GAT Round 2** | 3% (300 bps) | 3% | `GAT_ROUND_2_BPS` |
| **GAT Round 3** | 1% (100 bps) | 1% | `GAT_ROUND_3_BPS` |
| **SPAT** | 65% (6500 bps) | 65% | `SPAT_BPS` |
| **Max rolls (testnet)** | 2 | 3 (mainnet) | `MAX_ROLLS_TESTNET` / `MAX_ROLLS_MAINNET` |
| **Tally caller reward** | 0.1% (10 bps) | 0.1% | `TALLY_CALLER_REWARD_BPS` |
| **ABSTAIN outcome** | 0xFFFF (65535) | 65535 | `SDVM_OUTCOME_ABSTAIN` |

**Testnet phasing** (T1→T4) adjusts slash rates via AdminSlashOverride god lever, not code changes. T1 starts with 0% slash (training wheels), T2 introduces 0.05%, T3 uses code defaults (0.1%). Phase timing is reduced via expedited flag for T1/T2 (shorter commit/reveal windows).

---

## 4. Design Principles

### **1. Economic Security Over Technical Enforcement** [Concept]

⚠️ **CRITICAL CAVEAT ON 65% ATTACK COST:** Controlling outcomes requires 65% of **PARTICIPATING stake**, not total stake.

**Example:** If 1M total SUFFER is staked but only 10% reveals (100k), attacking costs just 65k (6.5% of total). The **GAT threshold (5%→3%→1% per roll) is the real defense** — it ensures minimum participation. Low voter engagement is a system risk.

**Attacker's cost profile:**
- Acquire 65% of revealed votes' stake
- Face 0.1%-1% slashing per vote
- If market payout < attacker's slash exposure, unprofitable

**Implication:** Monitor voter participation. Don't add code to prevent sybils. Ask: "What's the attacker's macro cost?" If unprofitable after GAT + slash consideration, document and move on.

[Implementation Anchor: GAT thresholds pm_sdvm.move, slash rates pm_staking.move:416-442]

### **2. Progressive Decentralization via God Levers** [Concept]

God levers solve bootstrap: we lack 5 years of battle-tested parameters like UMA. Testnet admin controls is correct engineering, not weakness. Without levers, poorly calibrated GAT could stall disputes forever. With levers, admins unblock while we learn.

**Removal Criteria (Measurable & Achievable):**
- Admin intervention rate < 5% of disputes
- Error rate on non-admin-resolved disputes < 10%
- 3+ months stable mainnet operation

These are achievable and measurable. "Zero error" is impossible — don't use that.

[Implementation Anchor: God levers in pm_sdvm.move (AdminResolve, AdminSlashOverride, AdminQuorumOverride), tracked via SDVMGovernanceTracker]

### **3. Measure Before Optimizing** [Concept]

Red team flagged "potential problems" at scale we haven't reached: death spiral from slashing, reveal phase contention, tally gas. Pattern: "might matter when 10x bigger." Response: instrument, ship with god levers, measure real behavior, then fix.

**Instrumentation:** SDVMGovernanceTracker [pm_sdvm.move] counts admin actions, dispute resolutions, rolls. Events emitted for every state change. Testnet phases T1→T4 progressively increase parameters while monitoring metrics.

**Measurement enables data-driven god lever removal decisions.**

### **4. Three-Layer Cleanup** [Concept + Implementation Anchor]

Some disputes may fail to clear properly (network failures, bugs). Three cleanup paths:

1. **Automatic** [pm_sdvm.move]: normal reward/slash path calls `pm_staking::unregister_dispute()`
2. **Permissionless** [pm_staking.move::clear_settled_dispute(), lines 543-579]: Staker calls with proof of SETTLED round phase
3. **Admin** [pm_staking.move::admin_force_clear_disputes(), lines 584-606]: via SDVMAdminCap (auditable via events)

Prevents permanent locks without requiring admin for normal cases.

---

## 5. God Levers (Testnet Only)

| Lever | What It Does | Removal Criteria |
|-------|-------------|------------------|
| **AdminResolve** | Manually settle a dispute with an outcome | <5% of disputes use this; non-admin disputes have <10% error |
| **AdminSlashOverride** | Manually slash a voter | 0 admin slashes (only system slashes allowed) |
| **AdminQuorumOverride** | Change GAT threshold mid-round | 0 overrides after first 2 weeks of testnet |
| **AdminPhaseAdvance** | Manually advance phase (commit→reveal or reveal→tally) | Only used for stuck phases; <1% of disputes |
| **PauseStaking** | Pause all new staking (emergency response) | 0 pauses for >30 days |

Every admin action emits an event and increments SDVMGovernanceTracker for on-chain audit trail.

**Operational Details:** See SDVM_TESTNET_RUNBOOK.md for procedures, prerequisites, and recovery steps for each lever.

---

## 6. Creator Abandonment Exploit Prevention (IMPLEMENTED)

### Problem: The Creator Abandonment Exploit

In creator-proposed markets, if a creator's bet losses exceed the creation bond, they face a perverse incentive to NOT propose an outcome. This is because:

1. If creator proposes outcome X: market resolves against the creator (they lose beyond the bond)
2. If creator doesn't propose: market times out after resolve deadline → INVALID state
3. In INVALID: everyone (including creator) gets pro-rata refunds of collateral
4. Creator's loss: just the creation bond, not the full bet loss

**Attack Cost:** Creator must overcome psychological/reputational barriers (minimal), not financial ones.

### Solution: Community Resolution with Priority Window (FULLY IMPLEMENTED)

**Mechanism:**
- **Creator Priority Window:** 24 hours after market closes, only creator can propose resolution via `pm_resolution::propose_resolution()` [pm_resolution.move:163-202]
- **Community Window:** After 24 hours, any SUFFER token holder can propose via `pm_resolution::propose_community_resolution()` [pm_resolution.move:251-313]
- **Community Proposer Bond:** Must equal the creation bond amount (enforced by code)
- **Bond Incentives:**
  - Correct proposer gets reward (50% of creator's bond if undisputed, 75% if dispute rejected)
  - Incorrect proposer loses entire bond (75% to disputer, 25% to treasury)

**Why This Works:**
- Creator cannot force INVALID by abandoning (someone else will propose and be rewarded)
- Correct resolution incentivizes community to participate (financial reward)
- Bond mechanism (proposer posts same amount as creator) aligns incentives — proposers only propose if confident
- Same SDVM dispute flow applies to both creator and community proposals

**Implementation Details:**
- `CREATOR_PRIORITY_WINDOW_MS` = 24 * 60 * 60 * 1000 (constant in pm_rules.move:86)
- Community proposer fields: `community_resolution_bond`, `community_resolution_proposer` (pm_market.move:161-162)
- Bond validation enforced: `bond_amount >= creation_bond` (pm_resolution.move:286)

**Comparison to Industry Standards:**
- UMA (Optimistic Oracle): Anyone can propose any time; disputes use Schelling point voting; proposer always posts bond
- Polymarket: Uses UMA for resolution; no priority window (optimistic model)
- This system: Priority window respects creator's initial investment; community can step in after fair time window

[Implementation Anchor: pm_resolution.move::propose_community_resolution() lines 251-313, pm_market.move lines 161-162, 506-524, pm_rules.move line 86]

---

## Summary [Concept]

This is a 3-tier dispute resolution system (Deterministic → Declared Source → Creator Proposed + SDVM) anchored on economic security, not technical enforcement. Core innovation: **two-level voting** (owned commits, shared round) enables 100+ concurrent votes. God levers enable safe testnet progression while validating parameters.

**Resolution legitimacy** relies on:
- **Tier 1:** On-chain data (deterministic) — highest legitimacy
- **Tier 2:** Verifier's off-chain research — moderate legitimacy
- **Tier 3:** Schelling point voting (SDVM) — legitimacy from staker consensus + economic incentives

When uncertain about attack viability: "What's the attacker's cost?" (including GAT + slash exposure). If unprofitable after realistic participation assumptions, document and move on.

**Trust this document's architecture. Trust the Move code for implementation. When they diverge, code wins.**
