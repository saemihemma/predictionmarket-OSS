# SDVM Attack Simulations — Track 2 Deliverables

**Phase:** Phase 3 Testing (Weeks 8-16)
**Track:** 2 — Attack Simulations
**Team:** Echo (Red Team / QA)
**Date:** 2026-03-17

---

## Overview

This directory contains executable attack simulation scripts and economic analysis for the SUFFER Decentralized Voting Mechanism (SDVM). The simulations validate that all 8 attack vectors identified in SDVM_PHASE3_TEST_PLAN.md Track 2 are successfully defended by the protocol's design.

**Key Result:** ✓ All attacks defended or economically unprofitable.

---

## Deliverables

### 1. attack-runner.ts — Executable Simulation Engine

**Purpose:** Simulate attacks against SDVM in a deterministic environment without on-chain execution.

**What It Does:**
- Creates a mock SDVM state with configurable pool depth and staker distribution
- Implements 8 attack scenarios with measurable outcomes
- Calculates attack cost, reward, and profit/loss
- Returns verdict: DEFENDED / PARTIALLY_DEFENDED / VULNERABLE

**Attacks Simulated:**
1. **Proposer Self-Voting (30% stake)** — Can proposer force outcome via self-dealing?
2. **All-Abstain DoS** — Can coordination stall the market indefinitely?
3. **Commit-and-Hide (non-reveal)** — Can attacker escape slash by hiding votes?
4. **Whale Domination (60% stake)** — Can whale with <65% force outcome?
5. **Cooldown Exploit** — Can staker unstake before slash is applied?
6. **Congestion Attack (relay load)** — Can spam consume relay budget?
7. **Double-Claim Drain (reentrancy)** — Can voter claim reward twice?
8. **Rate Limiter Bypass** — Can attacker exceed rate limits?

**How to Run:**
```bash
# Using Vitest
npm test -- attack-runner.ts

# Output: Attack results with verdicts and detailed analysis
```

**Expected Output:**
```
═══════════════════════════════════════════════════════════
SDVM ATTACK SIMULATION SUMMARY (Track 2)
═══════════════════════════════════════════════════════════

✓ Attack 1: Proposer Self-Voting (30% stake)
  Verdict: DEFENDED
  Cost: 3100, Reward: 0
  Details: 30% stake insufficient for 65% SPAT

✓ Attack 2: All-Abstain DoS
  Verdict: DEFENDED
  Details: Market rolled 2 times, then became INVALID

[... 6 more attacks ...]

✓ ALL ATTACKS DEFENDED
═══════════════════════════════════════════════════════════
```

### 2. economic-analysis.md — Cost-Benefit Calculation

**Purpose:** Provide detailed economic analysis for each attack, including break-even points and parameter sensitivity.

**Contents:**

#### Per-Attack Analysis
- **Threat Model:** What the attacker is trying to achieve
- **Parameters:** Key variables (pool depth, stake, bond, slash rate)
- **Attack Cost:** Capital + opportunity cost
- **Expected Return:** Profit if attack succeeds
- **Break-Even Point:** What market size / payout makes attack profitable?
- **Verdict:** DEFENDED / PARTIALLY_DEFENDED / VULNERABLE

#### Summary Table
```
| Attack | Min Capital | Expected Return | Break-Even | Verdict |
|--------|-------------|-----------------|------------|---------|
| Proposer Self-Voting | 3,100 SUFFER | 0 | 6,500 cap | DEFENDED |
| All-Abstain DoS | 0 | 0 | N/A | DEFENDED |
| ... | ... | ... | ... | ... |
```

#### Parameter Tuning Guide
- What to monitor on mainnet
- Governance levers to pull if attacks become profitable at scale
- Triggers for increasing SPAT, raising bonds, or introducing delegation

### 3. rate-limiter-stress.test.ts — Rate Limiter Resilience

**Purpose:** Validate that the gas relay rate limiter (from gas-relay/src/lib/rate-limiter.ts) holds under adversarial conditions.

**Test Coverage:**

1. **Fixed Window Boundary Attack**
   - Attacker sends requests at window edges to bypass limits
   - Verifies: Window reset prevents burst through boundaries

2. **Multi-Sender Attack**
   - 50 different senders each send requests to same dispute
   - Verifies: Per-dispute limit blocks excess (100 max/hour)

3. **Memory Pressure**
   - 10,000 unique dispute IDs created simultaneously
   - Verifies: Cleanup prevents unbounded Map growth

4. **Timing Attack (Window Expiration)**
   - Expired buckets don't count toward limits after window passes
   - Verifies: Window reset logic is correct

5. **Dual-Layer Limits**
   - Both per-dispute (100/hr) and per-sender (20/hr) limits enforced
   - Verifies: Neither limit is bypassable

6. **Stress Test (High Volume)**
   - 100 disputes × 50 senders × 2 requests = 10,000 requests
   - Verifies: No degradation, correct blocking

**How to Run:**
```bash
npm test -- rate-limiter-stress.test.ts
```

**Expected Output:**
```
✓ Fixed Window Boundary Attack
✓ Multi-Sender Attack
✓ Memory Pressure & Cleanup
✓ Timing Attack & Expiration
✓ Dual-Layer Limits
✓ Stress Test (High Volume)

RATE LIMITER VERDICT: DEFENDED
```

---

## Design Defenses Validated

### Economic Defenses

