# SDVM Architecture Principles

This document describes the current dispute and voting architecture used by the testnet stack.

## What This Is

SDVM is the tokenholder voting path used when community-settled markets are disputed.

It is not a generic governance framework. In this repository it exists specifically to:

- accept disputed market outcomes
- run commit/reveal voting
- slash incorrect or non-revealed participation
- reward correct participation from the slash pool
- return the dispute flow to a final market state

## Dispute Lifecycle

The current dispute lifecycle is:

1. market closes
2. a resolution is proposed
3. dispute is filed
4. SDVM round is created and shared
5. COMMIT phase runs
6. REVEAL phase runs
7. tally settles or rolls the round
8. dispute is resolved back into market state

The phase bot automates the transition timing, but any review of correctness should still anchor on the Move implementation.

## Key Design Principles

### 1. Shared truth, owned participation

The round itself is shared state, but voter participation records are owned objects. This reduces contention and makes commit flows viable on Sui.

### 2. Commit/reveal, not open voting

Votes are committed as hashes first and only revealed later. This is meant to reduce straightforward herd-following and front-running during the commit window.

### 3. Participation is economically meaningful

Stakers are not passive observers:

- correct participation can earn rewards
- incorrect participation can be slashed
- non-reveal is penalized more heavily than an incorrect reveal

### 4. Testnet still has recovery levers

The testnet system is not pretending to be fully decentralized yet. Admin and emergency controls still exist and should be documented plainly in every serious review.

## Current Voting Model

### Vote phases

- COMMIT
- REVEAL
- TALLY
- SETTLED or rolled forward

### Roll behavior

If quorum or supermajority conditions are not met, the round can roll forward rather than forcing a low-confidence outcome immediately.

### Reward and slash source

Rewards are funded from the slash pool, not from a hidden mint path.

## Repo Surfaces for SDVM Review

Primary code surfaces:

- `contracts/sources/pm_sdvm.move`
- `contracts/sources/pm_staking.move`
- `contracts/sources/pm_dispute.move`
- `phase-bot/src/`

Supporting docs:

- [Prediction Market Architecture](PREDICTION_MARKET_ARCHITECTURE.md)
- [SDVM Testnet Runbook](SDVM_TESTNET_RUNBOOK.md)
- [README](../README.md)

## Known Review Boundaries

When reviewing SDVM in this repo, be explicit about which question you are answering:

- protocol correctness
- economic incentive quality
- operator dependence on testnet
- bot/relay operational safety

Do not compress those into a single vague statement like "the voting system looks good."

## Testnet Honesty Clause

The current deployed system still depends on:

- operator-run off-chain services
- testnet admin capabilities
- live configuration discipline

That does not invalidate the design, but it must be stated plainly in any colleague-facing review.
