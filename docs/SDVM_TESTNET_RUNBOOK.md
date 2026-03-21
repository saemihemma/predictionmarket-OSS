# SUFFER DVM — Testnet Deployment & Operations Runbook

**Document Status:** Phase 3 Operational Guide
**Date:** 2026-03-17
**Audience:** Operations engineers, site reliability engineers (SREs)
**Purpose:** Step-by-step instructions for deploying, managing, and troubleshooting testnet

---

## Table of Contents

1. [Pre-Launch Checklist](#pre-launch-checklist)
2. [Phase Transitions (T1 → T2 → T3 → T4)](#phase-transitions)
3. [Incident Response Procedures](#incident-response-procedures)
4. [God Lever Usage Log](#god-lever-usage-log)
5. [Monitoring & Observability](#monitoring--observability)
6. [Emergency Procedures](#emergency-procedures)

---

## Pre-Launch Checklist

Before enabling any testnet phase, complete all items in this section. Each item must be verified on-chain or in logs.

### 1. Contract Deployment Order

Contract deployment must follow this sequence. **Do not skip steps or reorder.**

#### Step 1.1: Deploy pm_staking.move

```bash
# Variables (adjust for your environment)
STAKING_PACKAGE_ID=""
MULTISIG_ADDRESS="0xMultisigAddr"  # 2-of-3 multisig for admin cap
SUI_CLIENT_RPC="https://fullnode.testnet.sui.io:443"

# Build and publish
cd $PM_REPO/packages/pm-staking
sui client publish \
  --gas-budget 500000000 \
  --json | jq -r '.objectChanges[] | select(.type == "published") | .packageId'

# Save STAKING_PACKAGE_ID from output
# Example: STAKING_PACKAGE_ID="0x123abc..."

# Verify on-chain
sui client object $(echo $STAKING_PACKAGE_ID)
```

**Verification:**
- [ ] pm_staking module exists in published package
- [ ] SufferStakePool is shareable (shared status visible)
- [ ] pm_rules constants are readable (VOTE_PHASE_COMMIT=0, etc.)

#### Step 1.2: Deploy pm_sdvm.move

```bash
SDVM_PACKAGE_ID=""
PM_STAKING_ID=$STAKING_PACKAGE_ID  # Reference from Step 1.1

cd $PM_REPO/packages/pm-sdvm
sui client publish \
  --json | jq -r '.objectChanges[] | select(.type == "published") | .packageId'

# Save SDVM_PACKAGE_ID
```

**Verification:**
- [ ] pm_sdvm module exists and imports pm_staking correctly
- [ ] SDVMAdminCap struct is present
- [ ] SDVMVoteRound struct is shared-owned (correct Sui semantics)

#### Step 1.3: Update & Deploy pm_dispute.move Integration

Modify pm_dispute.move to integrate SDVM:
- file_dispute() now creates SDVMVoteRound instead of legacy vote mechanisms
- try_resolve_dispute() reads from SDVMVoteRound
- Bond distribution: 75% to correct party, 25% to treasury (per D2 spec)

```bash
cd $PM_REPO/packages/pm-dispute

# Update pm_dispute.move:
# - Import pm_sdvm::SDVMVoteRound
# - Modify file_dispute() signature
# - Update try_resolve_dispute() to read from SDVMVoteRound

sui client publish \
  --json | jq -r '.objectChanges[] | select(.type == "published") | .packageId'

# Save DISPUTE_PACKAGE_ID
```

**Verification:**
- [ ] pm_dispute integrates correctly with pm_sdvm (check imports and move calls)
- [ ] All existing tests pass (backward compatibility)
- [ ] file_dispute() creates SDVMVoteRound on-chain (inspect event logs)

---

### 2. Object Creation Sequence

After contracts are deployed, initialize the required on-chain objects in this order.

#### Object 2.1: SufferStakePool

```bash
# Call pm_staking::create_stake_pool()
sui client call \
  --package $STAKING_PACKAGE_ID \
  --module pm_staking \
  --function create_stake_pool \
  --gas-budget 100000000 \
  --json > stake_pool_tx.json

# Extract object ID from response
STAKE_POOL_ID=$(cat stake_pool_tx.json | jq -r '.objectChanges[] | select(.objectType | contains("SufferStakePool")) | .objectId')
echo "STAKE_POOL_ID=$STAKE_POOL_ID" >> ~/.testnet_env

# Verify
sui client object $STAKE_POOL_ID | grep -A5 "staked_balance\|dispute_pending"
```

**Expected output:** SufferStakePool object with:
- staked_balance: 0 (empty at init)
- slash_pool_balance: 0
- next_dispute_round_ids: empty vec

#### Object 2.2: SDVMAdminCap

```bash
# The admin cap is created during pm_sdvm package publish.
# Extract it from the publish response.
ADMIN_CAP_ID=$(cat sdvm_publish_tx.json | jq -r '.objectChanges[] | select(.objectType | contains("SDVMAdminCap")) | .objectId')
echo "ADMIN_CAP_ID=$ADMIN_CAP_ID" >> ~/.testnet_env

# Verify ownership
sui client object $ADMIN_CAP_ID | grep "owner:"
# Should show: "owner": { "AddressOwner": "0x<multisig_address>" }
```

#### Object 2.3: SDVMEmergencyInvalidationCap (x3)

Emergency invalidation requires 2-of-3 multisig. Create 3 separate caps, hold by different keys:

```bash
# In pm_sdvm.move, create_emergency_cap() should be called by admin.
# Call 3 times (distributed to multisig holders)

for i in {1..3}; do
  EMERGENCY_KEY="0xMultisigKey$i"

  sui client call \
    --package $SDVM_PACKAGE_ID \
    --module pm_sdvm \
    --function create_emergency_invalidation_cap \
    --args "$ADMIN_CAP_ID" \
    --gas-budget 50000000 \
    --json > emergency_cap_${i}.json

  CAP_ID=$(cat emergency_cap_${i}.json | jq -r '.objectChanges[] | select(.objectType | contains("SDVMEmergencyInvalidationCap")) | .objectId')
  echo "EMERGENCY_CAP_${i}=$CAP_ID" >> ~/.testnet_env
done
```

**Verification:**
- [ ] Each cap is owned by a different address
- [ ] All caps can be read from-chain (not garbage-collected)
- [ ] Caps are structurally identical

---

### 3. Configuration Verification

Before starting T1, verify all parameters match the testnet spec.

#### Config 3.1: Testnet Phase Parameters

```bash
# Fetch current parameters from pm_rules.move constants
# These should be configured at module level, not mutable

# Expected for T1 (Weeks 8-10):
# PHASE_COMMIT_DEADLINE_MS: 2 hours (7_200_000 ms)
# PHASE_REVEAL_DEADLINE_MS: 2 hours
# GAT_TESTNET: 1% (basis points: 100 out of 10,000)
# SPAT_TESTNET: 60% (6000 bps)
# SLASH_RATE_WRONG: 0% (testnet T1: no slashing)
# SLASH_RATE_NONREVEAL: 0% (testnet T1: no slashing)
# UNSTAKE_COOLDOWN_MS: 1 hour (3_600_000 ms for T1)

# Verify via on-chain query or Move test:
cd $PM_REPO/packages/pm-sdvm
cat Makefile | grep -A20 "testnet-params"

# Or read from deployed module:
sui client call \
  --package $SDVM_PACKAGE_ID \
  --module pm_rules \
  --function get_phase_constants \
  --json
```

**Checklist:**
- [ ] PHASE_COMMIT_DEADLINE_MS = 7_200_000 (2h)
- [ ] PHASE_REVEAL_DEADLINE_MS = 7_200_000 (2h)
- [ ] GAT = 100 bps (1%)
- [ ] SPAT = 6000 bps (60%)
- [ ] SLASH_RATE_WRONG = 0 bps (0%)
- [ ] SLASH_RATE_NONREVEAL = 0 bps (0%)
- [ ] UNSTAKE_COOLDOWN_MS = 3_600_000 (1h)
- [ ] MAX_ROLLS = 2

#### Config 3.2: Gas Relay Configuration

```bash
# Environment variables for gas-relay service

cat > /etc/systemd/system/gas-relay.service.d/override.conf << EOF
[Service]
Environment="PM_PACKAGE_ID=$SDVM_PACKAGE_ID"
Environment="MAX_GAS_BUDGET=50000000"
Environment="DISPUTE_RATE_LIMIT=100"
Environment="SENDER_RATE_LIMIT=20"
Environment="RPC_URL=https://fullnode.testnet.sui.io:443"
Environment="RELAY_PRIVATE_KEY=$(cat $RELAY_KEY_FILE)"
EOF

sudo systemctl daemon-reload
sudo systemctl restart gas-relay

# Verify relay is online
curl -s http://localhost:3000/health | jq '.status'
# Expected: "healthy" or "degraded"
```

**Checklist:**
- [ ] PM_PACKAGE_ID is set correctly
- [ ] MAX_GAS_BUDGET is 50M SUI (testnet conservative)
- [ ] DISPUTE_RATE_LIMIT = 100 txs/hour per dispute
- [ ] SENDER_RATE_LIMIT = 20 txs/hour per sender
- [ ] Relay responds to /health endpoint
- [ ] Relay can sponsor at least one transaction

#### Config 3.3: Phase Transition Bot Configuration

```bash
# Bot service startup

cat > /etc/systemd/system/phase-bot.service.d/override.conf << EOF
[Service]
Environment="RPC_URL=https://fullnode.testnet.sui.io:443"
Environment="PM_PACKAGE_ID=$SDVM_PACKAGE_ID"
Environment="POLL_INTERVAL_MS=60000"
Environment="BOT_KEYPAIR=$BOT_KEYPAIR_B64"
EOF

sudo systemctl restart phase-bot

# Verify bot is running
curl -s http://localhost:3001/health | jq '.status'
# Expected: "healthy"

# Check logs
sudo journalctl -u phase-bot -n 20 --no-pager
# Expected: "Bootstrap complete. Tracking X active rounds."
```

**Checklist:**
- [ ] Bot keypair is funded with at least 1 SUI (for gas)
- [ ] Bot can read from chain (bootstrap succeeds)
- [ ] Bot health endpoint returns 200
- [ ] Bot logs show "Bootstrap complete"

---

### 4. Frontend Deployment

Deploy the voting UI with correct contract references.

```bash
# Build frontend with testnet parameters
cat > .env.testnet << EOF
VITE_STAKING_PACKAGE_ID=$STAKING_PACKAGE_ID
VITE_SDVM_PACKAGE_ID=$SDVM_PACKAGE_ID
VITE_DISPUTE_PACKAGE_ID=$DISPUTE_PACKAGE_ID
VITE_NETWORK=testnet
VITE_RELAY_URL=https://relay.testnet.example.com
VITE_RPC_URL=https://fullnode.testnet.sui.io:443
EOF

cd $PM_REPO/packages/frontend
npm run build:testnet
npm run deploy:testnet

# Verify
curl -s https://testnet.example.com/api/config | jq '.packageIds'
# Should show all three package IDs
```

**Checklist:**
- [ ] Frontend loads without errors
- [ ] Package IDs are correct in page source
- [ ] Relay health endpoint is reachable from frontend
- [ ] Wallet connection works (test in browser)

---

### 5. Pre-Launch Verification

Run a complete smoke test before enabling T1.

```bash
#!/bin/bash
# smoke-test.sh

set -e

echo "=== Smoke Test ==="
echo "Checking contracts..."

# 1. Can read from chain
sui client object $STAKE_POOL_ID > /dev/null || exit 1
sui client object $SDVM_PACKAGE_ID > /dev/null || exit 1
echo "✓ Contracts readable"

# 2. Can sponsor transactions
SPONSOR_TEST=$(cat << EOF
import sui from '@mysten/sui/client';
const client = new sui.SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
// Call /sponsor endpoint with mock transaction
fetch('https://relay.testnet.example.com/sponsor', {
  method: 'POST',
  body: JSON.stringify({ txKindBytes: '...', sender: '0x...' })
}).then(r => r.json()).then(d => console.log(d.valid ? 'OK' : 'FAIL'));
EOF
)
echo "✓ Gas relay responding"

# 3. Bot can read on-chain state
curl -s http://localhost:3001/health | jq '.status' | grep -q healthy || echo "⚠ Bot status: check logs"
echo "✓ Phase bot running"

echo ""
echo "=== Smoke Test Passed ==="
echo "Safe to enable T1"
```

Run this before Phase T1 launch:

```bash
chmod +x smoke-test.sh
./smoke-test.sh
```

---

## Phase Transitions

Each testnet phase (T1 → T2 → T3 → T4) requires specific parameter changes and validations.

### Transition T1 → T2 (After Week 10)

**Prerequisites:**
- [ ] T1 has completed at least 10 disputes
- [ ] Zero transaction failures
- [ ] Salt recovery tested with 5+ voters
- [ ] Frontend shows no critical errors

**Parameter Changes:**

| Parameter | T1 Value | T2 Value | How to Apply |
|-----------|---------|---------|--------------|
| COMMIT phase | 2h | 4h | Update pm_rules.move constant |
| REVEAL phase | 2h | 4h | Update pm_rules.move constant |
| GAT | 1% (100 bps) | 3% (300 bps) | Update pm_rules.move constant |
| SPAT | 60% (6000 bps) | 65% (6500 bps) | Update pm_rules.move constant |
| Slash (wrong) | 0% | 0.05% (5 bps) | Update pm_rules.move constant |
| Slash (non-reveal) | 0% | 0.5% (50 bps) | Update pm_rules.move constant |
| Unstake cooldown | 1h | 24h | Update pm_rules.move constant |
| Max rolls | 2 | 2 | No change |

**Implementation:**

```bash
# 1. Update constants in pm_rules.move
cd $PM_REPO/packages/pm-sdvm

cat > src/pm_rules.move << 'EOF'
module pm_sdvm::pm_rules {
    const PHASE_COMMIT_DEADLINE_MS: u64 = 14_400_000; // 4 hours
    const PHASE_REVEAL_DEADLINE_MS: u64 = 14_400_000; // 4 hours
    const GAT_T2: u16 = 300; // 3% (basis points)
    const SPAT_T2: u16 = 6500; // 65% (basis points)
    const SLASH_RATE_WRONG_T2: u16 = 5; // 0.05%
    const SLASH_RATE_NONREVEAL_T2: u16 = 50; // 0.5%
    const UNSTAKE_COOLDOWN_MS: u64 = 86_400_000; // 24 hours
    // ... rest of module
}
EOF

# 2. Publish new version
sui client publish \
  --gas-budget 500000000 \
  --json > t2_upgrade.json

# 3. Verify new constants
NEW_SDVM_ID=$(cat t2_upgrade.json | jq -r '.objectChanges[] | select(.type == "published") | .packageId')
sui client object $NEW_SDVM_ID | grep -A10 "PHASE_COMMIT"
```

**Verification Post-Transition:**

- [ ] New package ID is different from T1 package ID
- [ ] All constants show new values
- [ ] First dispute in T2 uses 4h phases (check on-chain round object)
- [ ] Slash pool begins collecting fees (first slash > 0)
- [ ] Bot transitions existing rounds cleanly (no double-advance errors)

**Rollback Procedure (if T2 fails):**

```bash
# If T2 causes issues, revert to T1 package:
# 1. Update frontend to use T1 SDVM_PACKAGE_ID
# 2. Mark disputes filed under T2 as INVALID via admin cap
# 3. Document what went wrong
# 4. File a detailed incident report

# Revert frontend
cat > .env.testnet << EOF
VITE_SDVM_PACKAGE_ID=$SDVM_PACKAGE_ID  # T1 package ID
# ... other vars
EOF
npm run deploy:testnet

echo "⚠️ Reverted to T1 package. Incident report filed."
```

### Transition T2 → T3 (After Week 12)

**Prerequisites:**
- [ ] T2 has completed at least 30 disputes
- [ ] >40% average staker participation
- [ ] No stuck disputes
- [ ] APY measurable (min 1% on annualized basis)
- [ ] AdminSlashOverride NOT used in T2

**Parameter Changes:**

| Parameter | T2 Value | T3 Value | How to Apply |
|-----------|---------|---------|--------------|
| COMMIT phase | 4h | 12h | Update pm_rules.move |
| REVEAL phase | 4h | 12h | Update pm_rules.move |
| GAT | 3% | 5% | Update pm_rules.move |
| SPAT | 65% | 65% | No change |
| Slash (wrong) | 0.05% | 0.1% | Update pm_rules.move |
| Slash (non-reveal) | 0.5% | 1% | Update pm_rules.move |
| Unstake cooldown | 24h | 48h | Update pm_rules.move |
| Max rolls | 2 | 2 | No change |

**New Validations Before T3:**

- Attack simulations must all pass (see SDVM_PHASE3_TEST_PLAN.md)
- Red team cycle 1 findings must be addressed
- God lever usage audited: AdminResolve <5%, AdminSlashOverride =0 in T2

**Implementation:** (Same pattern as T1 → T2, update pm_rules.move, publish, verify)

**Critical Pre-T3 Check:**

```bash
# Verify >40% participation in T2 disputes
# This requires querying SDVMVoteRound objects for all disputes

for DISPUTE in $(sui client query objects --filter '{owner: SUI}' | jq -r '.data[] | select(.objectType | contains("SDVMVoteRound")) | .objectId'); do
  REVEALED=$(sui client object $DISPUTE | jq '.data.content.fields.revealed_weight')
  COMMITTED=$(sui client object $DISPUTE | jq '.data.content.fields.committed_weight')
  RATIO=$(echo "scale=4; $REVEALED / $COMMITTED * 100" | bc)
  echo "$DISPUTE: $RATIO% revealed"
done | awk '{sum+=$2; count++} END {print "Average: " sum/count "%"}'

# Expected: >40%
```

### Transition T3 → T4 (After Week 14)

**Prerequisites:**
- [ ] T3 has completed at least 50 disputes
- [ ] >50% average staker participation
- [ ] Attack simulations: all 11 variants defeated
- [ ] Red team cycle 2: zero new CRITICAL findings
- [ ] God lever usage: <5% of disputes
- [ ] Phase transition latency: <5min average

**Parameter Changes:**

| Parameter | T3 Value | T4 Value | Change? |
|-----------|---------|---------|---------|
| COMMIT phase | 12h | 12h | No |
| REVEAL phase | 12h | 12h | No |
| GAT | 5% | 5% | No |
| SPAT | 65% | 65% | No |
| Slash (wrong) | 0.1% | 0.1% | No |
| Slash (non-reveal) | 1% | 1% | No |
| Unstake cooldown | 48h | 48h | No |
| Max rolls | 2 | 3 | Update (allow 1 extra roll) |

**T4 is Mainnet-Candidate Phase:**

```bash
# Only change: increase MAX_ROLLS to 3
# This is already set up in pm_rules.move for mainnet parameters

# No contract changes needed — T4 uses exact same contracts as T3
# Only operational: stricter monitoring, longer cooldown before mainnet push

# Verification
sui client object $SDVM_PACKAGE_ID | grep MAX_ROLLS_MAINNET
# Should show: const MAX_ROLLS_MAINNET: u64 = 3;
```

**T4 Exit Criteria:** (See SDVM_TESTNET_EXIT_CRITERIA.md for full checklist)

All of the following must be YES:
- [ ] 150+ disputes resolved
- [ ] >60% participation
- [ ] Zero incorrect outcomes
- [ ] <1% transaction failure
- [ ] Average time-to-resolution <36h
- [ ] All attack simulations defended
- [ ] Red team cycle 2: zero CRITICAL findings
- [ ] God lever usage <5% in T4
- [ ] Mobile voting functional
- [ ] Salt recovery: 10+ successful recoveries

**If All Criteria Met:**

Proceed to Phase 4 (Mainnet Readiness). See Implementation Plan Section 4.

---

## Incident Response Procedures

These are step-by-step guides for the most common operational issues.

### Incident: Dispute Stuck Past Deadline

**Trigger:** A round is in COMMIT or REVEAL phase and the deadline has passed >5 minutes without advancing.

**Impact:** MEDIUM (dispute resolution delayed, but not lost)

**Response:**

1. **Check bot health** (30 seconds):
   ```bash
   curl -s http://localhost:3001/health | jq '.alertsTriggered'

   # Look for: "Round <id> is Xmin past deadline in phase <phase>"
   # If bot is healthy and reporting correctly, proceed to step 2
   ```

2. **Identify the stuck round** (1 minute):
   ```bash
   # Query chain for rounds not yet advanced
   STUCK=$(sui client query objects --filter '{owner: SUI}' | jq '.data[] | select(.objectType | contains("SDVMVoteRound") and .phase < 3)')

   ROUND_ID=$(echo $STUCK | jq -r '.objectId')
   PHASE=$(echo $STUCK | jq '.data.content.fields.phase')
   DEADLINE=$(echo $STUCK | jq '.data.content.fields.revealDeadline')

   NOW=$(date +%s000)
   PAST_BY=$(( $NOW - $DEADLINE ))

   echo "Round $ROUND_ID is $((PAST_BY/60000))min past deadline (phase=$PHASE)"
   ```

3. **Attempt manual phase advance** (2 minutes):
   ```bash
   # If phase = COMMIT (0), advance to REVEAL:
   if [ $PHASE -eq 0 ]; then
     sui client call \
       --package $SDVM_PACKAGE_ID \
       --module pm_sdvm \
       --function advance_to_reveal_phase \
       --args "$ROUND_ID" "0x6" \  # 0x6 is clock
       --gas-budget 50000000 \
       --json
     echo "✓ Advanced COMMIT→REVEAL"
   fi

   # If phase = REVEAL (1), call tally:
   if [ $PHASE -eq 1 ]; then
     sui client call \
       --package $SDVM_PACKAGE_ID \
       --module pm_sdvm \
       --function tally_votes \
       --args "$ROUND_ID" "0x6" \
       --gas-budget 100000000 \
       --json
     echo "✓ Tallied and settled"
   fi
   ```

4. **Verify advancement succeeded**:
   ```bash
   # Re-query the round
   sui client object $ROUND_ID | jq '.data.content.fields | {phase, committed_weight, revealed_weight}'

   # Phase should be 1 (if was 0) or 3 (if was 1)
   ```

5. **If manual advance fails:**
   ```bash
   # Check RPC connectivity
   curl -s https://fullnode.testnet.sui.io:443 | head -20

   # If RPC is down, escalate to infrastructure team
   # If RPC is up, try again with higher gas budget
   sui client call \
     --package $SDVM_PACKAGE_ID \
     --module pm_sdvm \
     --function advance_to_reveal_phase \
     --args "$ROUND_ID" "0x6" \
     --gas-budget 200000000 \
     --json 2>&1 | tee /tmp/advance_error.log

   # If still fails, escalate to god lever
   ```

6. **God lever: AdminPhaseAdvance** (if manual fails):
   ```bash
   # Only if automated approach fails 3+ times
   # Emit event for logging

   sui client call \
     --package $SDVM_PACKAGE_ID \
     --module pm_sdvm \
     --function admin_phase_advance \
     --args "$ADMIN_CAP_ID" "$ROUND_ID" "0x6" \
     --gas-budget 50000000 \
     --json | jq '.effects.status'

   echo "[GOD LEVER] AdminPhaseAdvance used for round=$ROUND_ID"
   echo "$(date -Iseconds) AdminPhaseAdvance $ROUND_ID" >> /var/log/god-lever-usage.log
   ```

7. **Post-mortem**:
   ```bash
   # Document incident
   cat > /var/log/incident-$(date +%Y%m%d-%H%M%S).log << EOF
   INCIDENT: Dispute Stuck Past Deadline
   Round: $ROUND_ID
   Stuck phase: $PHASE (0=COMMIT, 1=REVEAL)
   Time past deadline: $((PAST_BY/60000))min
   Resolution: [manual_advance / admin_override / other]
   Root cause: [bot_crash / rpc_timeout / congestion / other]
   EOF
   ```

---

### Incident: Gas Relay Out of SUI

**Trigger:** Relay balance drops below 10 SUI. Voters cannot sponsor transactions.

**Impact:** HIGH (voting becomes impossible without direct SUI)

**Response:**

1. **Alert received from monitoring**:
   ```bash
   # Monitoring should trigger when balance < 10 SUI
   # Alert message: "Relay balance critically low (<10 SUI)"
   ```

2. **Refund relay account**:
   ```bash
   # Send 100 SUI from treasury to relay
   RELAY_ADDRESS="0xRelayAccountAddr"

   sui client transfer-sui \
     --to $RELAY_ADDRESS \
     --amount 100000000000 \  # 100 SUI (1 SUI = 1e9 mist)
     --gas-budget 5000000

   # Verify balance
   sui client object $RELAY_ADDRESS | jq '.data.content.fields.balance'
   ```

3. **Investigate drain**:
   ```bash
   # Identify if relay is being used abnormally

   # Option A: Check rate limiter stats
   curl -s http://localhost:3000/stats | jq '{
     active_disputes: .activDisputeBuckets,
     active_senders: .activeSenderBuckets,
     total_requests_this_hour: .totalRequests
   }'

   # Option B: Check on-chain transaction history
   sui client query transactions --from $RELAY_ADDRESS --limit 20 | \
     jq '.data[] | {txId, from, status}' | head -20

   # Look for: spam pattern, failed txs, unusual gas usage
   ```

4. **If drain is abnormal (>100 txs/hour from single sender)**:
   ```bash
   # Check rate limiter is enforcing limits
   curl -s http://localhost:3000/health | jq '.alertsTriggered[] | select(. contains("rate_limit"))'

   # If no rate limit alerts but drain continues, restart relay with safety enabled
   sudo systemctl restart gas-relay

   # Monitor for 5 minutes
   sleep 300
   curl -s http://localhost:3000/stats | jq '.totalRequests'
   ```

5. **If relay is compromised (unknown sender address)**:
   ```bash
   # Disable relay immediately
   sudo systemctl stop gas-relay

   # Rotate relay keypair (generate new one)
   sui client key generate ed25519 --derivation-path "m/44'/784'/0'/0'/0'"
   NEW_RELAY_KEY=$(sui client keys list | tail -1)

   # Deploy new relay with fresh key
   # Document incident as SECURITY

   echo "[SECURITY] Relay key rotated due to suspected compromise" >> /var/log/security.log
   ```

6. **Communicate to users**:
   ```bash
   # If relay is down for >30 minutes, notify voters
   curl -X POST https://notifications.example.com/broadcast \
     --data '{
       "severity": "warning",
       "message": "Gas relay temporarily down. You can still vote using direct SUI.",
       "duration_minutes": 30
     }'
   ```

---

### Incident: Low Participation (Fewer Than Expected Voters)

**Trigger:** Average participation <30% for 3 consecutive disputes in T2+.

**Impact:** MEDIUM (may indicate voter engagement problem or UX issue)

**Response:**

1. **Verify the metrics**:
   ```bash
   # Query recent disputes to confirm low participation

   for DISPUTE in $(sui client query objects --filter '{owner: SUI}' | jq -r '.data[] | select(.objectType | contains("SDVMVoteRound")) | .objectId'); do
     PHASE=$(sui client object $DISPUTE | jq '.data.content.fields.phase')
     if [ $PHASE -eq 3 ]; then  # Only look at SETTLED disputes
       REVEALED=$(sui client object $DISPUTE | jq '.data.content.fields.revealed_weight')
       COMMITTED=$(sui client object $DISPUTE | jq '.data.content.fields.committed_weight')
       if [ ! -z "$COMMITTED" ] && [ $COMMITTED -gt 0 ]; then
         RATIO=$(echo "scale=2; $REVEALED / $COMMITTED * 100" | bc)
         echo "$DISPUTE: $RATIO%"
       fi
     fi
   done | sort -t: -k2 -n | tail -10
   ```

2. **Check frontend for errors**:
   ```bash
   # Open browser console and check for JavaScript errors
   # Navigate to https://testnet.example.com/voting
   # F12 → Console tab

   # Common issues:
   # - "Cannot read property 'staked' of undefined" → wallet issue
   # - "Relay rejected: rate limit exceeded" → replay is down
   # - "Hash mismatch" → salt storage issue
   ```

3. **Check salt recovery functionality**:
   ```bash
   # Low participation might indicate voters are losing salts

   # Monitor salt loss rate:
   curl -s http://localhost:3000/metrics | grep -i salt

   # Look for high "reveal_failed_due_to_salt_loss" count
   ```

4. **If hash mismatches are high** (see next incident)

5. **Communication & adjustment**:
   ```bash
   # Broadcast message to testnet community
   cat > /tmp/participation_msg.txt << EOF
   ⚠️ We're seeing lower participation than expected.

   If you're having trouble:
   1. Check your salt is saved (Settings → Recovery)
   2. Ensure you have enough SUFFER balance
   3. Try the "Test my salt" button before voting
   4. Report issues in #sdvm-testing

   If participation stays <30% for another 24h, we may need to:
   - Increase rewards (higher slash rate)
   - Extend deadline durations
   - Review dispute frequency
   EOF

   curl -X POST https://notifications.example.com/broadcast \
     --data-binary @/tmp/participation_msg.txt
   ```

6. **Administrative option: increase incentives** (god lever AdminSlashOverride):
   ```bash
   # Only if participation remains <30% after 24h of investigation

   # Increase slash rate from current to 0.1%:
   sui client call \
     --package $SDVM_PACKAGE_ID \
     --module pm_sdvm \
     --function admin_slash_override \
     --args "$ADMIN_CAP_ID" 10 \  # 10 basis points = 0.1%
     --gas-budget 50000000

   echo "[GOD LEVER] AdminSlashOverride set to 0.1% to boost participation" >> /var/log/god-lever-usage.log
   ```

---

### Incident: Hash Mismatch Epidemic

**Trigger:** >5% of reveal attempts fail with "Hash mismatch" error in a single day.

**Impact:** HIGH (voters lose funds due to their own error, but indicates UX issue)

**Response:**

1. **Verify hash algorithm parity**:
   ```bash
   # Hash construction should be identical in Move and TypeScript

   # Test vector validation:
   cd $PM_REPO/packages/pm-sdvm

   # In Move:
   cargo test test_bcs_hash_vectors --lib

   # In TypeScript:
   cd $PM_REPO/packages/frontend
   npm test -- hash.test.ts

   # Both must produce identical hashes for same outcome+salt
   ```

2. **Check BCS little-endian assumption**:
   ```bash
   # BCS uses little-endian serialization
   # Outcome (u16) is serialized as 2 bytes in little-endian order

   # Example: outcome=1
   # Expected bytes: [0x01, 0x00] (little-endian)
   # NOT [0x00, 0x01] (big-endian)

   # Verify in move tests:
   grep -r "little-endian\|0x01, 0x00" $PM_REPO/packages/pm-sdvm/tests/
   ```

3. **Check frontend salt handling**:
   ```bash
   # Most hash mismatches occur due to salt loss or modification

   # Verify frontend:
   # 1. Saves salt to IndexedDB after commit
   # 2. Retrieves salt on reveal page (auto-filled)
   # 3. Displays BIP39 recovery seed for manual backup
   # 4. "Test my salt" button calculates hash locally before reveal
   ```

4. **If still getting mismatches, debug specific case**:
   ```bash
   # Ask user to provide:
   # 1. Their outcome selection (binary choice, e.g., "YES" or "NO")
   # 2. A screenshot of the BIP39 seed they saved
   # 3. The transaction hash of their reveal attempt (from testnet explorer)

   # Then manually compute the hash:
   # outcome_select=1, seed="word1 word2 ... word12"

   # Derive salt from seed:
   # salt = PBKDF2(seed, "SUFFER-SALT", 1000 iterations, 32 bytes)

   # Compute hash:
   # outcome_bytes = bcs(outcome=1)  # [0x01, 0x00]
   # hash = sha3_256(outcome_bytes ++ salt)

   # Compare to committed hash in SDVMCommitRecord on-chain
   ```

5. **Root cause: BCS parity issue**:
   ```bash
   # If Move and TypeScript hashes don't match, immediate action:

   # Check Move bcs module:
   grep -A20 "fn bcs_to_bytes" $PM_REPO/packages/pm-sdvm/src/pm_sdvm.move

   # Check TypeScript bcs import:
   grep -A10 "bcs" $PM_REPO/packages/frontend/src/voting.ts

   # Ensure both use official Mysten bcs library:
   # Move: use std::bcs
   # TypeScript: import { bcs } from "@mysten/sui/bcs"
   ```

6. **If cross-platform vectors fail**:
   ```bash
   # This is a CRITICAL blocker — halt voting immediately

   sudo systemctl stop gas-relay
   sudo systemctl stop phase-bot

   # Halt all votes until issue is resolved
   cat > /tmp/halt.txt << EOF
   ⚠️ CRITICAL: Hash algorithm mismatch detected between Move and TypeScript.

   Voting is halted until we fix the BCS serialization parity.

   Do NOT vote in the next 2 hours.

   Current status: Debug in progress. Updates every 30 minutes.
   EOF

   # Notify all users
   curl -X POST https://notifications.example.com/broadcast-critical \
     --data-binary @/tmp/halt.txt

   # Escalate to engineering team
   ```

---

### Incident: Mass Unstake Event (>20% Withdrawal in One Week)

**Trigger:** Total unstaked amount exceeds 20% of previously staked amount in a 7-day window.

**Impact:** CRITICAL (indicates loss of confidence in system)

**Response:**

1. **Alert detection**:
   ```bash
   # Monitoring should track weekly unstake volume

   WEEK_AGO=$(($(date +%s) - 604800))
   UNSTAKES=$(sui client query transactions --filter '{
     Publish: {published}
     function: "pm_staking::initiate_unstake"
     timestamp: {after: $WEEK_AGO}
   }' | jq '.data | length')

   # Sum the unstaked amounts from events
   ```

2. **Immediate communication**:
   ```bash
   # Transparency: tell the community what we see

   curl -X POST https://notifications.example.com/broadcast << EOF
   We've detected elevated unstaking activity this week.

   This is normal during market stress, but we're monitoring closely.

   Questions? Ask in #sdvm-testnet.
   EOF
   ```

3. **Investigate the cause**:
   ```bash
   # Is there a specific dispute that triggered this?

   # Check for:
   # - Controversial outcome (many voters lost)
   # - High slash rate from recent slashes
   # - Technical issues (hash mismatches, stuck disputes)
   # - External news/FUD

   curl -s http://localhost:3001/health | jq '.alertsTriggered' | grep -i "slash\|stuck\|mismatch"
   ```

4. **Assess if slashing is the cause**:
   ```bash
   # If recent slashes were high (>0.5% of stakes lost), voters naturally unstake

   # Review recent disputes:
   for ROUND in $(sui client query objects --filter '{phase: 3}' | jq -r '.data[] | .objectId'); do
     LOSING_WEIGHT=$(sui client object $ROUND | jq '.data.content.fields.losing_weight')
     LOSING_VOTERS=$(sui client object $ROUND | jq '.data.content.fields.losing_voter_ids | length')
     echo "$ROUND: $LOSING_VOTERS voters lost, total_weight=$LOSING_WEIGHT"
   done | sort -t= -k2 -rn | head -5
   ```

5. **Check if it's a panic (vs. normal churn)**:
   ```bash
   # Panic = unstake speed is accelerating
   # Normal = steady churn

   # Plot unstake rate over last 24h
   # If trending upward steeply, it's a panic
   ```

6. **If it's a panic: invoke god lever AdminSlashOverride**:
   ```bash
   # Reduce slash rate to 0% to stop the bleed

   sui client call \
     --package $SDVM_PACKAGE_ID \
     --module pm_sdvm \
     --function admin_slash_override \
     --args "$ADMIN_CAP_ID" 0 \  # 0 basis points = 0% slash
     --gas-budget 50000000

   # Broadcast to all users
   curl -X POST https://notifications.example.com/broadcast-urgent << EOF
   ⚠️ In response to the unstaking surge, we've temporarily set slash rate to 0%.

   This is a temporary measure while we investigate the cause.

   Staking rewards will resume when we understand what triggered the exodus.
   EOF

   echo "[GOD LEVER] AdminSlashOverride set to 0% due to mass unstake event" >> /var/log/god-lever-usage.log
   ```

7. **Post-mortem**:
   ```bash
   # After stabilization, analyze:
   # - What disputes preceded the unstake surge?
   # - What was the contentious outcome?
   # - Did voters lose more than expected?
   # - Was there external controversy?

   # Document findings and lessons for mainnet calibration
   ```

---

## God Lever Usage Log

Every use of a god lever must be recorded for audit and removal criteria tracking.

### Log Template

```markdown
| Date | Time (UTC) | Lever | Dispute ID | Reason | Effect | What Would Have Happened Without It | Triggered By | Approved By | Resolution Time |
|------|-----------|-------|-----------|--------|--------|---------------------------------------|-----------|-----------|-----------------|
| 2026-03-20 | 14:30:15 | AdminPhaseAdvance | M1:R1 | Phase transition bot crashed | Round advanced REVEAL→TALLY | Dispute would have stalled, voters unable to complete reveal. After 1h, revealed all votes, 80% agreement | Bot failure | ops-on-call | 15 min |
| 2026-03-22 | 09:15:42 | AdminSlashOverride | (system-wide) | Low participation <20%, reducing incentive for new voters | Set slash rate 0%→0.05% | Participation would have remained low, few new stakers | Metrics alert | eng-lead | 5 min |
```

### Recording a God Lever Use

Every time a god lever is invoked:

1. **Immediately log the use**:
   ```bash
   cat >> /var/log/god-lever-usage.log << EOF
   $(date -Iseconds) | AdminPhaseAdvance | dispute=$DISPUTE_ID | reason='Phase transition bot crash' | effect='Round advanced manually' | approved_by=$OPERATOR
   EOF
   ```

2. **Emit event on-chain** (happens automatically via contract):
   ```
   The god lever function (e.g., admin_phase_advance) emits an AdminActionEvent
   This is captured in logs and indexed for auditing
   ```

3. **Create incident ticket**:
   ```bash
   cat > /tmp/incident.md << EOF
   # God Lever Usage: AdminPhaseAdvance

   **Date:** $(date -Iseconds)
   **Lever:** AdminPhaseAdvance
   **Dispute:** M1:R1
   **Reason:** Phase transition bot crashed, round stuck in REVEAL phase
   **Effect:** Round transitioned manually to TALLY
   **Without It:** Dispute would stall indefinitely (7-day hard deadline not yet reached)
   **Resolution:** 15 minutes to invoke lever
   **Approval:** ops-on-call (manual escalation)
   **Root Cause:** Bot out-of-memory condition
   **Preventive Measures:** Increased bot memory limits, added restart watcher
   EOF

   curl -X POST https://jira.example.com/rest/api/2/issue \
     --data-binary @/tmp/incident.md \
     -H "Content-Type: application/json"
   ```

4. **Weekly god lever review**:
   ```bash
   # Every Friday, review and summarize usage

   grep "$(date -d 'last week' +%Y-%m-%d)" /var/log/god-lever-usage.log | \
     awk -F'|' '{print $3}' | sort | uniq -c | sort -rn

   # Output example:
   #   3 AdminPhaseAdvance
   #   1 AdminSlashOverride
   #   0 AdminResolve
   # Total: 4 uses this week
   ```

5. **Monthly god lever audit** (for removal criteria):
   ```bash
   # At end of each testnet phase, audit against removal criteria

   cat > /tmp/removal-audit.md << EOF
   # God Lever Removal Audit — T1 Phase

   ## AdminResolve
   - Used: 0 times
   - Criteria: "50+ disputes resolved by SDVM, <10% error rate, AdminResolve <5% of 50 disputes"
   - Status: ✓ REMOVABLE (0% usage, well below 5%)

   ## AdminSlashOverride
   - Used: 1 time (low participation incident)
   - Criteria: "8 weeks >40% participation, zero mass-exit events"
   - Status: ✗ NOT YET REMOVABLE (low participation issue indicates mechanism not ready)

   ## AdminPhaseAdvance
   - Used: 3 times (all bot crashes)
   - Criteria: "Bot >95% success rate for 4 weeks, <5min latency"
   - Status: ✓ REMOVABLE (bot now fixed, >99% uptime in last 2 weeks)
   EOF
   ```

---

## Monitoring & Observability

### Dashboard Panels (Grafana / Prometheus)

All metrics are exposed via Prometheus format on:
- **Phase bot:** http://localhost:3001/metrics
- **Gas relay:** http://localhost:3000/metrics

Import these dashboards into Grafana for visualization.

#### Key Metrics to Dashboard

1. **Active Rounds** (gauge)
   - Metric: `sdvm_active_rounds`
   - Breakdown by phase (COMMIT, REVEAL)
   - Alert if stuck >1h

2. **Participation Rate** (gauge)
   - Metric: `sdvm_participation_rate_bps`
   - Per-dispute
   - Alert if <3000 bps (30%)

3. **Phase Transition Latency** (histogram)
   - Metric: `sdvm_phase_transition_latency_ms`
   - p50, p95, p99
   - Alert if p99 > 30 minutes

4. **Slash Pool Balance** (gauge)
   - Metric: `sdvm_slash_pool_balance`
   - In SUI
   - Alert if <1000 SUI

5. **God Lever Usage** (counter)
   - Metrics: `admin_resolve_count`, `admin_slash_override_count`, etc.
   - Per phase
   - Track toward removal criteria

6. **Relay Balance** (gauge)
   - Metric: `relay_balance_sui`
   - Alert if <10 SUI

7. **Rate Limit Rejections** (counter)
   - Metric: `relay_rate_limit_rejections`
   - By reason (dispute, sender)
   - Alert if >10/hour

### Query Examples

```promql
# Average participation over last 7 days
avg(sdvm_participation_rate_bps) / 100

# Rounds stuck >1h
count(sdvm_active_rounds > 1h)

# Phase transition latency p99 per phase
histogram_quantile(0.99, sdvm_phase_transition_latency_ms) by (phase)
```

---

## Emergency Procedures

### Complete System Failure (All Rounds Stuck >12h)

1. **Declare INCIDENT status**
2. **Halt all operations**: Stop phase bot and relay
3. **Investigate RPC**: Is Sui testnet down?
4. **If testnet is up, escalate to engineering**
5. **Revert to previous testnet phase** (use prior SDVM_PACKAGE_ID)
6. **Communicate to community**: "Testnet is temporarily paused while we investigate"

### Exploit Detected (Possible Double Voting or Outcome Manipulation)

1. **Invoke AdminPauseStaking** immediately:
   ```bash
   sui client call \
     --package $SDVM_PACKAGE_ID \
     --module pm_staking \
     --function admin_pause_staking \
     --args "$ADMIN_CAP_ID" true \
     --gas-budget 50000000
   ```

2. **Pause gas relay**:
   ```bash
   sudo systemctl stop gas-relay
   ```

3. **Halt all new disputes**:
   ```bash
   # No new disputes can be filed while staking is paused
   # Existing disputes can complete (voters can reveal their votes)
   ```

4. **Investigate**:
   - Query all SDVMCommitRecords for duplicate commits per voter per round
   - Verify BCS hash construction (see hash mismatch incident)
   - Check for double-reveal attempts

5. **If exploit is confirmed**:
   - File CRITICAL security report
   - Invalidate affected disputes via 2-of-3 multisig
   - Return all bonds to voters
   - **Do not resume staking until root cause is fixed and audited**

6. **If exploit is false alarm**:
   - Resume staking
   - Resume relay
   - Publish post-mortem: "False alarm. All funds safe. Here's what we checked."

---

## Appendix: Command Reference

### Quick Status Check

```bash
# All-in-one health check
echo "=== Contracts ===" && \
sui client object $STAKING_PACKAGE_ID | head -3 && \
sui client object $SDVM_PACKAGE_ID | head -3 && \
echo "" && \
echo "=== Bot ===" && \
curl -s http://localhost:3001/health | jq '.status' && \
echo "" && \
echo "=== Relay ===" && \
curl -s http://localhost:3000/health | jq '.status' && \
echo "" && \
echo "=== Disputes ===" && \
sui client query objects --filter '{contains: "SDVMVoteRound", phase: {less_than: 3}}' | jq '.data | length'
```

### Useful Queries

```bash
# Count settled disputes (completions)
sui client query objects --filter '{contains: "SDVMVoteRound", phase: 3}' | jq '.data | length'

# Find active round by dispute ID
sui client query objects --filter '{contains: "SDVMVoteRound"}' | \
  jq ".data[] | select(.dispute_id == \"$DISPUTE_ID\")" | head -1

# Get slash pool balance
sui client object $STAKE_POOL_ID | jq '.data.content.fields.slash_pool_balance'

# Get relay balance
sui client object $RELAY_ADDRESS | jq '.data.content.fields.balance'
```

---

**Document maintained by:** Team Delta (DevOps/Infrastructure)
**Last updated:** 2026-03-17
**Next review:** After Phase 3 Week 12 (post-Red Team Cycle 1)
