# SUFFER Dispute Verification Mechanism (SDVM) — Architecture Spec

**Status:** v2 — RED TEAM REVIEWED
**Author:** Systems Architecture (Team Alpha)
**Date:** 2026-03-17
**Depends on:** pm_dispute.move, pm_resolution.move, pm_rules.move, pm_registry.move

---

## 0. God Lever Strategy

The #1 risk is bootstrapping failure in an infant market. UMA had years of organic growth and battle-tested parameters. We have neither. This section defines the admin overrides ("god levers") that will be progressively removed as the system proves itself.

### Strategic Rationale

Testnet is for learning, not for trustlessness. Every lever is documented, has measurable removal criteria, and is instrumented — every admin action emits events and counts toward removal eligibility. If a lever is used 0 times over 12 weeks, it's safe to remove. If used 50 times, the underlying mechanism needs more work.

### Testnet God Levers

| Lever | What It Does | Removal Criteria | Red Team Findings |
|-------|-------------|-----------------|-------------------|
| **AdminResolve** | Admin can force-resolve any dispute at any time, bypassing SDVM vote | 50+ disputes resolved by SDVM with >60% participation, <10% error rate (AdminResolve used in fewer than 5 of the last 50 disputes) | RT-008, RT-010, RT-011 |
| **AdminSlashOverride** | Admin can adjust slash rate per-dispute or globally, including setting to 0% | 8 weeks of data showing participation >40% at current slash rate; no mass-exit events (>20% staker withdrawal in single week) | RT-001, RT-007, RT-013 |
| **AdminQuorumOverride** | Admin can lower GAT/SPAT for a specific dispute if quorum stalls | 20+ disputes resolve without quorum override; GAT rollover mechanism handles at least 3 disputes that would have stalled | RT-008, RT-015 |
| **AdminPauseStaking** | Admin can freeze stake/unstake if exploit detected | Independent audit passes; no exploits found in 8 weeks of stress testing | RT-016, RT-027 |
| **AdminPhaseAdvance** | Admin can force phase transitions (commit→reveal→tally) if automation fails | Bot-driven phase transitions succeed >95% of the time for 4 consecutive weeks; <5 minute average latency | RT-006, RT-011, RT-033 |

**Why this works:**
- Testnet never gets to "trustless" — the goal is to learn fast and safe
- Levers are explicitly temporary with public removal timelines
- Every lever is instrumented: usage counted and logged on-chain
- If a lever is never used, removing it is safe. If heavily used, the mechanism needs work.

---

## 1. Problem Statement

The prediction market system currently uses an **appointed resolver set** for dispute resolution. This creates two problems:

1. **Liability.** A centralized operator controls who resolves disputes. If a resolution is wrong, that party is the accountable party.
2. **Centralization.** A small, fixed set of resolvers is gameable — bribe 3 of 5 and you own the outcome.

We need a system where dispute resolution is **decentralized, economically incentivized, and trustless** — so that no single party bears liability for outcomes.

### Design Goal

Build UMA's DVM equivalent natively on Sui using the SUFFER token. Learn on testnet. Ship battle-tested on mainnet.

---

## 2. UMA's Model — What We're Stealing

UMA's dispute resolution is a 3-layer escalation game:

### Layer 1: Optimistic Oracle (we already have this)
- **Proposer** asserts an outcome + posts bond
- **Liveness window** (default 2 hours) — anyone can dispute
- If no dispute → outcome accepted. Proposer gets bond back.

### Layer 2: Dispute (we already have this, partially)
- **Disputer** posts matching bond + counter-proposal
- Dispute escalates to DVM (tokenholder vote)

### Layer 3: DVM — Tokenholder Vote (we need to build this)
- **Commit phase**: staked SUFFER holders submit `hash(vote + salt)` on-chain
- **Reveal phase**: voters reveal their vote + salt, hash is verified
- **Schelling Point**: voters converge on truth because they expect others to do the same
- **Slashing**: wrong/absent voters lose stake. Correct voters earn that slash.
- **Quorum**: GAT (minimum participation) + SPAT (65% of revealed weight must agree)
- **Roll mechanism**: if quorum not met, vote rolls to next round with decreasing quorum. After max rolls → INVALID.
- **Settlement**: winner gets portion of loser's bond. Protocol keeps the rest.

### What Makes It Work

The genius is the **economic alignment**:
- Voting correctly is profitable (you earn slashed SUFFER from wrong voters)
- Voting incorrectly is costly (you lose stake)
- Abstaining is free if you never commit (opt-in design)
- Committing but not revealing is extremely costly (10x penalty)
- The Schelling Point ensures convergence: if you think the truth is obvious, you vote for it, because you expect everyone else to do the same

---

## 3. Translation to Sui + SUFFER

### What maps directly

| UMA Concept | SUFFER Equivalent | Notes |
|---|---|---|
| UMA token | SUFFER token | Already exists, already used for bonds |
| Staking | `SufferStake` shared object | New — SUFFER locked in staking pool |
| Commit hash | `sha3_256(bcs::to_bytes(&outcome) ++ salt)` | BCS serialization for determinism |
| Reveal + verify | Compare revealed hash to committed | Standard Move pattern |
| Slashing | Redistribute `Balance<SUFFER>` | Move's balance type handles this natively |
| Bond (proposer) | `creation_bond` on PMMarket | Already exists |
| Bond (disputer) | `bond: Balance<SUFFER>` on PMDispute | Already exists |
| GAT | Minimum SUFFER participation threshold | Decreasing per round: 5% → 3% → 1% |
| SPAT | Minimum agreement percentage | 65% agreement threshold (no tie-breaker) |
| Vote roll | Re-open commit phase, increment roll counter | New field on PMDispute |

### What's different (and better) on Sui

1. **Object ownership model.** Sui's owned objects mean stake positions are owned by voters — no approval/allowance dance like ERC-20. Staking is just transferring a `Coin<SUFFER>` into a shared `StakePool`.

