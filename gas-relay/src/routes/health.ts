import { type Request, type Response } from "express";
import { checkBalance } from "../lib/balance-monitor.js";
import { poolStats } from "../lib/coin-pool.js";
import { getFaucetCampaignHealth } from "./sponsor.js";

export async function healthRoute(_req: Request, res: Response): Promise<void> {
  try {
    const { balance, healthy } = await checkBalance();
    const coins = poolStats();
    const campaign = getFaucetCampaignHealth();
    const ready = healthy && coins.available > 0;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "degraded",
      sponsorBalance: balance.toString(),
      healthy,
      coinPool: coins,
      ...campaign,
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
