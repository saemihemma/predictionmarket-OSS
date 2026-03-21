/**
 * Express server for PhaseTransitionBot with health endpoint.
 *
 * Exposes:
 * - GET /health → HealthStatus (JSON)
 * - POST /shutdown → Graceful shutdown
 *
 * @see SDVM_PHASE_BOT_ARCHITECTURE.md Section 8
 */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import { PhaseTransitionBot } from "./bot.js";

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());

// Config from environment
const SUI_RPC_URL = process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io";
const BOT_KEYPAIR = process.env.BOT_KEYPAIR;
const PM_PACKAGE_ID = process.env.PM_PACKAGE_ID;
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? "3000", 10);
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10);

// Validate required config
if (!BOT_KEYPAIR) {
  console.error("ERROR: BOT_KEYPAIR environment variable not set");
  console.error("Generate with: sui keytool generate ed25519");
  process.exit(1);
}

if (!PM_PACKAGE_ID) {
  console.error("ERROR: PM_PACKAGE_ID environment variable not set");
  process.exit(1);
}

// Create bot instance
let bot: PhaseTransitionBot;
let botStarted = false;

try {
  bot = new PhaseTransitionBot(SUI_RPC_URL, BOT_KEYPAIR, PM_PACKAGE_ID, POLL_INTERVAL_MS);
} catch (err) {
  console.error("Failed to initialize bot:", err);
  process.exit(1);
}

/**
 * GET /health
 * Returns current bot health status for monitoring and alerting.
 *
 * Status codes:
 * - 200: healthy
 * - 503: degraded or critical
 */
app.get("/health", (_req: Request, res: Response) => {
  const status = bot.getStatus();

  const statusCode = status.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(status);
});

/**
 * POST /shutdown
 * Gracefully shutdown the bot (drains active timers, closes connections).
 * Requires Authorization header with bearer token (optional, for safety).
 */
app.post("/shutdown", async (_req: Request, res: Response) => {
  // Optional: Check Authorization header
  // const auth = req.headers.authorization;
  // if (auth !== `Bearer ${SHUTDOWN_TOKEN}`) {
  //   return res.status(401).json({ error: "Unauthorized" });
  // }

  console.log("[server] Shutdown requested via POST /shutdown");
  res.json({ message: "Shutdown initiated" });

  // Give the response time to send, then shutdown
  setTimeout(async () => {
    await bot.shutdown();
    process.exit(0);
  }, 100);
});

/**
 * Liveness probe (simple OK response).
 */
app.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ status: "alive" });
});

/**
 * Readiness probe (check if bot is started).
 */
app.get("/ready", (_req: Request, res: Response) => {
  if (!botStarted) {
    return res.status(503).json({ ready: false, reason: "Bot not started" });
  }
  res.status(200).json({ ready: true });
});

/**
 * Start the server and bot.
 */
async function startServer(): Promise<void> {
  try {
    // Start the bot
    console.log("[server] Starting Phase Transition Bot...");
    await bot.start();
    botStarted = true;
    console.log("[server] ✓ Phase Transition Bot started");

    // Start HTTP server
    const server = app.listen(HEALTH_PORT, () => {
      console.log(`[server] Health endpoint listening on port ${HEALTH_PORT}`);
      console.log(`[server] GET /health → bot status`);
      console.log(`[server] GET /live → liveness probe`);
      console.log(`[server] GET /ready → readiness probe`);
      console.log(`[server] POST /shutdown → graceful shutdown`);
    });

    // Graceful shutdown on SIGTERM/SIGINT
    const shutdown = async (signal: string) => {
      console.log(`[server] Received ${signal}, shutting down...`);
      server.close(async () => {
        await bot.shutdown();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("[server] Failed to start:", err);
    process.exit(1);
  }
}

// Start on module load
startServer();
