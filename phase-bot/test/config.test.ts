import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPhaseBotConfig } from "../src/config.js";

test("loadPhaseBotConfig reads manifest-backed defaults from .env-compatible inputs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase-bot-config-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      rpcUrl: "https://example-rpc.invalid",
      packageId: "0xpackage",
      collateralCoinType: "0xcoin::mod::COIN",
      stakingPoolId: "0xpool",
    }),
    "utf8",
  );

  const previous = {
    PM_MANIFEST_PATH: process.env.PM_MANIFEST_PATH,
    BOT_KEYPAIR: process.env.BOT_KEYPAIR,
    SUI_RPC_URL: process.env.SUI_RPC_URL,
    PM_PACKAGE_ID: process.env.PM_PACKAGE_ID,
    PM_COLLATERAL_COIN_TYPE: process.env.PM_COLLATERAL_COIN_TYPE,
    PM_STAKING_POOL_ID: process.env.PM_STAKING_POOL_ID,
  };

  process.env.PM_MANIFEST_PATH = manifestPath;
  process.env.BOT_KEYPAIR = "suiprivkey-test-value";
  delete process.env.SUI_RPC_URL;
  delete process.env.PM_PACKAGE_ID;
  delete process.env.PM_COLLATERAL_COIN_TYPE;
  delete process.env.PM_STAKING_POOL_ID;

  try {
    const config = loadPhaseBotConfig();
    assert.equal(config.rpcUrl, "https://example-rpc.invalid");
    assert.equal(config.pmPackageId, "0xpackage");
    assert.equal(config.collateralCoinType, "0xcoin::mod::COIN");
    assert.equal(config.stakingPoolId, "0xpool");
    assert.equal(config.manifestPath, manifestPath);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadPhaseBotConfig fails closed in deployed mode without explicit envs", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PM_MANIFEST_PATH: process.env.PM_MANIFEST_PATH,
    BOT_KEYPAIR: process.env.BOT_KEYPAIR,
    SUI_RPC_URL: process.env.SUI_RPC_URL,
    PM_PACKAGE_ID: process.env.PM_PACKAGE_ID,
    PM_COLLATERAL_COIN_TYPE: process.env.PM_COLLATERAL_COIN_TYPE,
    PM_STAKING_POOL_ID: process.env.PM_STAKING_POOL_ID,
  };

  process.env.NODE_ENV = "production";
  delete process.env.PM_MANIFEST_PATH;
  process.env.BOT_KEYPAIR = "suiprivkey-test-value";
  delete process.env.SUI_RPC_URL;
  delete process.env.PM_PACKAGE_ID;
  delete process.env.PM_COLLATERAL_COIN_TYPE;
  delete process.env.PM_STAKING_POOL_ID;

  try {
    assert.throws(
      () => loadPhaseBotConfig(),
      /SUI_RPC_URL environment variable not set for deployed phase-bot/,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