| Attack | Primary Defense | Cost to Attacker | Profitability |
|--------|-----------------|------------------|---------------|
| Proposer Self-Voting | 65% SPAT (D2) | 6,500 SUFFER to acquire 65% | Unprofitable |
| All-Abstain | Decreasing GAT (D8) + Hard deadline | 0 (free abstain, no benefit) | Unprofitable |
| Commit-and-Hide | 10x non-reveal penalty (D1) | 1,000 stake slashed 1% | Unprofitable |
| Whale Domination | 65% SPAT requirement | 6,500+ SUFFER to control | Unprofitable if <65% |
| Cooldown Exploit | Dispute-aware completion (D6) | 1,000 stake blocked from unstaking | Blocked (technical) |
| Congestion | Owned objects (D3) + rate limiter | ~0.2 SUI gas (negligible) | No benefit |
| Double-Claim | claimed_voters set (guard) | 0 | Blocked (technical) |
| Rate Limiter Bypass | Dual-layer limits (dispute + sender) | 0 | Blocked (technical) |

### Technical Defenses
- **D1: Opt-in Slashing** — Non-committing stakers never slashed
- **D2: Proposer Not Excluded** — Economic defense via 65% SPAT
- **D3: Two-Level Architecture** — Owned SDVMCommitRecord eliminates commit contention
- **D6: Dispute-Aware Cooldown** — Can't unstake while disputes pending
- **D8: Decreasing GAT** — 5% → 3% → 1% per roll, ensures eventual resolution
- **D9: Permissionless Phase Transitions** — Anyone can advance phases

---

## Parameter Reference (Mainnet)

```
Slash Rates:
  - Incorrect vote: 0.1% (10 bps)
  - Non-reveal: 1.0% (100 bps) — 10x penalty
  - Abstention: 0% (opt-in, no penalty)

Quorum (GAT):
  - Round 1: 5% of staked SUFFER
  - Round 2: 3% of staked SUFFER
  - Round 3: 1% of staked SUFFER
  - After Roll 3: INVALID

Supermajority (SPAT):
  - 65% of revealed votes required
  - No tie-breaker (rolls on tie)

Phase Timing:
  - Commit: 12 hours
  - Reveal: 12 hours
  - Tally: Immediate
  - Hard deadline: 7 days from dispute filing

Rate Limiter:
  - Dispute limit: 100 commits/hour
  - Sender limit: 20 commits/hour
  - Window: 1 hour (fixed)

Cooldown:
  - Unstake cooldown: 48 hours
  - Emergency unstake penalty: 5%
```

---

## Integration with Testnet Phases

### T3 (Real Stakes) — Weeks 12-14
Run `attack-runner.ts` simulations against testnet state:
```bash
# Bootstrap simulator with real pool data from testnet
sim.initializePoolWithStakers(
  numTestnetStakers,  // Read from RPC
  sufferPerStaker,    // Read from RPC
  largestStakePct     // Identify largest staker
);

// Run all 8 attacks
// Log results to testnet dashboard
```

### T4 (Mainnet Candidate) — Weeks 14-16
- Re-run simulations with mainnet parameters (0.1% slash, 3 max rolls)
- Monitor for any attacks approaching break-even
- Generate final red team report

---

## What to Do If an Attack Succeeds

**Priority 1: Verify the Attack**
1. Run `attack-runner.ts` again with same parameters
2. Check economic analysis for break-even conditions
3. Confirm on testnet that the attack works

**Priority 2: Identify the Root Cause**
- Is the defense mechanically broken? (bug in contract)
- Is the parameter tuning too loose? (slash rate too low, GAT too high)
- Is it a systemic issue? (design flaw)

**Priority 3: Response Options**

| Issue Type | Fast Fix | Medium Fix | Slow Fix |
|-----------|----------|-----------|----------|
| **Bug** | Deploy hotfix contract | Add god lever | Redesign mechanism |
| **Parameter Tuning** | Use AdminSlashOverride lever | Governance vote | Protocol upgrade |
| **Design Flaw** | Activate multisig emergency | Rollback to prior version | Submit improvement proposal |

---

## Maintenance & Updates

### Quarterly Review
- [ ] Monitor testnet for any attacks approaching viability
- [ ] Update economic analysis with real on-chain data (actual slash rates, participation)
- [ ] Adjust parameters if pool depth or market payouts change significantly

### Before Mainnet Launch
- [ ] All 8 attacks must still be DEFENDED with mainnet parameters
- [ ] God lever usage must be <5% (across all levers)
- [ ] 50+ disputes must have been resolved via SDVM (not admin override)

### After Mainnet Launch (Monthly)
- [ ] Monitor slash pool health (should grow, not shrink)
- [ ] Track participation rates by round number (should ≥GAT on R1)
- [ ] Alert if any single entity approaches 40% stake

---

## References

**Specification Documents:**
- SUFFER_DVM_SPEC_v2.md — Full SDVM architecture and parameters
- SDVM_ARCHITECTURE_PRINCIPLES.md — Design philosophy and defense principles
- SDVM_PHASE3_TEST_PLAN.md — Phase 3 testing roadmap (Track 2 is this deliverable)

**Contract Source:**
- pm_sdvm.move — Commit-reveal voting, tally, slash/reward logic
- pm_staking.move — Staking pool, cooldown, opt-in slash
- rate-limiter.ts — Gas relay rate limiting

**Related Deliverables:**
- Track 1: Contract Testing (unit tests, integration tests)
- Track 3: Red Team Findings (from security auditors)
- Track 4: Testnet Monitoring (on-chain metrics)

---

## Contact

For questions about attack simulations or economic analysis:
- Team Echo (Red Team / QA): [contact info]
- Systems Architect: [contact info]

**Status:** ✓ Delivered
**Approval:** Pending Phase 3 Red Team Review
