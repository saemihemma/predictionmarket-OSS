# SDVM Key Management & Multisig Strategy

**Document Date:** 2026-03-18
**Status:** REQUIRED for Phase 2 Pre-Deployment
**Owner:** Team Bravo (DevOps) + Operations

---

## 1. Overview

The SDVM system uses two types of cryptographic keys:

1. **SDVMAdminCap**: Capability objects that authorize god lever operations (AdminResolve, AdminSlashOverride, AdminQuorumOverride, AdminPauseStaking, AdminPhaseAdvance)
2. **SDVMEmergencyInvalidationCap**: 2-of-3 multisig emergency invalidation capability (only for mainnet, Tier 4)

This document covers key generation, storage, rotation, and multisig procedures.

---

## 2. TESTNET Environment (T1–T3)

### 2.1 SDVMAdminCap

**Holder:** Single deployer address (Team Bravo lead)

**Reason:** Testnet is for learning. Speed of iteration > trustlessness. No real value at risk.

**Generation:**
```bash
sui keytool generate --key-scheme ed25519
# Output: keypair address (admin_address), secret key (ADMIN_SECRET_KEY)
```

**Storage:**
- **Development:** `~/.sui/sui_config` (local dev environment)
- **Testnet Operator Machines:** Encrypted vault or CI/CD secret manager (e.g., GitHub Actions Secrets, HashiCorp Vault)
- **Never:** GitHub, Slack, email, or any unencrypted medium

**At Deployment:**
```bash
# During contract deployment (Week 3), initialize capability:
sui client call \
  --package <PACKAGE_ID> \
  --module pm_sdvm \
  --function create_admin_cap \
  --sender <ADMIN_ADDRESS> \
  --args <ADMIN_ADDRESS>

# Output: SDVMAdminCap object ID (store in config: ADMIN_CAP_ID="0x...")
```

**No rotation needed during testnet** (if compromise detected, restart testnet and re-deploy)

### 2.2 SDVMEmergencyInvalidationCap (Testnet Only)

**Status:** NOT USED on testnet. God lever AdminResolve is sufficient.

**If needed for testing (optional):**
```bash
# Generate 3 test keypairs:
sui keytool generate --key-scheme ed25519  # Holder 1
sui keytool generate --key-scheme ed25519  # Holder 2
sui keytool generate --key-scheme ed25519  # Holder 3

# Store locally; no real security needed.
```

---

## 3. MAINNET Environment (Phase 4+)

### 3.1 SDVMAdminCap

**Status:** DEPRECATED after god lever removal criteria met (Phase 4, Week 18+)

**Until removal:**
- Promote to 2-of-3 multisig (see 3.2)
- Alternative: Retire immediately post-launch and use only emergency invalidation

### 3.2 SDVMEmergencyInvalidationCap (2-of-3 Multisig)

**Critical:** This is the ONLY god lever on mainnet (post-removal)

**Key Holders (Example — TBD by governance):**

| Role | Identity | Notes |
|------|----------|-------|
| Holder 1 | Team Alpha Lead (internal) | Sui expert, network access |
| Holder 2 | DevOps Lead (internal) | Infrastructure, deployment authority |
| Holder 3 | External Auditor | Independent check, no operational incentive |

**Key Holder Requirements:**
- Must have Sui wallet setup (`sui client` CLI access)
- Must be reachable via secure comms (Signal, encrypted email)
- SLA: <30 minutes from emergency request to signature provision
- Annual rotation: Key holders must re-confirm identity and authority

**Generation (Pre-Mainnet):**

```bash
# Week 19 (before mainnet launch)

# Each holder generates keypair independently:
# Holder 1:
sui keytool generate --key-scheme ed25519
# Output: H1_ADDRESS, H1_SECRET_KEY

# Holder 2:
sui keytool generate --key-scheme ed25519
# Output: H2_ADDRESS, H2_SECRET_KEY

# Holder 3 (external auditor):
sui keytool generate --key-scheme ed25519
# Output: H3_ADDRESS, H3_SECRET_KEY
```

**Storage (Per Holder):**

- **Primary:** Hardware wallet (Ledger, Trezor) or encrypted local key store
- **Backup:** Paper wallet (printed private key) in secure physical vault (bank safe deposit)
- **Never:** Cloud, email, Slack, GitHub, shared drives

**Multisig Initialization (Deployer):**

```bash
# Create 2-of-3 multisig at deployment time:
sui client create-multisig \
  --name mainnet_emergency \
  --key-scheme ed25519 \
  <H1_PUBLIC_KEY> <H2_PUBLIC_KEY> <H3_PUBLIC_KEY> \
  --weights 1 1 1 \
  --threshold 2

# Output: MULTISIG_ADDRESS="0x..."
# Store: MULTISIG_ADDRESS in config, shared with team via secure channel
```

**Capability Distribution:**

At deployment, initialize 3 SDVMEmergencyInvalidationCap objects and transfer to multisig:

```move
// In deployment script:
let cap1 = SDVMEmergencyInvalidationCap { id: new_uid(), holder_index: 0 };
let cap2 = SDVMEmergencyInvalidationCap { id: new_uid(), holder_index: 1 };
let cap3 = SDVMEmergencyInvalidationCap { id: new_uid(), holder_index: 2 };

transfer::public_transfer(cap1, <H1_ADDRESS>);
transfer::public_transfer(cap2, <H2_ADDRESS>);
transfer::public_transfer(cap3, <H3_ADDRESS>);
```

---

## 4. Emergency Invalidation Procedure (Mainnet Tier 4)

**Trigger:** Critical bug or exploitation requiring immediate market invalidation

