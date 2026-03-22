import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PhaseTransitionBot } from "./bot.js";
import { loadPhaseBotConfig } from "./config.js";

dotenv.config();

const app: Express = express();
app.use(cors());
app.use(express.json());

let bot: PhaseTransitionBot;
let botStarted = false;

try {
  const config = loadPhaseBotConfig();
  console.log(`[phase-bot] rpc=${config.rpcUrl}`);
  console.log(`[phase-bot] package=${config.pmPackageId}`);
  console.log(`[phase-bot] collateral=${config.collateralCoinType}`);
  console.log(`[phase-bot] stakingPool=${config.stakingPoolId}`);
  if (config.manifestPath) {
    console.log(`[phase-bot] manifest=${config.manifestPath}`);
  }

  bot = new PhaseTransitionBot({
    rpcUrl: config.rpcUrl,
    botKeypair: config.botKeypair,
    pmPackageId: config.pmPackageId,
    collateralCoinType: config.collateralCoinType,
    stakingPoolId: config.stakingPoolId,
    pollIntervalMs: config.pollIntervalMs,
  });

  app.get("/health", (_req: Request, res: Response) => {
    const status = bot.getStatus();
    res.status(status.status === "healthy" ? 200 : 503).json(status);
  });

  app.get("/live", (_req: Request, res: Response) => {
    res.status(200).json({ status: "alive" });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    if (!botStarted) {
      return res.status(503).json({ ready: false, reason: "Bot not started" });
    }
    return res.status(200).json({ ready: true });
  });

  void startServer(config.healthPort);
} catch (err) {
  console.error("[phase-bot] failed to initialize:", err);
  process.exit(1);
}

async function startServer(healthPort: number): Promise<void> {
  try {
    await bot.start();
    botStarted = true;

    const server = app.listen(healthPort, () => {
      console.log(`[phase-bot] health server listening on port ${healthPort}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[phase-bot] received ${signal}, shutting down...`);
      server.close(async () => {
        await bot.shutdown();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (err) {
    console.error("[phase-bot] failed to start:", err);
    process.exit(1);
  }
}
