import assert from "node:assert/strict";
import test from "node:test";
import { Transaction } from "@mysten/sui/transactions";
import { getSponsoredMoveCallVerdict, getSponsoredTransferVerdict } from "../src/lib/tx-validator.js";

test("allows the public market creation wrapper", () => {
  const verdict = getSponsoredMoveCallVerdict({
    targetPackage: "0xabc",
    module: "pm_market",
    fn: "create_and_share_market",
    pmPackageId: "0xabc",
  });

  assert.equal(verdict.valid, true);
});

test("allows the live first-buy entrypoint", () => {
  const verdict = getSponsoredMoveCallVerdict({
    targetPackage: "0xabc",
    module: "pm_trading",
    fn: "buy",
    pmPackageId: "0xabc",
  });

  assert.equal(verdict.valid, true);
});

test("rejects the lower-level market creation entrypoint", () => {
  const verdict = getSponsoredMoveCallVerdict({
    targetPackage: "0xabc",
    module: "pm_market",
    fn: "create_market",
    pmPackageId: "0xabc",
  });

  assert.equal(verdict.valid, false);
  assert.match(verdict.reason ?? "", /not sponsored for public beta/i);
});

test("allows the narrow Sui framework helper used by public create", () => {
  const verdict = getSponsoredMoveCallVerdict({
    targetPackage: "0x2",
    module: "coin",
    fn: "into_balance",
    pmPackageId: "0xabc",
  });

  assert.equal(verdict.valid, true);
});

test("allows a first-buy transfer that returns the fresh position to the sender", () => {
  const tx = new Transaction();
  const paymentCoin = tx.object("0x1");
  const position = tx.moveCall({
    target: "0xabc::pm_trading::buy",
    arguments: [
      tx.object("0x2"),
      tx.object("0x3"),
      tx.object("0x6"),
      tx.pure.u16(0),
      tx.pure.u64(1n),
      tx.pure.u64(2n),
      tx.pure.u64(3n),
      paymentCoin,
    ],
  });
  tx.transferObjects([position], "0x5");

  const data = tx.getData() as {
    commands: Array<Record<string, unknown>>;
    inputs: Array<Record<string, unknown>>;
  };
  const verdict = getSponsoredTransferVerdict({
    command: data.commands[1] as Record<string, unknown>,
    txData: data as {
      commands: Array<Record<string, unknown>>;
      inputs: Array<Record<string, unknown>>;
    },
    sender: "0x5",
    sponsoredBuyCommandIndexes: new Set([0]),
  });

  assert.equal(verdict.valid, true);
});

test("rejects a first-buy transfer when the recipient is not the sender", () => {
  const tx = new Transaction();
  const paymentCoin = tx.object("0x1");
  const position = tx.moveCall({
    target: "0xabc::pm_trading::buy",
    arguments: [
      tx.object("0x2"),
      tx.object("0x3"),
      tx.object("0x6"),
      tx.pure.u16(0),
      tx.pure.u64(1n),
      tx.pure.u64(2n),
      tx.pure.u64(3n),
      paymentCoin,
    ],
  });
  tx.transferObjects([position], "0x9");

  const data = tx.getData() as {
    commands: Array<Record<string, unknown>>;
    inputs: Array<Record<string, unknown>>;
  };
  const verdict = getSponsoredTransferVerdict({
    command: data.commands[1] as Record<string, unknown>,
    txData: data as {
      commands: Array<Record<string, unknown>>;
      inputs: Array<Record<string, unknown>>;
    },
    sender: "0x5",
    sponsoredBuyCommandIndexes: new Set([0]),
  });

  assert.equal(verdict.valid, false);
  assert.match(verdict.reason ?? "", /transaction sender/i);
});
