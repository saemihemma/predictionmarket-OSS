# Prediction Market Platform — Unified Architecture Document

**Document role:** Architecture + code navigation handover for agents onboarding to live implementation.
**Priority of truth:** On-chain code > this document > older specs.
**Line references:** Navigational aids via semantic anchors (function names), not stable API guarantees.

**Status:** Live (testnet)
**Last Updated:** 2026-03-18
**Blockchain:** Sui (Move 2024 edition)

---

## 1. What This Is

**Product:** Community-built on-chain prediction market on Sui. Traders buy/sell outcome shares via constant-product AMM. Disputes resolved by staker voting.

**Core Stack:**
- **On-chain:** 18 Move modules (shared + owned objects)
- **Off-chain:** Gas relay (sponsors voting), phase bot (advances phases)
- **Token:** SUFFER (SFR), 2 decimals, 10M supply

**Who Uses It:**
1. Market creators (risk creation bond)
2. Traders (buy/sell outcome shares)
3. Winners (claim 1:1 payout)
4. Losers on invalid markets (pro-rata refund)
5. Stakers (vote on disputes; earn/slash)

---

## 2. System Architecture

### Three-Tier Runtime

```
┌──────────────────────────────────────┐
│ Frontend (React + TypeScript)        │
│ Market UI, trading, voting/staking   │
└──────────────┬───────────────────────┘
               │ JSON-RPC + Sponsorship
┌──────────────▼───────────────────────┐
│ Off-Chain (Gas Relay, Phase Bot)     │
│ Validates txs, advances vote phases  │
└──────────────┬───────────────────────┘
               │ SUI Network
┌──────────────▼───────────────────────┐
│ On-Chain: 18 Move modules, 5 layers  │
│ • Shared: PMMarket, SDVMVoteRound    │
│ • Owned: PMPosition, SDVMCommitRec   │
└──────────────────────────────────────┘
```

---

## 3. On-Chain Modules (Move)

### Module Dependency Graph

```
TOKEN: suffer (SUFFER coin + treasury)

MARKET CORE:
  pm_market (lifecycle + pool)
  pm_trading (buy/sell/claim/refund)
  pm_math (CPMM pricing)
  pm_position (position tracking)

RESOLUTION:
  pm_resolution (3-tier entry points + community proposal)
  pm_dispute (bond + dispatch)
  pm_source (data source decls)

VOTING (see SDVM_ARCHITECTURE_PRINCIPLES.md):
  pm_sdvm (commit-reveal)
  pm_staking (stake pool + cooldown)

CONFIG:
  pm_registry, pm_policy, pm_treasury, pm_rules, pm_admin
```

### Layer 1: Token Foundation

**suffer.move** — SUFFER coin; manage treasury; gate minting

- **Key Objects:**
  - `SUFFER` (witness)
  - `SUFFERTreasury` (shared)
  - `SUFFERTreasuryCap` (owned, admin-gated)
  - `SUFFERAdminCap` (owned, admin-only)

- **Key Functions:**
  - `transfer_from_treasury(treasury, admin, amount, recipient)` — Admin withdraws SFR
  - `take_from_treasury(treasury, amount)` → Balance — Package-internal
  - `deposit_to_treasury(treasury, funds)` — Package-internal

- **Dependencies:** None (base layer)

---

### CRITICAL: Pool Reserve Model (AMM) [Concept]

**outcome_quantities[i] = pool reserve of outcome i, NOT cumulative shares bought.**

**Product CPMM Invariant:** Π(reserve[i]) = k (constant product of all reserves).

**On buy(outcome_index, amount):**
- Pool reserve of bought outcome: `reserve[i] -= amount` (shares leave pool)
- Buyer cost: `cost = ⌈Π(reserve[j for j≠i]) × amount / (reserve[i] - amount)⌉` (ceiling, solvency)
- Cost enters pool as virtual shares of other outcomes (in expectation)

**On sell(outcome_index, amount):**
- Pool reserve of sold outcome: `reserve[i] += amount` (shares return to pool)
- Seller proceeds: `proceeds = ⌊Π(reserve[j for j≠i]) × amount / (reserve[i] + amount)⌋` (floor, protection)

