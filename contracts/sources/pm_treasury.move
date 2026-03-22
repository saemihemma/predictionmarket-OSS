/// PMTreasury — protocol fee accumulator.
/// NOT touched on every trade. Receives batched fee sweeps from market-local balances.
module prediction_market::pm_treasury;

use sui::{balance::{Self, Balance}, coin, event};
use prediction_market::pm_registry::PMAdminCap;

// ── Events ──

public struct FeesSweptEvent<phantom Collateral> has copy, drop {
    market_id: ID,
    amount: u64,
}

public struct TreasuryWithdrawalEvent<phantom Collateral> has copy, drop {
    amount: u64,
    recipient: address,
}

/// Global fee accumulator. Shared object, but only written during sweeps and withdrawals.
public struct PMTreasury<phantom Collateral> has key {
    id: UID,
    balance: Balance<Collateral>,
    total_fees_collected: u64,
    total_bonds_forfeited: u64,
}

// ── Creation ──

public fun create_treasury<Collateral>(ctx: &mut TxContext): PMTreasury<Collateral> {
    PMTreasury<Collateral> {
        id: object::new(ctx),
        balance: balance::zero<Collateral>(),
        total_fees_collected: 0,
        total_bonds_forfeited: 0,
    }
}

/// Convenience: create and share treasury in one call.
public fun create_and_share_treasury<Collateral>(ctx: &mut TxContext) {
    transfer::share_object(create_treasury<Collateral>(ctx));
}

// ── Deposit operations ──

public(package) fun deposit_fees<Collateral>(
    treasury: &mut PMTreasury<Collateral>,
    fees: Balance<Collateral>,
    market_id: ID,
) {
    let amount = balance::value(&fees);
    treasury.total_fees_collected = treasury.total_fees_collected + amount;
    balance::join(&mut treasury.balance, fees);
    event::emit(FeesSweptEvent<Collateral> { market_id, amount });
}

public(package) fun deposit_forfeited_bond<Collateral>(
    treasury: &mut PMTreasury<Collateral>,
    bond: Balance<Collateral>,
) {
    let amount = balance::value(&bond);
    treasury.total_bonds_forfeited = treasury.total_bonds_forfeited + amount;
    balance::join(&mut treasury.balance, bond);
}

// ── Admin withdrawal ──

public fun withdraw<Collateral>(
    treasury: &mut PMTreasury<Collateral>,
    _admin: &PMAdminCap<Collateral>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::take(&mut treasury.balance, amount, ctx);
    transfer::public_transfer(coin, recipient);
    event::emit(TreasuryWithdrawalEvent<Collateral> { amount, recipient });
}

// ── Read accessors ──

public fun balance<Collateral>(treasury: &PMTreasury<Collateral>): u64 {
    balance::value(&treasury.balance)
}

public fun total_fees_collected<Collateral>(treasury: &PMTreasury<Collateral>): u64 {
    treasury.total_fees_collected
}

public fun total_bonds_forfeited<Collateral>(treasury: &PMTreasury<Collateral>): u64 {
    treasury.total_bonds_forfeited
}