2. **No gas for voters (sponsored).** Our gas relay can sponsor voting transactions. Voters don't need SUI — they just need SUFFER stake. This lowers the barrier massively vs UMA where voters need ETH for gas.

3. **Clock object.** Sui's consensus Clock gives us trustworthy timestamps for phase transitions without relying on block.timestamp manipulation.

4. **Shared object sequencing.** Sui sequences all transactions touching the same shared object through consensus. This gives us atomic phase transitions — no front-running between commit and reveal phases.

5. **Two-level architecture.** SDVMCommitRecord (owned) eliminates commit-phase contention. Reveals still touch shared object (SDVMVoteRound) but only during reveal phase, spread over 12h.

### What we explicitly don't need

- **Delegation.** UMA allows vote delegation. We skip this for v1 — adds complexity, creates whale consolidation risk.
- **Governance votes.** UMA uses the DVM for protocol governance too. We keep governance separate (PMAdminCap).
- **Cross-chain.** UMA bridges disputes across chains. We're Sui-only.

---

## 4. Architecture

### 4.1 New Structs

```move
/// Global staking pool. One per deployment. Shared object.
public struct SufferStakePool has key {
    id: UID,
    /// Total SUFFER staked across all stakers
    total_staked: u64,
    /// Accumulated rewards from slashing (distributed pro-rata to correct voters)
    pending_rewards: Balance<SUFFER>,
    /// Configuration
    min_stake_amount: u64,           // Minimum SUFFER to become a voter
    slash_rate_bps: u64,             // Basis points slashed per wrong/missed vote (default: 10 = 0.1%)
    gat_amount: u64,                 // God Awful Threshold — minimum total SUFFER that must vote (decreases per roll)
    spat_bps: u64,                   // Schelling Point Activation Threshold — % agreement required (default: 6500 = 65%)
    max_rolls: u8,                   // Max vote rolls before deletion (testnet: 2, mainnet: 3)
    commit_phase_duration_ms: u64,   // Default: 43_200_000 (12 hours); expedited: 14_400_000 (4 hours)
    reveal_phase_duration_ms: u64,   // Default: 43_200_000 (12 hours); expedited: 14_400_000 (4 hours)
    hard_deadline_ms: u64,           // 7 days: absolute max time from dispute filing to INVALID if unresolved
}

/// Individual staker position. Owned object (by the staker).
public struct SufferStakePosition has key, store {
    id: UID,
    owner: address,
    staked_amount: u64,
    /// Epoch when stake was deposited (cooldown: can't vote in the epoch you staked)
    stake_epoch: u64,
    /// Track cumulative slashing
    cumulative_slash: u64,
    /// Track cumulative rewards earned
    cumulative_rewards: u64,
    /// Timestamp when unstake was initiated (48h cooldown from this)
    unstake_initiated_at_ms: Option<u64>,
    /// IDs of disputes filed before unstake; stake is slashable for these until resolved
    pending_dispute_ids: vector<ID>,
}

/// Commit record for one voter in one round. Owned object (owned by voter).
/// This eliminates commit-phase contention on the shared SDVMVoteRound.
public struct SDVMCommitRecord has key {
    id: UID,
    voter: address,
    vote_round_id: ID,
    commitment_hash: vector<u8>,    // sha3_256(bcs::to_bytes(&outcome) ++ salt)
    stake_weight: u64,              // Voter's staked SUFFER at time of commit
    revealed: bool,                 // Set to true when reveal_vote() is called
}

/// Extended dispute struct — replaces current PMDispute.votes with commit-reveal.
/// Shared object but READ-ONLY during commit phase.
public struct SDVMVoteRound has key {
    id: UID,
    dispute_id: ID,
    round_number: u8,
    phase: u8,                           // 0 = COMMIT, 1 = REVEAL, 2 = TALLY, 3 = SETTLED
    commit_deadline_ms: u64,
    reveal_deadline_ms: u64,
    hard_deadline_ms: u64,               // 7-day absolute cap
    expedited: bool,                     // If true, phase durations are 4h/4h instead of 12h/12h
    /// Revealed votes (populated during reveal phase, consumed during tally)
    reveals: vector<VoteReveal>,
    /// Snapshot of total staked SUFFER at round start (for quorum calc)
    total_staked_snapshot: u64,
    /// Total SUFFER weight that committed this round
    total_committed_weight: u64,
    /// Total SUFFER weight that revealed
    total_revealed_weight: u64,
}

public struct VoteReveal has store, copy, drop {
    voter: address,
    voted_outcome: u16,
    salt: vector<u8>,
    stake_weight: u64,
}

/// Outcome representing explicit abstention. Never slashed, never rewarded.
public struct AbstractionVote has copy, drop {
    // Marker struct. Outcome = 65535 (u16::MAX) represents abstention.
}
```

### 4.2 Phase State Machine