**[Implementation Anchor]**
- Buy: `pm_trading.move::buy()` [reserve update, lines 144-146]
- Sell: `pm_trading.move::sell()` [reserve update, line 264 onward]
- Binary formula (optimized): `pm_math.move::cp_buy_cost()` [lines 120-130]
- N-outcome formula: `pm_math.move::cp_buy_cost()` [lines 131-141] with `compute_product_except()` helper [lines 249-261]

---

### Layer 2: Market Core [Concept]

**pm_market.move::create_market()** — Market lifecycle, embedded pool

- **PMMarket (shared):** Immutable terms (creator, title, outcomes). Mutable state (state, frozen, pool reserves, accrued fees, collateral).
- **Key States:** OPEN → CLOSED → RESOLUTION_PENDING → RESOLVED/INVALID/DISPUTED
- **Pool Functions:** `add_outcome_quantity`, `sub_outcome_quantity`, `deposit_collateral`, `withdraw_collateral` [pm_market.move, lines 453-495]
- **Admin:** `freeze_if_needed` (one-way, after first trade) [pm_market.move::freeze_if_needed(), lines 304-311]

**pm_trading.move** — Buy, sell, claim, refund [Implementation Anchor]

- `buy()` [lines 84-182] → PMPosition
- `sell()` [lines 210-289] → Proceeds
- `claim()` [lines 295-351] → Payout (1 SFR per winning share, minus settlement fee)
- `refund_invalid()` [lines 359-399] → Pro-rata: `(cost_basis / total_basis) × snapshot`
- **Design:** Fees accrue in market, not treasury (minimize contention). Sweep is permissionless [lines 419-427].

**pm_math.move** — Pure CPMM pricing [Implementation Anchor]

- `compute_buy_cost()` [lines 20-27, delegates to cp_buy_cost] → cost (ceiling division)
- `compute_sell_proceeds()` [lines 31-38, delegates to cp_sell_proceeds] → proceeds (floor division)

**pm_position.move** — User position tracking (owned, zero contention)

- `PMPosition`: market_id, owner, outcome_index, quantity, net_cost_basis
- `create`, `merge`, `reduce`, `destroy`

---

### Layer 3: Resolution & Dispute [Concept]

**pm_resolution.move** — Three-tier resolution [Implementation Anchor: lines 71-196]

- **Tier 1 (Deterministic):** `resolve_deterministic()` [lines 71-111] — On-chain state → outcome (e.g., YES if controller exists). Source of truth: on-chain snapshot, outcome is computable.
- **Tier 2 (Declared Source):** `resolve_declared()` [lines 116-152] — Verifier with PMVerifierCap proposes outcome. Legitimacy: verifier's off-chain research trusted by market creator.
- **Tier 3 (Creator Proposed):** `propose_resolution()` [lines 157-196] — Creator proposes outcome, opens dispute window (24h default). Legitimacy: creator has skin in game via bond; SDVM voting validates their claim.

**pm_dispute.move** — ⚠️ TWO SEPARATE TRANSACTIONS REQUIRED [Implementation Anchor]

**Transaction 1: File Dispute** [pm_dispute.move::file_dispute(), lines 198-267]
- `file_dispute(market, resolver_set, proposed_outcome, bond_coin, clock)` → PMDispute
- Market → DISPUTED; PMDispute shared
- ⚠️ CRITICAL: SDVM round NOT created yet — caller MUST call `create_and_share_sdvm_vote_round()` in next transaction or voting becomes impossible

**Transaction 2: Initiate Voting (separate tx REQUIRED)** [pm_dispute.move::create_and_share_sdvm_vote_round(), lines 323-332]
- Disputer (or anyone) calls: `create_and_share_sdvm_vote_round(dispute, stake_pool, expedited, clock)`
- SDVMVoteRound created and shared; Phase = COMMIT
- For full voting lifecycle, see SDVM_ARCHITECTURE_PRINCIPLES.md

**Dispute Resolution Paths (Coexist):**
- **Path A (Appointed Resolvers):** PMResolverSet votes via `cast_vote()` [lines 459-488], quorum → `try_resolve_dispute()` [lines 491-680]
- **Path B (SDVM Tokenholder Vote):** After round settles, `resolve_from_sdvm()` [lines 351-454] distributes bonds. Primary path going forward.

**pm_source.move** — Data source declarations

---

### Layer 4 & 5: Voting, Staking, Configuration