**Process:**

1. **Request** (Discord / secure chat):
   - Who: Any team member or external observer
   - What: "Emergency invalidation required for dispute [DISPUTE_ID]. Reason: [REASON]. Evidence: [LINK]"
   - Screenshot evidence attached

2. **Review** (Team Lead):
   - Verify legitimacy: is the bug/exploit real?
   - Assess impact: is it worth invalidating?
   - Reach consensus: all three key holders agree

3. **Execution** (2 of 3 holders):

   **Holder 1 signs:**
   ```bash
   sui client call \
     --package <PACKAGE_ID> \
     --module pm_sdvm \
     --function emergency_invalidate_round \
     --args <ROUND_ID> \
     --signer 0x<H1_ADDRESS> \
     --multisig <MULTISIG_ADDRESS>

   # Output: multisig transaction serialized
   # Share with Holder 2 via secure channel
   ```

   **Holder 2 signs & executes:**
   ```bash
   # Receive serialized transaction from Holder 1
   sui client execute-signed-tx --tx-bytes <SERIALIZED_TX>

   # Output: APPROVED! Confirmation hash and on-chain evidence
   # Share confirmation + hash in Discord #security with full context
   ```

4. **Post-Action:**
   - Log: Add entry to EMERGENCY_INVALIDATION_LOG.md
   - Audit: Post-mortem in 24h identifying root cause
   - Governance: Propose parameter changes to prevent recurrence

---

## 5. Key Rotation Policy

### 5.1 Testnet (Ad-Hoc)

If deployer key is compromised:
1. Restart testnet (or mark it as "compromised phase")
2. Re-deploy SDVM with new admin key
3. Invalidate old key in public documentation

### 5.2 Mainnet (Planned)

**Schedule:** Annually (every 52 weeks)

**Procedure:**

1. **Q4 (Week 48–50):** Announce rotation to stakeholders
2. **Week 50:** Existing holders + governance vote to approve new holders (if any changes)
3. **Week 52:** New multisig initialization:
   ```bash
   sui client create-multisig \
     --name mainnet_emergency_2027 \
     <NEW_H1_PK> <NEW_H2_PK> <NEW_H3_PK> \
     --threshold 2
   # Output: NEW_MULTISIG_ADDRESS
   ```
4. **Week 52+1 day:** Deploy SDVMEmergencyInvalidationCap to new multisig
5. **Week 52+2 days:** Retire old multisig (transfer old caps to burn address or freeze in contract)

**No unplanned rotation** unless key holder compromised (triggers immediate emergency procedure above)

---

## 6. Deployment Checklist

**Before Phase 2 Sprint B1 starts (Week 3):**

- [ ] Identify 3 multisig holders (mainnet) or appoint deployer (testnet)
- [ ] Generate keypairs: `sui keytool generate` for each holder
- [ ] Document holder identities + contact info in secure wiki (internal only)
- [ ] Store secret keys in vault (encrypted)
- [ ] Test key access: each holder can sign a dummy transaction
- [ ] Multisig initialization command written and tested on testnet
- [ ] Backup plan: if 1 key holder becomes unavailable, rotation SOP documented
- [ ] Governance approval (if multisig holders include external parties)

**At Deployment (Week 8):**

- [ ] Execute multisig initialization
- [ ] Verify MULTISIG_ADDRESS in on-chain registry
- [ ] Distribute MULTISIG_ADDRESS to all team members (via secure channel)
- [ ] Share emergency procedure doc with holders
- [ ] Emergency-only: Test emergency invalidation on testnet (full dry-run)

---

## 7. Audit Trail

Every emergency invalidation and key action is logged:

```move
// In pm_sdvm.move, every god lever emits audit event:
public struct AdminInvalidationEvent has copy, drop {
    round_id: ID,
    dispute_id: ID,
    invalidating_holder_index: u8,  // 0, 1, or 2
    reason_hash: vector<u8>,         // Hash of off-chain reasoning
    timestamp_ms: u64,
}
```

Queries:
```bash
# View all emergency invalidations:
sui event subscribe --event-type AdminInvalidationEvent | jq '.parsed_json'

# View governance tracker usage:
sui client objects --filter '{contains: "SDVMGovernanceTracker"}' | jq '.admin_resolve_count'
```

---

## 8. Post-Mortem

If emergency invalidation is triggered:

1. **Within 24 hours:** Team post-mortem identifying root cause
2. **Within 72 hours:** Governance discussion on prevention
3. **Within 1 week:** Parameter or code changes deployed to testnet for validation
4. **Next governance cycle:** Mainnet upgrade approved and scheduled

---

## 9. FAQ

**Q: What if Holder 1's key is compromised?**
A: Holder 1 is removed, new holder elected, new multisig created, old multisig frozen in contract. Requires governance vote.

**Q: Can I use a hardware wallet for signing?**
A: Yes. Sui CLI supports Ledger + Trezor. Requires `--ledger` or `--trezor` flag during key generation and signing.

**Q: What if 2 of 3 holders disappear?**
A: System is broken. Mainnet requires governance emergency vote to pause SDVM or re-initialize multisig with backup signers. This is a governance failure, not a technical one — pre-plan with stakeholders.

**Q: Is there a testnet emergency multisig?**
A: No. Testnet uses single SDVMAdminCap (deployer). If compromised, re-deploy. Real multisig testing happens on testnet before mainnet, but governance-voted decisions drive it.

---

**Document Version:** 1.0
**Next Review:** Phase 4 Week 18 (mainnet pre-launch)
**Approvals Needed:** Team Alpha (spec), Team Bravo (ops), Governance (multisig holders)
