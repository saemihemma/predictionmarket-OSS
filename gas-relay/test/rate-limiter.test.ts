import assert from "node:assert/strict";
import test from "node:test";
import { extractDisputeRoundId } from "../src/lib/rate-limiter.js";

test("extracts SDVM vote-round IDs for per-round throttling", () => {
  const txData = {
    commands: [
      {
        MoveCall: {
          target: "0xabc::pm_sdvm::commit_vote",
          arguments: [{ Object: "0xround" }],
        },
      },
    ],
  };

  assert.equal(extractDisputeRoundId(txData, "0xabc"), "0xround");
});

test("extracts dispute IDs for pm_dispute lifecycle throttling", () => {
  const txData = {
    commands: [
      {
        MoveCall: {
          target: "0xabc::pm_dispute::try_resolve_dispute",
          arguments: [{ Object: "0xdispute" }],
        },
      },
    ],
  };

  assert.equal(extractDisputeRoundId(txData, "0xabc"), "0xdispute");
});
