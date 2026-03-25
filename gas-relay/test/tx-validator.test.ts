import assert from "node:assert/strict";
import test from "node:test";
import { getSponsoredMoveCallVerdict } from "../src/lib/tx-validator.js";

test("allows the public market creation wrapper", () => {
  const verdict = getSponsoredMoveCallVerdict({
    targetPackage: "0xabc",
    module: "pm_market",
    fn: "create_and_share_market",
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