```
DISPUTE_FILED
    │
    ├─ Create SDVMVoteRound (round 1, phase=COMMIT)
    │
    ▼
COMMIT_PHASE (12h default, 4h expedited)
    │
    ├─ Voters create owned SDVMCommitRecord
    ├─ SDVMVoteRound unchanged (immutable ref only)
    │
    ▼
advance_to_reveal_phase() — Permissionless
    │
    ├─ Clock >= commit_deadline?
    │  (Anyone can call; helps if phase transition bot fails)
    │
    ▼
REVEAL_PHASE (12h default, 4h expedited)
    │
    ├─ Voters call reveal_vote()
    ├─ Writes to SDVMVoteRound (some contention OK, spread over 12h)
    ├─ Consumes SDVMCommitRecord (owned object cleanup)
    │
    ▼
advance_to_tally_phase() — Permissionless
    │
    ├─ Clock >= reveal_deadline?
    │
    ▼
TALLY_PHASE (immediate)
    │
    ├─ tally_votes() — Permissionless, anyone can call
    ├─ Check GAT (with decreasing thresholds):
    │   Round 1: >= 5% of total_staked_snapshot
    │   Round 2: >= 3% of total_staked_snapshot
    │   Round 3: >= 1% of total_staked_snapshot
    │
    ├─ If GAT not met → ROLL (create new round, reset to COMMIT, increment counter)
    │
    ├─ Check SPAT (65% of revealed weight for any outcome):
    │   If no outcome reaches SPAT → ROLL
    │   If still rolling after max_rolls (2 testnet / 3 mainnet) → INVALID
    │
    ├─ If GAT + SPAT met:
    │   ├─ Determine winning outcome (highest weight >= 65%)
    │   ├─ Slash wrong voters (base rate, or 10x for non-reveal)
    │   ├─ Reward correct voters (pro-rata from slash pool)
    │   ├─ Distribute disputer bond (if dispute upheld)
    │   ├─ Bond distribution per D2 (proposer participates in voting/rewards normally)
    │
    ▼
SETTLED
```

### 4.3 Commit-Reveal on Sui

**Commit phase:**
```move
public fun commit_vote(
    vote_round: &SDVMVoteRound,              // Immutable ref only during commit
    stake_pool: &SufferStakePool,
    stake_position: &SufferStakePosition,
    commitment_hash: vector<u8>,             // sha3_256(bcs::to_bytes(&outcome) ++ salt)
    clock: &Clock,
    ctx: &mut TxContext,
) -> SDVMCommitRecord {
    // Assert: phase == COMMIT
    // Assert: clock.timestamp_ms() < commit_deadline_ms
    // Assert: stake_position.owner == sender
    // Assert: stake_position.staked_amount >= min_stake_amount
    // Assert: no existing SDVMCommitRecord for this voter in this round

    // Create and return owned SDVMCommitRecord
    // Voter owns the record, no contention on shared SDVMVoteRound
}

public fun explicit_abstain(
    vote_round: &SDVMVoteRound,              // Immutable ref only
    stake_pool: &SufferStakePool,
    stake_position: &SufferStakePosition,
    salt: vector<u8>,                        // Voter's salt
    clock: &Clock,
    ctx: &mut TxContext,
) -> SDVMCommitRecord {
    // Commit hash(ABSTAIN + salt). outcome = 65535 (u16::MAX)
    // During reveal, voter reveals outcome=65535
    // Tally: abstention is never slashed, never rewarded
}
```

**Reveal phase:**
```move
public fun reveal_vote(
    vote_round: &mut SDVMVoteRound,
    stake_position: &SufferStakePosition,
    voted_outcome: u16,
    salt: vector<u8>,
    commit_record: SDVMCommitRecord,         // Consumed (owned object)
    clock: &Clock,
    ctx: &TxContext,
) {
    // Assert: phase == REVEAL
    // Assert: clock.timestamp_ms() < reveal_deadline_ms
    // Verify: sha3_256(bcs::to_bytes(&voted_outcome) ++ salt) == commit_record.commitment_hash

    // Add to SDVMVoteRound.reveals
    // consume_resource(commit_record) — cleanup
}

public fun advance_to_reveal_phase(
    vote_round: &mut SDVMVoteRound,
    clock: &Clock,
) {
    // Permissionless. Anyone can call.
    // Assert: phase == COMMIT
    // Assert: clock.timestamp_ms() >= commit_deadline_ms
    // Transition: phase = REVEAL
}

public fun advance_to_tally_phase(
    vote_round: &mut SDVMVoteRound,
    clock: &Clock,
) {
    // Permissionless. Anyone can call.
    // Assert: phase == REVEAL
    // Assert: clock.timestamp_ms() >= reveal_deadline_ms
    // Transition: phase = TALLY
}
```

**Why this works on Sui:**
- Owned SDVMCommitRecord: commit throughput is unlimited (no shared object contention)
- BCS serialization: deterministic across Move and TypeScript
- Immutable ref during commit: SDVMVoteRound is read-only, vote count happens in owned records
- Reveal writes are sequential and acceptable (spread over 12h, touching shared object only once per voter)
- Clock is consensus time, not client time: no timestamp manipulation
- Permissionless phase transitions: anyone can call, so phase advances even if bot fails

### 4.4 Slashing + Rewards (Opt-In Model)

This is the key fix from D1. Slashing is **opt-in**: only voters who committed are subject to slash.

**For each voter in the round:**

```
IF voter never committed:
    No slash, no reward
    (Passive stakers are never punished)

IF voter explicitly abstained (outcome = 65535):
    No slash, no reward
    (Abstention is free; for ambiguous/edge-case disputes)

IF voter committed and revealed correctly (voted with majority outcome):
    reward = (voter_stake / total_correct_stake) * total_slash_pool
    voter earns reward
    (Incentivizes correctness)

IF voter committed and revealed incorrectly (voted against majority):
    slash = voter_stake * slash_rate_bps / 10000
    voter loses slash amount
    (Punishes wrong votes)

IF voter committed but did NOT reveal:
    slash = voter_stake * (slash_rate_bps * 10) / 10000
    (10x penalty for non-reveal)
    (Prevents "commit and hide" griefing)
```

**Slash rate defaults (mainnet):**
- Wrong vote: 0.1% (matches UMA)
- Non-reveal: 1.0% (10x penalty)
- Abstention penalty: 0% (no penalty for explicit abstention)

**Testnet progression:**
- T1 (Training Wheels): 0% all slashes (learning phase, no risk)
- T2 (Light Incentives): 0.05% wrong, 0.5% non-reveal
- T3 (Real Stakes): 0.1% wrong, 1% non-reveal
- T4 (Mainnet Candidate): same as mainnet