For **SDVM voting lifecycle, slash formulas, and god levers**, see **SDVM_ARCHITECTURE_PRINCIPLES.md**.

**pm_registry.move** — Config (trading_fee_bps, settlement_fee_bps, bonds, timings)
**pm_policy.move** — Market type + resolver policies
**pm_treasury.move** — Fee/bond accumulation
**pm_rules.move** — Constants, enums, validators

---

## 4. Extension Points & Limitations

### Supported Market Types [Implementation Anchor]

- **Binary (2 outcomes):** OPEN, trading active. CPMM: `cost = ⌈R_other × amount / (R_target - amount)⌉`
- **Categorical (N≤16 outcomes):** OPEN, trading active. Same CPMM formula generalized: `cost = ⌈Π(R_i for i≠target) × amount / (R_target - amount)⌉`
- **Bucketed Scalar (N≤32 buckets):** Declared, trading ready (uses categorical math).

⚠️ **OVERFLOW CONSTRAINT:** The product `Π(R_i)` uses u128 intermediates in Move. For N>4 outcomes with large reserves (>10^4 base units per outcome), the product may overflow. Safe operating ranges: N=2-4 (any reserves), N=5-8 (reserves ≤ 10,000), N=9-16 (reserves ≤ 1,000). Frontend BigInt has no overflow limit. Categorical CPMM is fully implemented and tested.

**Constants** [pm_rules.move, lines 80-81]:
- `MAX_OUTCOMES_CATEGORICAL: u16 = 16`
- `MAX_OUTCOMES_SCALAR_BUCKETS: u16 = 32`

**Implementation** [pm_math.move]:
- Single unified path for all N≥2 using direct product formula
- `compute_product_except_iterative()` computes Π(R_i for i≠j) in u128
- Ceiling division on buy (solvency), floor on sell (protection)

---

## 5. Key Flows (End-to-End)

### Flow 1: Create Market

1. User calls `pm_market::create_market(...)` with title, close_time, outcome_labels
2. On-chain: Registry paused? No. Policy constraints met? Yes. Outcomes == 2? Yes.
3. PMMarket created: state = OPEN, frozen = false, outcome_quantities = [100, 100]
4. Creation bond escrowed

### Flow 2: Buy Shares

1. Frontend calls `amm.ts::computeBuyCost(outcome_quantities, outcome_index, amount)` (mirrors pm_math::cp_buy_cost)
2. User approves cost + fee
3. Calls `pm_trading::buy(market, outcome_index, amount, max_cost, payment)`
4. On-chain:
   - Market OPEN? Close time not passed? Not paused? Yes to all.
   - Freeze market if first trade
   - Cost = `⌈reserve_other * amount / (reserve_bought - amount)⌉`
   - Fee = `ceil(cost * 25bps)`, min 1 SFR
   - Assert: `payment >= cost + fee`
   - Update pool: `reserve[bought] -= amount`, `reserve[other] += cost`
   - Accrue fee to market (not treasury)
   - Create/merge PMPosition
   - Emit TradeExecutedEvent

### Flow 3: Resolve (No Dispute) [Concept]

**Path A: Creator Resolution (Priority Window)**

1. Within 24h after close_time, creator calls `pm_resolution::propose_resolution()` [pm_resolution.move:163-202]
2. Market → RESOLUTION_PENDING; dispute_window_end = now + pm_market::dispute_window_ms(market)
3. After dispute window (no dispute filed), anyone calls `pm_resolution::finalize_resolution()` [pm_resolution.move:207-230]
4. Market → RESOLVED
5. Winners: `pm_trading::claim()` [pm_trading.move:295-351] → 1 SFR per share, minus settlement fee
6. Losers: nothing
7. Creator: `pm_trading::return_creator_bond()` [pm_trading.move:434-459] → bond returned
8. Anyone: `pm_trading::sweep_fees()` [pm_trading.move:419-427] → fees → PMTreasury

**Path B: Community Resolution (After Priority Window Expires)**

1. If creator doesn't propose within 24h of close_time, priority window expires
2. Anyone can now call `pm_resolution::propose_community_resolution()` [pm_resolution.move:251-313]
3. Community proposer posts a bond equal to the creation bond
4. Market → RESOLUTION_PENDING; dispute_window_end = now + pm_market::dispute_window_ms(market)
5. Same dispute/finalization flow applies
6. If resolution is not disputed (or dispute rejected): proposer's bond returned + reward (50% of creator's bond)
7. If resolution is disputed and upheld: proposer loses bond (75% to disputer, 25% to treasury)

