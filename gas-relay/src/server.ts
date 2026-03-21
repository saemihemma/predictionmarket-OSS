import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { sponsorRoute, executeRoute } from "./routes/sponsor.js";
import { healthRoute } from "./routes/health.js";
import { checkBalance } from "./lib/balance-monitor.js";
import { initCoinPool } from "./lib/coin-pool.js";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? "*",
  methods: ["POST", "GET"],
}));
app.use(express.json({ limit: "256kb" }));

// ── B-2: Global rate limiting ──
// Simple in-memory sliding window. No dependency needed for testnet.
// Per-dispute and per-sender rate limiting implemented in tx-validator.ts (Layer 5).
// Per-market rate limiting deferred: at testnet scale, per-dispute limits (100/hr) + per-sender
// limits (20/hr) are sufficient. Revisit if single markets exceed 500 disputes/hour in production.
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT ?? "120", 10);
const requestTimestamps: number[] = [];

function rateLimitMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const now = Date.now();
  // Prune old entries
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW_MS) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_MAX_REQUESTS) {
    res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
    return;
  }
  requestTimestamps.push(now);
  next();
}

// Apply rate limit only to sponsor/execute routes, not health
app.use("/v1", rateLimitMiddleware);

// ── API Key check (optional, enabled when API_KEY env is set) ──
const API_KEY = process.env.API_KEY ?? "";

function apiKeyMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!API_KEY) {
    // No API key configured — skip check (testnet mode)
    next();
    return;
  }
  const provided = req.headers["x-api-key"] ?? req.headers["authorization"]?.replace("Bearer ", "");
  if (provided !== API_KEY) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}

app.use("/v1", apiKeyMiddleware);

// Routes
app.get("/health", healthRoute);
app.post("/v1/sponsor", sponsorRoute);
app.post("/v1/execute", executeRoute);

async function start() {
  // Validate required config
  if (!process.env.SPONSOR_KEYPAIR_B64) {
    console.error("[gas-relay] FATAL: SPONSOR_KEYPAIR_B64 not set");
    process.exit(1);
  }
  if (!process.env.PM_PACKAGE_ID || process.env.PM_PACKAGE_ID === "0x0") {
    console.warn("[gas-relay] WARNING: PM_PACKAGE_ID not set — tx validation will reject all calls");
  }

  // Initialize coin pool before accepting requests
  await initCoinPool();
  await checkBalance();

  app.listen(PORT, () => {
    console.log(`[gas-relay] listening on :${PORT}`);
    console.log(`[gas-relay] rate limit: ${RATE_MAX_REQUESTS} req/${RATE_WINDOW_MS / 1000}s`);
    console.log(`[gas-relay] API key: ${API_KEY ? "enabled" : "disabled (testnet mode)"}`);
    // Check balance every 5 minutes
    setInterval(() => checkBalance().catch(console.error), 5 * 60 * 1000);
  });
}

start().catch((err) => {
  console.error("[gas-relay] Failed to start:", err);
  process.exit(1);
});