**Implementation:** Slashing modifies `SufferStakePosition.staked_amount` directly. Rewards are added to the position. `Balance<SUFFER>` is fungible — we split from the stake pool's `pending_rewards` and merge into the voter's position.

**Quorum progression (GAT — God Awful Threshold):**

| Round | GAT (% of snapshot) | Rationale |
|-------|---------------------|-----------|
| Round 1 | 5% | High bar for fresh votes. Requires broad engagement. |
| Round 2 | 3% | Lower bar for re-vote. Some stakers may have abstained or lost connectivity. |
| Round 3 | 1% | Very low bar. Ensures eventual resolution even with apathy. |
| Roll 4+ → INVALID | — | After 3 rolls, market is INVALID. No further rolls. 7-day hard cap also triggers INVALID. |

**SPAT stays at 65%** — no lowering. This prevents a 51% cartel from controlling outcomes. If you can't reach 65% consensus after 3 rolls, the market is ambiguous → INVALID.

**Caller reward for tally:**
```
Caller of tally_votes() receives = total_slash_pool * 0.001 (0.1%)
```
This incentivizes anyone to execute tally, not just the phase transition bot.

### 4.4.1 Reward Distribution Algorithm (Precise Math)

**Tally Process:**

When `tally_votes()` is called on a round, the following deterministic algorithm is executed:

**Step 1: Categorize Voters**

After examining all reveals in the round, categorize each committed voter:

```
total_correct_weight = sum of stake_weight for all voters who:
                       - revealed their vote (outcome != null)
                       AND voted_outcome == winning_outcome

total_incorrect_weight = sum of stake_weight for all voters who:
                         - revealed their vote
                         AND voted_outcome != winning_outcome

total_nonreveal_weight = sum of stake_weight for all voters who:
                         - committed a vote
                         BUT never revealed (VoteReveal not found)
```

**Step 2: Compute Slashes**

For each voter in each category, compute slash amounts:

```
slash_rate_bps = current slash rate in basis points (10 = 0.1% for wrong, 100 = 1% for non-reveal)

For each INCORRECT voter:
  slash_amount = min(
    (voter_stake * slash_rate_bps) / 10000,
    voter_stake
  )
  total_slash_pool += slash_amount
  voter.staked_amount -= slash_amount

For each NON-REVEAL voter:
  slash_amount = min(
    (voter_stake * slash_rate_bps * 10) / 10000,  // 10x penalty for non-reveal
    voter_stake
  )
  total_slash_pool += slash_amount
  voter.staked_amount -= slash_amount
```

**Step 3: Extract Tally Caller Reward**

Before distributing to voters, extract the fixed reward for the caller:

```
tally_caller_reward = (total_slash_pool * TALLY_CALLER_REWARD_BPS) / 10000
                    = (total_slash_pool * 10) / 10000
                    = total_slash_pool * 0.001  (0.1%)

transfer tally_caller_reward to tx_context::sender

total_slash_pool -= tally_caller_reward
```

**Step 4: Distribute Rewards to Correct Voters**

Rewards are distributed pro-rata to all voters who voted correctly:

```
For each CORRECT voter:
  If total_correct_weight == 0:
    // Edge case: all voters voted incorrectly (should not happen if SPAT enforced)
    // No rewards distributed; dust stays in pool
  Else:
    reward = (voter_stake * total_slash_pool) / total_correct_weight

    // Use u128 intermediate to avoid overflow:
    reward = ((voter_stake as u128) * (total_slash_pool as u128)) / (total_correct_weight as u128)

    voter.staked_amount += (reward as u64)
```

**Step 5: Conservation Check**

After all slashes and rewards are applied:

```
Conservation check (for auditing):
  sum(all_rewards) + tally_caller_reward + dust_in_pool == sum(all_slashes)

  Dust = rounding errors from integer division. At scale:
  - Per-reward dust ≈ 1 satoshi per voter (negligible)
  - Caller reward extracts before distribution (deterministic)
  - Dust stays in pool for next round's slash_pool (may accumulate, but slowly)
```

**Numerical Example: 5 Voters, 2 Outcomes**

Initial state:
```
Pool total_staked_snapshot = 10,000 SUFFER

Voter A: stake = 4000 SUFFER, committed, revealed outcome=1
Voter B: stake = 2000 SUFFER, committed, revealed outcome=1
Voter C: stake = 2000 SUFFER, committed, revealed outcome=2
Voter D: stake = 1500 SUFFER, committed, never revealed
Voter E: stake = 500 SUFFER, never committed

Slash rates: wrong_rate_bps = 10 (0.1%), nonreveal_rate_bps = 100 (1%)
SPAT threshold: 65%
```

**Round execution:**

1. **Reveals counted:**
   - Outcome 1: A (4000) + B (2000) = 6000 votes
   - Outcome 2: C (2000) = 2000 votes
   - Total revealed weight = 8000

2. **Quorum check (GAT):** Assume GAT passed (5% of 10,000 = 500; 8000 > 500 ✓)

3. **Majority check (SPAT):**
   - Outcome 1: 6000 / 8000 = 75% > 65% ✓ (WINNER)
   - Outcome 2: 2000 / 8000 = 25% < 65% ✗

4. **Categorization:**
   ```
   total_correct_weight = 4000 + 2000 = 6000 (A and B voted correctly)
   total_incorrect_weight = 2000 (C voted incorrectly)
   total_nonreveal_weight = 1500 (D committed but didn't reveal)
   ```

5. **Slashing:**
   ```
   Voter C (incorrect):
     slash = min((2000 * 10) / 10000, 2000) = 2
     C.staked = 2000 - 2 = 1998
     total_slash_pool = 2

   Voter D (non-reveal):
     slash = min((1500 * 100) / 10000, 1500) = min(15, 1500) = 15
     D.staked = 1500 - 15 = 1485
     total_slash_pool = 2 + 15 = 17

   Voter E: no change (never committed)
   ```