### Flow 4: Dispute Resolution (SDVM) [Concept]

**⚠️ TWO SEPARATE TRANSACTIONS REQUIRED:**

**Tx 1: File Dispute** [pm_dispute.move::file_dispute(), lines 198-267]
1. Disputer calls `file_dispute(market, resolver_set, proposed_outcome, bond_coin)`
2. Market → DISPUTED
3. PMDispute created and shared; ⚠️ CRITICAL: SDVM round NOT created yet — MUST call create_and_share_sdvm_vote_round() in Tx 2

**Tx 2: Initiate Voting (REQUIRED second transaction)** [pm_dispute.move::create_and_share_sdvm_vote_round(), lines 323-332]
1. Disputer (or anyone) calls `create_and_share_sdvm_vote_round(dispute, stake_pool, expedited=false)`
2. SDVMVoteRound created and shared; Phase = COMMIT; deadline = now + 12h (or 4h if expedited)

SDVM voters can vote for any outcome (0 to outcome_count-1) or explicitly abstain (outcome = 0xFFFF / 65535). Abstain votes are not slashed, not rewarded, and excluded from GAT/SPAT quorum calculations. For full COMMIT/REVEAL/TALLY lifecycle, see **SDVM_ARCHITECTURE_PRINCIPLES.md**.

Final outcome [pm_dispute.move::resolve_from_sdvm(), lines 351-454]:
- If SDVM outcome == proposed: market → INVALID (proposer bond 75% to disputer / 25% to treasury; if community proposal, 75% to disputer, 25% to treasury)
- If SDVM outcome != proposed: market → RESOLVED with original outcome (disputer bond 75% to proposer / 25% to treasury)

### Flow 4b: Creator Abandonment Protection (Community Resolution) [Concept]

**Problem:** Creator-proposed resolution markets incentivize creators to abandon resolution if their bet losses exceed the creation bond. In this case:
- Creator knows resolution will go INVALID (everyone gets refunds)
- Creator only loses the bond, not the additional loss from being resolved against
- If they don't propose, market times out and becomes INVALID, cost = bond only

**Solution: Community Resolution with 24-Hour Creator Priority Window**

The 24-hour creator priority window prevents abandonment:

1. **Creator Priority (0-24h after close):** Only creator can propose via `propose_resolution()` [pm_resolution.move:163-202]
2. **Community Fallback (24h-72h after close):** Any SUFFER holder can propose via `propose_community_resolution()` [pm_resolution.move:251-313]
3. **Market Invalidation (after 72h):** If no proposal submitted, market becomes INVALID, creator forfeits bond to treasury

**Community Proposer Incentives:**
- **Proposer Bond:** Must post amount >= creation bond
- **If Correct (undisputed):** Bond returned + 50% of creator's bond as reward
- **If Incorrect (dispute upheld):** Proposer loses bond (75% to disputer, 25% to treasury)

**Economics:**
- **Before:** Creator abandons if losing → market times out INVALID → creator loses bond only → no resolution closure
- **After:** Community proposer steps in → gets rewarded for correct proposals → creator can't force INVALID by abandoning → market resolves, traders get closure
- **Prevents:** Creator abandonment exploit by making it unprofitable to not propose (community will do it and be rewarded)

### Flow 5: Invalid Market Refund

