/// SUFFER (SFR) — the native token of the Frontier prediction market.
/// Uses Sui's standard coin::create_currency with one-time witness.
/// 2 decimals, 10M pre-minted supply, 95% held in treasury.
module prediction_market::suffer;

use sui::{balance::{Self, Balance}, coin::{Self, TreasuryCap}};

const DECIMALS: u8 = 2;
const TOTAL_SUPPLY: u64 = 10_000_000;
const INITIAL_DEPLOYER_ALLOCATION: u64 = 500_000;
const SCALE: u64 = 100; // 10^DECIMALS
const SYMBOL: vector<u8> = b"SFR";
const NAME: vector<u8> = b"SUFFER";
const DESCRIPTION: vector<u8> =
    b"The cost of pressure. Every unit spent is a condition applied. What remains after cannot be purchased.";

public struct SUFFER has drop {}

/// Wraps TreasuryCap so minting is gated through this module only.
public struct SUFFERTreasuryCap has key, store {
    id: UID,
    treasury_cap: TreasuryCap<SUFFER>,
}

/// Admin capability for token operations (transfer from treasury, burn).
public struct SUFFERAdminCap has key, store {
    id: UID,
}

/// Treasury holding non-circulating SFR balance.
public struct SUFFERTreasury has key {
    id: UID,
    balance: Balance<SUFFER>,
}

#[allow(deprecated_usage)]
fun init(witness: SUFFER, ctx: &mut TxContext) {
    let (mut treasury_cap, metadata) = coin::create_currency(
        witness,
        DECIMALS,
        SYMBOL,
        NAME,
        DESCRIPTION,
        std::option::none(),
        ctx,
    );

    let total_supply_amount = TOTAL_SUPPLY * SCALE;
    let deployer_amount = INITIAL_DEPLOYER_ALLOCATION * SCALE;

    let mut all_coins = coin::mint(&mut treasury_cap, total_supply_amount, ctx);
    let deployer_coins = coin::split(&mut all_coins, deployer_amount, ctx);
    transfer::public_transfer(deployer_coins, tx_context::sender(ctx));

    let treasury_balance = coin::into_balance(all_coins);
    let treasury = SUFFERTreasury {
        id: object::new(ctx),
        balance: treasury_balance,
    };
    transfer::share_object(treasury);

    let wrapped_cap = SUFFERTreasuryCap {
        id: object::new(ctx),
        treasury_cap,
    };
    transfer::transfer(wrapped_cap, tx_context::sender(ctx));

    let admin_cap = SUFFERAdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, tx_context::sender(ctx));

    transfer::public_freeze_object(metadata);
}

/// Admin: transfer SFR from treasury to a recipient.
public fun transfer_from_treasury(
    treasury: &mut SUFFERTreasury,
    _admin: &SUFFERAdminCap,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    let coin = coin::take(&mut treasury.balance, amount, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Take a Balance from the treasury (for internal use by other modules).
public(package) fun take_from_treasury(
    treasury: &mut SUFFERTreasury,
    amount: u64,
): Balance<SUFFER> {
    balance::split(&mut treasury.balance, amount)
}

/// Deposit a Balance back into the treasury.
public(package) fun deposit_to_treasury(
    treasury: &mut SUFFERTreasury,
    funds: Balance<SUFFER>,
) {
    balance::join(&mut treasury.balance, funds);
}

public fun treasury_balance(treasury: &SUFFERTreasury): u64 {
    balance::value(&treasury.balance)
}

public fun decimals(): u8 { DECIMALS }
public fun scale(): u64 { SCALE }

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(SUFFER {}, ctx);
}