6. **Tally caller reward:**
   ```
   tally_caller_reward = (17 * 10) / 10000 = 0.0017 → 0 (rounded down)
   (At this scale, reward rounds to 0. On mainnet with 1000s of slashes, this is meaningful.)
   total_slash_pool = 17 - 0 = 17
   ```

7. **Distribute to correct voters:**
   ```
   Voter A:
     reward = (4000 * 17) / 6000 = 68000 / 6000 = 11 (integer division)
     A.staked = 4000 + 11 = 4011

   Voter B:
     reward = (2000 * 17) / 6000 = 34000 / 6000 = 5 (integer division)
     B.staked = 2000 + 5 = 2005

   Dust = 17 - 11 - 5 = 1 (stays in pool for next round)
   ```

**Final state:**
```
Voter A: 4011 (earned 11)
Voter B: 2005 (earned 5)
Voter C: 1998 (slashed 2)
Voter D: 1485 (slashed 15)
Voter E: 500 (no change)

Total: 4011 + 2005 + 1998 + 1485 + 500 = 9999
Loss from initial: 10000 - 9999 = 1 (dust in pool, negligible at scale)
Tally caller reward: 0 (rounded down at testnet scale)
```

**Implementation Notes:**

1. **U128 intermediates:** Use `(voter_stake as u128) * (total_slash_pool as u128) / (total_correct_weight as u128)` to avoid overflow on mainnet (large stakes + large pools).

2. **Rounding dust:** Always round down (integer division) for both slash and reward calculations. Dust stays in `total_slash_pool` for the next round.

3. **Edge case: all voters wrong:** If `total_correct_weight == 0` (impossible if SPAT enforced, but handle defensively), skip reward distribution.

4. **Conservation:** Over multiple rounds, `sum(tally_caller_rewards)` should equal the rewards claimed by callers. Dust accumulation is negligible at reasonable scales.

### 4.5 Bond Distribution (D2: Proposer Excluded)

**Decision:** Proposer is NOT excluded from voting or rewards. Bond distribution follows UMA/Polymarket pattern.

**Bond flow:**
- Dispute rejected → disputer's bond: 75% to proposer, 25% to treasury.
- Dispute upheld → proposer's bond: 75% to disputer, 25% to treasury.
- Correct voters earn rewards from slash pool (separate from bonds).

**Rationale:** RT-002 originally proposed excluding proposer from bond rewards. Phase 1 red team (P1-002) showed this is unenforceable on-chain — attacker uses separate addresses. UMA and Polymarket do NOT exclude proposers. The real defense is the 65% SPAT threshold: controlling outcomes requires >65% of staked SUFFER, which must cost more than any single market's payout. This is an economic defense, not a technical one.

**Security model:** "On-chain voting cannot prevent a whale who controls >65% of stake from controlling outcomes. The defense is economic: acquiring and risking that much SUFFER must cost more than any single market's payout."

### 4.6 Integration with Existing Contracts

The SDVM replaces the current `cast_vote` + `try_resolve_dispute` flow. The existing `file_dispute` stays almost unchanged — it just creates an `SDVMVoteRound` instead of accepting direct votes.

**Migration path (non-breaking):**

1. Add new module: `pm_sdvm.move` — contains all SDVM logic (commit, reveal, tally)
2. Add new module: `pm_staking.move` — contains staking pool + position management
3. Modify `pm_dispute.move`:
   - `file_dispute` → also creates and shares an `SDVMVoteRound`
   - Remove `cast_vote` (replaced by `commit_vote` + `reveal_vote` in pm_sdvm)
   - `try_resolve_dispute` → reads from SDVMVoteRound instead of PMDispute.votes
4. Add new constants to `pm_rules.move`:
   - `VOTE_PHASE_COMMIT: u8 = 0`
   - `VOTE_PHASE_REVEAL: u8 = 1`
   - `VOTE_PHASE_TALLY: u8 = 2`
   - `VOTE_PHASE_SETTLED: u8 = 3`
5. Add SDVM config fields to `PMConfig` via `pm_registry.move`

**What stays the same:**
- `file_dispute` bond mechanics (already correct)
- `timeout_dispute` (still applies — if no quorum after max_rolls)
- `close_dispute_on_invalid` (still applies)
- Bond distribution logic (with D2 modifications above)
- Market state transitions (DISPUTED → RESOLVED / INVALID)

### 4.7 Staking Pool & Cooldown (D6: 48h Default, Dispute-Aware)

```move
public fun stake(
    stake_pool: &mut SufferStakePool,
    coin: Coin<SUFFER>,
    stake_epoch: u64,                       // Current epoch
    ctx: &mut TxContext,
) -> SufferStakePosition {
    // Assert: coin.value >= min_stake_amount
    // Create owned SufferStakePosition
    // Add to stake_pool.total_staked
    // Note: Voter cannot vote in the epoch they staked (anti-frontrun)
}

public fun initiate_unstake(
    stake_position: &mut SufferStakePosition,
    ctx: &TxContext,
) {
    // Set unstake_initiated_at_ms = now()
    // Voter must wait 48h before completing unstake
    // Stake remains slashable during cooldown
}

public fun complete_unstake(
    stake_pool: &mut SufferStakePool,
    stake_position: SufferStakePosition,
    clock: &Clock,
    ctx: &TxContext,
) -> Coin<SUFFER> {
    // Assert: 48h have elapsed since initiate_unstake()
    // Assert: pending_dispute_ids is empty (no pre-filed disputes still open)
    // Return coin with updated staked_amount (after any slashing)
}

public fun emergency_unstake(
    stake_pool: &mut SufferStakePool,
    stake_position: SufferStakePosition,
    clock: &Clock,
    ctx: &TxContext,
) -> Coin<SUFFER> {
    // Immediate withdrawal, no 48h cooldown
    // Penalty: 5% of staked_amount
    // Returned coin = staked_amount * 0.95
    // Stake remains slashable for disputes filed before emergency_unstake() call
}
```