1. Position holder calls `pm_trading::refund_invalid(market, position)`
2. Computes: `refund = (cost_basis / total_cost_basis) × snapshot_collateral`
3. Transfers SFR to holder
4. Why pro-rata? Prevents bank-run (early claimers can't drain pool)

---

## 6. Token Economics (SUFFER) [Concept]

- **Supply:** 10M SFR (2 decimals)
- **Creation Bonds** [pm_registry.move]: CANONICAL 1k, SOURCE_BOUND 500, CREATOR_RESOLVED 100, EXPERIMENTAL 10 (refunded on normal resolution; forfeited on invalid)
- **Trading Fee:** 25 bps (0.25%), min 1 SFR [pm_trading.move::buy(), line 117]
- **Settlement Fee:** 10 bps (0.1%) on gross payout [pm_trading.move::claim(), line 319]
- **Dispute Bond:** 50 SFR [pm_registry.move] (forfeited if dispute rejected, distributed per D2)
  - **75/25 Bond Distribution Rationale:** 75% to winner / 25% to treasury. Chosen to strongly incentivize correct proposals during bootstrap; UMA uses 50/50, we're more generous to correct parties.
- **Staking:** No minimum, 48h cooldown [pm_staking.move, line 68], emergency unstake 5% penalty [pm_staking.move, line 69]

### Fee Flow [Implementation Anchor]

**Trading fees** → accrue to market [pm_trading.move:134, 274] → `sweep_fees()` [pm_trading.move:419-427] → PMTreasury
**Dispute bonds** (forfeited) → `resolve_from_sdvm()` [pm_dispute.move:351-454] distributes per D2 (75% winner / 25% treasury)
**Emergency penalties** (5% from emergency unstake) → pool.pending_slash [pm_staking.move:365-366] (voters claim as rewards)

---

## 7. Design Principles & Trust Boundaries

### **Trust Hierarchy** [Concept]

On-chain code is the source of truth. When this document and code diverge, **code wins**. Update this doc and flag for review.

### **Economic Security Over Technical Enforcement** [Concept]

⚠️ **ATTACK COST CAVEAT:** Controlling outcomes requires **65% of PARTICIPATING stake** (not total stake). If only 10% of staked SUFFER votes, attacking costs just 6.5% of total stake. **GAT thresholds (5%→3%→1% per roll) are the defense** — they ensure minimum participation before outcomes count. Low participation is a system risk; monitor voter engagement.

**Evidence:** pm_sdvm.move, pm_staking.move slash formulas [pm_staking.move:416-442]. 65% supermajority (SPAT) applies only to revealed votes.

### **Off-Chain Trust Boundaries** [Concept]

**Gas relay & phase bot are off-chain services. What they can/cannot do:**

| Action | Can Do? | Constraint |
|--------|---------|-----------|
| Sponsor voting transactions | ✓ Yes | Whitelist only (cannot forge) [pm_trading.move:419, etc] |
| Advance voting phases | ✓ Yes | Permissionless (anyone can call after deadline) |
| Forge votes | ✗ No | Requires SDVMCommitRecord (owned, only voter has) |
| Skip phase transitions | ✗ No | Permissionless; anyone can advance phases |
| Manipulate tally | ✗ No | Revealed vote hashes verified on-chain |

**Malicious relay → only denial of service (refuses to sponsor). Malicious bot → only delays (anyone else advances phases).**

### **Design Patterns** [Concept]

1. **Owned objects for writes, shared for reads** — PMMarket, SufferStakePool (shared, read-heavy) vs. PMPosition, SDVMCommitRecord (owned, zero contention)
2. **Two-level voting** — Owned commits + shared round = 100+ concurrent voters
3. **Fee accumulation in market** — Avoid treasury contention; sweep is batched and permissionless
4. **Pro-rata refunds** — Prevents bank-run on invalid markets
5. **Ceiling/floor division** — Buy (ceiling) ensures solvency; sell (floor) protects remaining holders

---

## 8. Quick Reference

**For SDVM voting lifecycle, god levers, testing procedures:** See **SDVM_ARCHITECTURE_PRINCIPLES.md**

**Testnet Phases:** T1 (training: 0% slash, 2h phases) → T2 (light: 0.05% slash, 4h phases) → T3 (real: 0.1% slash, 12h phases, defaults) → T4 (mainnet candidate: same as T3, stability proving). Phase transitions adjust slash rates via AdminSlashOverride god lever, not code changes.

**State Transitions (on-chain):**
- Market: OPEN → CLOSED → RESOLUTION_PENDING → {RESOLVED, INVALID, DISPUTED}
- Dispute: OPEN → {UPHELD (market INVALID), REJECTED (market RESOLVED), TIMEOUT_INVALID}
- SDVM Round (see separate doc): COMMIT → REVEAL → TALLY → SETTLED

**Gas Relay:** Sponsors pm_trading, pm_resolution, pm_dispute, pm_staking, pm_sdvm calls (whitelist). Does NOT sponsor phase transitions or tally (caller earns).

**Phase Bot:** Monitors SDVMVoteRound deadlines; calls `advance_to_reveal_phase()` and `tally_votes()` automatically.

---
