import { type Request, type Response } from "express";
import { checkBalance } from "../lib/balance-monitor.js";
import { poolStats } from "../lib/coin-pool.js";

export async function healthRoute(_req: Request, res: Response): Promise<void> {
  try {
    const { balance, healthy } = await checkBalance();
    const coins = poolStats();
    res.json({
      status: healthy && coins.available > 0 ? "ok" : "degraded",
      sponsorBalance: balance.toString(),
      healthy,
      coinPool: coins,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