**Key mechanics:**
- **Default cooldown: 48 hours** (not 7 days) — balances attack prevention with player capital mobility
- **Dispute-aware completion:** Cannot complete unstake while disputes filed before `unstake_initiated_at_ms` are still open
- **Slashing during cooldown:** Stake is slashable for any disputes filed before cooldown began
- **Emergency unstake:** 5% penalty, immediate, still slashable for pending disputes — for players who need capital back urgently
- **Post-cooldown safety:** Only after cooldown AND all pre-filed disputes resolve can the full balance be withdrawn

### 4.8 Resolution Tiers (Unchanged from v1)

```
Tier 1: Orchestrator Auto-Resolution
  └─ resolve_deterministic() via SnapshotRecord
  └─ No human involvement. On-chain data. Undisputable facts.
  └─ Dispute window still applies (safety net)

Tier 2: Declared-Source Resolution
  └─ resolve_declared() via PMVerifierCap
  └─ Trusted verifier submits outcome + evidence hash
  └─ Dispute window applies
  └─ If disputed → Tier 3

Tier 3: SDVM — SUFFER-Staked Tokenholder Vote
  └─ Commit-reveal voting by SUFFER stakers
  └─ Economically incentivized (slash wrong, reward right)
  └─ Schelling point convergence
  └─ This is the terminal dispute resolution — no further escalation

Tier 4 (emergency only): Multisig Emergency Invalidation
  └─ 2-of-3 multisig can force-invalidate
  └─ Requires on-chain reasoning hash
  └─ All bonds returned (not anyone's fault)
  └─ Nuclear option. Documented. Auditable.
```

---

## 5. Sui-Specific Advantages Over UMA

### 5.1 Sponsored Voting
Gas relay sponsors vote transactions. SUFFER stakers don't need SUI. This is a massive UX win — on Ethereum, UMA voters need ETH for gas, which is a barrier. We eliminate it.

### 5.2 Two-Level Architecture
Owned SDVMCommitRecord (one per voter per round) eliminates commit-phase contention. Commit throughput is unlimited. Reveals still touch shared SDVMVoteRound, but only during reveal phase and only once per voter.

### 5.3 Sub-Second Finality
Sui's ~400ms finality means commit and reveal transactions are confirmed nearly instantly. UMA on Ethereum has ~12s block times and potential reorgs. Our voters get immediate confirmation.

### 5.4 No MEV
Sui's object-based execution model doesn't have the same MEV extraction vectors as EVM. Validators can't frontrun reveals or sandwich vote transactions.

---

## 6. Attack Vectors + Mitigations

### 6.1 Last-Revealer Advantage
**Attack:** Wait until the last moment of reveal phase, see all other reveals, then reveal strategically.
**Mitigation:** Commit-reveal prevents this. You committed your vote in the commit phase — you can't change it during reveal. If you don't reveal, you're slashed 10x.

### 6.2 Whale Domination
**Attack:** Single entity stakes 51% of SUFFER and controls all votes.
**Mitigation:**
- SPAT (65%) means you need supermajority, not simple majority
- Slashing means wrong votes cost real money even for whales
- Long-term: governance can adjust SPAT upward
- Transparency: all stakes and votes are on-chain, visible

### 6.3 Vote Buying
**Attack:** Off-chain coordination to buy votes.
**Mitigation:**
- Commit-reveal means you can't prove how you voted (salt is secret until reveal)
- Vote buying requires trust that the bribed voter actually voted as promised — but they can't prove it until reveal, by which time it's too late to withhold payment
- This is an unsolved problem in all voting systems. UMA has it too. The economic incentive (slashing) makes it more expensive.

### 6.4 Sybil Attack on Staking
**Attack:** Split stake across many addresses to avoid per-address slashing caps.
**Mitigation:** Slashing is proportional to stake, not per-address. Splitting doesn't help — 100 addresses with 10 SUFFER each get slashed identically to 1 address with 1000 SUFFER.

### 6.5 Grief Attack — Dispute Everything
**Attack:** Dispute every market to force expensive SDVM votes.
**Mitigation:** Dispute bond. Currently required by `file_dispute`. If dispute is rejected, disputer loses bond. Cost of griefing scales linearly with number of disputes.

### 6.6 Staker Apathy (Fixed by D1)
**Attack:** Nobody votes — quorum never met — all markets stuck.
**Mitigation:**
- Opt-in slashing (D1): Stakers who don't commit are never slashed. No compulsion.
- Decreasing GAT (D8): Round 1 = 5%, Round 2 = 3%, Round 3 = 1%. Even with mass abstention, round 3 only needs 1% participation.
- Reward distribution: Voting is profitable if you're correct
- After max_rolls + hard deadline, market goes INVALID — players get pro-rata refunds, not stuck forever
- Permissionless phase transitions: Bot or anyone can advance phases, so system never hangs

### 6.7 Oracle Manipulation for Game Outcomes
**Attack:** Manipulate in-game state to control deterministic resolution.
**Mitigation:** This is Tier 1 (orchestrator), not SDVM. If someone disputes a Tier 1 resolution, SDVM voters can see the on-chain snapshot and vote accordingly. The game state is verifiable — the SDVM vote is about "did the orchestrator read it correctly," not "what should have happened."

### 6.8 Proposer Self-Dealing (Accepted Risk per D2)
**Attack:** Proposer stakes heavily, proposes false outcome, votes for it, collects bond + slash rewards.
**Mitigation:** Economic defense only. Controlling the outcome requires >65% of staked SUFFER (SPAT). Acquiring that much SUFFER must cost more than any single market's payout. Address-based exclusion is unenforceable (attacker uses separate address). UMA and Polymarket take the same approach — no proposer exclusion.

### 6.9 All-Abstain DoS (Fixed by D1)
**Attack:** Coordinate all stakers to abstain (commit ABSTAIN hash). No outcome reaches quorum. Markets stuck forever.
**Mitigation:**
- Abstention is free (no slash, no reward) — but doesn't resolve the market
- Decreasing GAT (D8): Each roll needs less participation
- Hard 7-day deadline: Even with total apathy, market becomes INVALID after 7 days
- Market INVALID → pro-rata refunds to all participants
- System never gets stuck indefinitely

### 6.10 Cooldown Exploit (Fixed by D6)
**Attack:** Stake, vote, immediately unstake before slash is applied.
**Mitigation:**
- 48h cooldown: Stake must age before unstaking
- Dispute-aware: Can't complete unstake while pre-filed disputes are open
- Slashing during cooldown: Stake is slashable for disputes filed before cooldown began
- Stakes cannot escape post-hoc slashing

---

## 7. Implementation Plan

Detailed implementation plan is maintained in the master document: `/sessions/focused-adoring-dirac/mnt/Frontier-brain/SDVM_IMPLEMENTATION_PLAN.md`

**Summary of phases:**

### Phase 1: Spec Redesign (Week 1-3)
- All D1-D10 design decisions finalized
- Detailed spec (SUFFER_DVM_SPEC_v2.md) ✓ (this document)
- Parameter matrix for testnet phases
- God lever removal criteria

### Phase 2: Implementation (Week 3-8)
- Team Bravo: Sui Move contracts (pm_staking, pm_sdvm, integration)
- Team Charlie: Frontend (staking UI, voting UI, salt management)
- Team Delta: Ops infrastructure (phase transition bot, monitoring)

### Phase 3: Testnet Stress Testing (Week 8-16)
- Team Echo: QA, attack simulations, 3 red team cycles
- Parameter tuning based on live data
- God lever removal tracking

### Phase 4: Mainnet Readiness (Week 16-20)
- Parameter finalization
- God lever removal (for levers that passed criteria)
- Final red team
- Legal review + governance vote
- Deploy

---

## 8. Open Questions (Now Resolved)

### Q1: Unstaking Cooldown ✓
**Recommendation:** 48 hours (D6). Matches gaming market liquidity needs while preventing atomic stake-vote-unstake attacks. Dispute-aware completion adds additional safety.

### Q2: Slash Rate Tuning ✓
**Recommendation:**
- Mainnet: 0.1% wrong vote, 1% non-reveal (matches UMA calibration)
- Testnet: Progressive from T1 (0%) → T2 (0.05%/0.5%) → T3 (0.1%/1%)
- Use god lever AdminSlashOverride to adjust during learning phase

### Q3: GAT Bootstrapping ✓
**Recommendation:** Decreasing per round (D8): 5% → 3% → 1%. Auto-scales with staked supply and ensures eventual resolution without admin override after round 1.

### Q4: Should Tier 1 (Orchestrator) Resolution Be Disputable via SDVM? ✓
**Recommendation:** Yes. SnapshotRecord is on-chain — voters can verify it trivially. This maintains the principle that every resolution is challengeable. Higher dispute bond for Tier 1 can be a deterrent if needed.

### Q5: Reward APY Communication ✓
**Recommendation:** APY depends on vote frequency × slash rate × participation. Model it on testnet before committing to a number. Testnet goal: >10% APY for consistent voters (attracts stakers); Mainnet: let it emerge naturally from the mechanism.

### Q6: Dispute Frequency Estimate
**Assumption:** 5-20 disputes/week initially. Design accommodates this range. If higher, god lever AdminSlashOverride buys time to adapt.

### Q7: Initial Staker Pool
**Recommendation:** The orchestrator seeds 20% of initial staking pool with non-voting lockup. Provides economic depth without voting influence.

---

## 9. What This Means for Liability

With SDVM in place:

- **Tier 1 (Orchestrator):** The orchestrator provides the oracle. Resolution is verifiable against on-chain snapshots. If someone disputes and SUFFER stakers uphold it — the community verified it, not the orchestrator.
- **Tier 2 (Declared Source):** A trusted verifier (could be the orchestrator, could be a third party) provides the outcome. Disputable via SDVM.
- **Tier 3 (SDVM):** Pure tokenholder vote. The orchestrator has no special role. Schelling point + economic incentives drive truth-seeking. Liability is distributed across all stakers.
- **Tier 4 (Emergency):** Requires 2-of-3 multisig to invalidate (D10). On-chain reasoning required. All bonds returned. This is a safety net, not a resolution mechanism. Liability is minimal — everyone gets their money back.

**The critical shift:** **No single entity is deciding who wins or loses a bet.** Either the game data decides (Tier 1), a verifiable third party decides (Tier 2), or the community decides (Tier 3). Fallback is a nuclear "refund everyone" button (Tier 4) that requires multisig consensus and on-chain reasoning.

---

## Appendix A: Parameter Reference

### Testnet Phases

| Parameter | T1: Training | T2: Light | T3: Real | T4: Mainnet |
|-----------|-------------|----------|---------|------------|
| **Commit phase** | 2h | 4h | 12h | 12h |
| **Reveal phase** | 2h | 4h | 12h | 12h |
| **Expedited flag** | N/A | 2h/2h | 4h/4h | 4h/4h |
| **GAT (Round 1)** | 1% staked | 3% staked | 5% staked | 5% staked |
| **Slash (wrong vote)** | 0% | 0.05% | 0.1% | 0.1% |
| **Slash (non-reveal)** | 0% | 0.5% | 1% | 1% |
| **SPAT** | 60% | 65% | 65% | 65% |
| **Max rolls** | 2 | 2 | 2 | 3 |
| **Hard deadline** | 7 days | 7 days | 7 days | 7 days |
| **Unstake cooldown** | 1h | 24h | 48h | 48h |
| **Min stake amount** | 10 SUFFER | 100 SUFFER | 1000 SUFFER | 1000 SUFFER |

### Mainnet Parameter Reference

| Parameter | Value | Notes |
|---|---|---|
| Slash rate (wrong vote) | 0.1% per vote | Matches UMA |
| Slash rate (non-reveal) | 1.0% per vote | 10x penalty for not revealing |
| Abstention slash | 0% | Opt-in model: no penalty for passive stakers |
| Commit phase | 12 hours | Default |
| Reveal phase | 12 hours | Default |
| Commit phase (expedited) | 4 hours | For time-sensitive markets |
| Reveal phase (expedited) | 4 hours | For time-sensitive markets |
| GAT Round 1 | 5% of staked SUFFER | Configurable per market |
| GAT Round 2 | 3% of staked SUFFER | Auto-decreases |
| GAT Round 3 | 1% of staked SUFFER | Auto-decreases |
| SPAT | 65% agreement | Supermajority required |
| Max rolls | 3 | After 3 rolls → INVALID |
| Hard deadline | 7 days | Absolute cap from dispute filing |
| Unstake cooldown | 48 hours | After initiate_unstake() |
| Dispute bond | Per market | Configured in PMConfig |
| Bond split (winner) | 50% to voters | Pro-rata by stake weight |
| Bond split (protocol) | 50% to treasury | 50% to treasury |
| Proposer bond reward | Same as any voter | D2: Economic defense via SPAT, no exclusion |
| Phase transition reward | 0.1% of slash pool | Caller of tally_votes() |
| Min stake amount | Configurable | Default 1000 SUFFER |

---

## Appendix B: Hash Construction (Client-Side)

**Critical:** Hash construction must use BCS (Binary Canonical Serialization) for determinism.

```typescript
// Client-side vote commitment builder
import { bcs } from '@mysten/sui/bcs';
import { sha3_256 } from '@noble/hashes/sha3';

function buildVoteCommitment(outcome: number, salt: Uint8Array): Uint8Array {
  // Serialize outcome as u16 using BCS
  const outcomeBytes = bcs.u16().serialize(outcome);

  // Preimage = serialized_outcome ++ salt_bytes
  const preimage = new Uint8Array(outcomeBytes.length + salt.length);
  preimage.set(outcomeBytes, 0);
  preimage.set(salt, outcomeBytes.length);

  // SHA3-256 (matches std::hash::sha3_256 in Move)
  return sha3_256(preimage);
}

function buildAbstentionHash(salt: Uint8Array): Uint8Array {
  // Abstention outcome = 65535 (u16::MAX)
  return buildVoteCommitment(65535, salt);
}

// Salt should be 32 random bytes
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// BIP39 seed recovery (optional escrow backup)
function deriveSaltFromSeed(seed: string, disputeId: string): Uint8Array {
  // 1. Convert 12-word BIP39 seed to 128-bit entropy
  // 2. HKDF-SHA256(entropy, disputeId) -> 32 bytes
  // This allows recovering salt from seed phrase
}
```

**Test Vectors (20 vectors for parity validation):**

| Outcome | Salt (hex) | Expected Hash (hex) | Notes |
|---------|-----------|-------------------|-------|
| 0 | 0000...0000 | [computed] | Outcome 0 with zero salt |
| 1 | 0000...0001 | [computed] | Outcome 1 with zero+1 salt |
| 65535 (abstain) | 0000...0000 | [computed] | Explicit abstention |
| ... | ... | ... | 17 more vectors |

Move tests must validate these same vectors using `bcs::to_bytes(&outcome)` + `sha3_256`.

---

## Appendix C: Testnet Parameter Schedule

This table maps weeks to testnet phases, parameter changes, and success criteria.

| Phase | Weeks | Commit | Reveal | GAT | SPAT | Slash (Wrong) | Slash (Non-Reveal) | Unstake | Max Rolls | Success Criteria |
|-------|-------|--------|--------|-----|------|---------------|--------------------|---------|-----------|--------------------|
| **T1: Training Wheels** | 8-10 | 2h | 2h | 1% staked | 60% | 0% | 0% | 1h | 2 | 10+ disputes resolve. Voters learn the flow. Zero hash mismatches. Salt recovery works. |
| **T2: Light Incentives** | 10-12 | 4h | 4h | 3% staked | 65% | 0.05% | 0.5% | 24h | 2 | 30+ disputes. >40% participation. APY measurable. No stuck disputes. |
| **T3: Real Stakes** | 12-14 | 12h | 12h | 5% staked | 65% | 0.1% | 1% | 48h | 2 | 50+ disputes. >50% participation. Attack simulations. God lever usage <5%. |
| **T4: Mainnet Candidate** | 14-16 | 12h | 12h | 5% staked | 65% | 0.1% | 1% | 48h | 3 | 50+ disputes. >60% participation. Zero god lever usage. Zero exploits. |

---

## Appendix D: Design Decision Tracking

All design decisions from SDVM_IMPLEMENTATION_PLAN.md Section 3 are tracked below:

| Decision | Section | Status |
|----------|---------|--------|
| **D1: Opt-in slash** | 4.4 | ✓ Implemented |
| **D2: Proposer not excluded (economic defense)** | 4.5 | ✓ Implemented |
| **D3: Two-level architecture** | 4.1, 4.3 | ✓ Implemented |
| **D4: BCS hash** | 4.3, Appendix B | ✓ Implemented |
| **D5: Phase timing** | 4.2, Appendix A | ✓ Implemented |
| **D6: Cooldown** | 4.7 | ✓ Implemented |
| **D7: No tie-breaker** | 4.2, 4.4 | ✓ Implemented |
| **D8: Decreasing GAT** | 4.4, Appendix A | ✓ Implemented |
| **D9: Permissionless phase transitions** | 4.3 | ✓ Implemented |
| **D10: Multisig emergency** | 4.8 | ✓ Implemented |

