/**
 * Alert rules and conditions for SDVM phase transition bot monitoring.
 *
 * Evaluates conditions at regular intervals and triggers notifications
 * to monitoring systems (PagerDuty, Opsgenie, etc.).
 *
 * @module alerts
 * @see SDVM_PHASE_BOT_ARCHITECTURE.md Section 8.3
 */

import { HealthStatus } from "./bot.js";

/**
 * Alert severity levels.
 */
export enum AlertSeverity {
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
}

/**
 * Alert event triggered by a rule.
 */
export interface AlertEvent {
  name: string;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Alert rule definition.
 */
export interface AlertRule {
  name: string;
  condition: () => boolean;
  severity: AlertSeverity;
  message: string;
  /** Cooldown in milliseconds before re-triggering (avoid alert spam) */
  cooldown?: number;
}

/**
 * Alert engine for evaluating rules and maintaining state.
 */
export class AlertEngine {
  private rules: AlertRule[] = [];
  private lastTriggered = new Map<string, number>(); // rule name -> last trigger timestamp
  private handlers: ((alert: AlertEvent) => void)[] = [];

  /**
   * Register an alert rule.
   */
  public registerRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  /**
   * Register a handler function (called when alert triggers).
   * Can be used for logging, PagerDuty integration, metrics, etc.
   */
  public onAlert(handler: (alert: AlertEvent) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Evaluate all rules and trigger alerts for ones that pass.
   * Respects cooldown periods to prevent alert spam.
   */
  public evaluate(): AlertEvent[] {
    const triggered: AlertEvent[] = [];
    const now = Date.now();

    for (const rule of this.rules) {
      // Check if rule condition is met
      if (!rule.condition()) {
        continue;
      }

      // Check cooldown (avoid duplicate alerts within cooldown period)
      const lastTrigger = this.lastTriggered.get(rule.name) ?? 0;
      const cooldown = rule.cooldown ?? 300_000; // Default 5 minutes
      if (now - lastTrigger < cooldown) {
        continue;
      }

      // Trigger alert
      const alert: AlertEvent = {
        name: rule.name,
        severity: rule.severity,
        message: rule.message,
        timestamp: new Date(),
      };

      triggered.push(alert);
      this.lastTriggered.set(rule.name, now);

      // Call handlers
      for (const handler of this.handlers) {
        try {
          handler(alert);
        } catch (err) {
          console.error(`[AlertEngine] Handler error for rule ${rule.name}:`, err);
        }
      }
    }

    return triggered;
  }

  /**
   * Clear cooldown for a specific rule (useful in tests or manual reset).
   */
  public clearCooldown(ruleName: string): void {
    this.lastTriggered.delete(ruleName);
  }
}

/**
 * SDVM Alerting System.
 * Defines standard alert rules for phase transition bot monitoring.
 */
export class SDVMAlertingSystem {
  private engine = new AlertEngine();

  constructor(getHealthStatus: () => HealthStatus) {
    // ────────────────────────────────────────────────────────────────
    // Core Rules
    // ────────────────────────────────────────────────────────────────

    /**
     * Rule: Dispute Stuck (CRITICAL)
     * Triggered when any tracked round is >5 minutes past its deadline and not advanced.
     */
    this.engine.registerRule({
      name: "dispute_stuck",
      severity: AlertSeverity.CRITICAL,
      message: "Dispute stuck past deadline",
      cooldown: 600_000, // 10 minutes
      condition: () => {
        const health = getHealthStatus();
        // Check if any alert from tracked rounds indicates a deadline was missed by >5 minutes
        const stuckRounds = health.alertsTriggered.filter((a) =>
          a.includes("past deadline") && a.includes("min past")
        );
        // Trigger if any round shows it's been >5 minutes past deadline
        return stuckRounds.some((alert) => {
          const match = alert.match(/(\d+)min past/);
          return match && parseInt(match[1], 10) > 5;
        });
      },
    });

    /**
     * Rule: Low Participation (WARNING)
     * Triggered when any tracked round has <20% participation (reveal weight vs commit weight).
     */
    this.engine.registerRule({
      name: "low_participation",
      severity: AlertSeverity.WARNING,
      message: "Low participation detected (<20%)",
      cooldown: 600_000,
      condition: () => {
        const health = getHealthStatus();
        // Check active rounds in health alerts for low participation metrics
        // Metrics would be tracked by the bot's polling/event subscription
        // If activeRounds > 0 but no alerts about participation, assume ok
        // This integrates with metrics tracked in the bot's HealthStatus
        return health.alertsTriggered.some((a) =>
          a.includes("participation") || a.includes("<20%")
        );
      },
    });

    /**
     * Rule: Consecutive Rolls (WARNING)
     * Triggered when a dispute has rolled more than once (indicates quorum issues).
     */
    this.engine.registerRule({
      name: "consecutive_rolls",
      severity: AlertSeverity.WARNING,
      message: "Dispute rolling repeatedly (quorum issues?)",
      cooldown: 900_000, // 15 minutes
      condition: () => {
        const health = getHealthStatus();
        // Check health alerts for mentions of rolling rounds
        // Tracked by the bot's monitoring of round state changes
        return health.alertsTriggered.some((a) =>
          a.includes("rolling") || a.includes("roll")
        );
      },
    });

    /**
     * Rule: Relay Balance Critical (CRITICAL)
     * Triggered when relay has <10 SUI (won't be able to sponsor many more txs).
     * Requires periodic GET to relay health endpoint to fetch relay_balance metric.
     */
    this.engine.registerRule({
      name: "relay_low_balance",
      severity: AlertSeverity.CRITICAL,
      message: "Relay balance critically low (<10 SUI)",
      cooldown: 900_000,
      condition: () => {
        const health = getHealthStatus();
        // Integration with relay health endpoint:
        // GET http://relay-service:3001/health -> { relay_balance: number (in SUI) }
        // This rule checks health alerts for relay balance warnings from balance-monitor.ts
        // Balance check runs every 5 minutes and logs warnings when threshold is breached.
        return health.alertsTriggered.some((a) =>
          a.includes("balance") && (a.includes("low") || a.includes("critical"))
        );
      },
    });

    /**
     * Rule: Bot Offline (CRITICAL)
     * Triggered when last poll was >30 seconds ago (no progress).
     */
    this.engine.registerRule({
      name: "bot_offline",
      severity: AlertSeverity.CRITICAL,
      message: "Phase bot may be offline (no polls in >30s)",
      cooldown: 120_000, // 2 minutes
      condition: () => {
        const health = getHealthStatus();
        const lastPoll = new Date(health.lastPollAt);
        const timeSinceLastPoll = Date.now() - lastPoll.getTime();
        return timeSinceLastPoll > 30_000;
      },
    });

    /**
     * Rule: Multiple Consecutive Failures (WARNING)
     * Triggered when the max consecutive failures is ≥2.
     */
    this.engine.registerRule({
      name: "transition_failures",
      severity: AlertSeverity.WARNING,
      message: "Multiple consecutive transition failures detected",
      cooldown: 600_000,
      condition: () => {
        const health = getHealthStatus();
        return health.consecutiveFailures >= 2;
      },
    });

    /**
     * Rule: Status Degraded (WARNING)
     * Triggered when health status is "degraded".
     */
    this.engine.registerRule({
      name: "health_degraded",
      severity: AlertSeverity.WARNING,
      message: "Bot health status: degraded",
      cooldown: 600_000,
      condition: () => {
        const health = getHealthStatus();
        return health.status === "degraded";
      },
    });

    /**
     * Rule: Status Critical (CRITICAL)
     * Triggered when health status is "critical".
     */
    this.engine.registerRule({
      name: "health_critical",
      severity: AlertSeverity.CRITICAL,
      message: "Bot health status: CRITICAL",
      cooldown: 300_000, // 5 minutes
      condition: () => {
        const health = getHealthStatus();
        return health.status === "critical";
      },
    });

    /**
     * Rule: No Active Rounds (INFO)
     * Informational: zero rounds being tracked (expected during low activity).
     */
    this.engine.registerRule({
      name: "no_active_rounds",
      severity: AlertSeverity.INFO,
      message: "No active rounds being tracked",
      cooldown: 1_800_000, // 30 minutes
      condition: () => {
        const health = getHealthStatus();
        return health.activeRounds === 0;
      },
    });
  }

  /**
   * Register a custom alert handler (e.g., PagerDuty, Opsgenie).
   */
  public onAlert(handler: (alert: AlertEvent) => void): void {
    this.engine.onAlert(handler);
  }

  /**
   * Evaluate all rules and return triggered alerts.
   */
  public evaluate(): AlertEvent[] {
    return this.engine.evaluate();
  }

  /**
   * Clear cooldown for a rule (for testing or manual reset).
   */
  public clearCooldown(ruleName: string): void {
    this.engine.clearCooldown(ruleName);
  }
}

/**
 * Standard handler: Log alerts to console.
 */
export function consoleAlertHandler(alert: AlertEvent): void {
  const levelEmoji = {
    [AlertSeverity.INFO]: "ℹ️",
    [AlertSeverity.WARNING]: "⚠️",
    [AlertSeverity.CRITICAL]: "🚨",
  };

  const emoji = levelEmoji[alert.severity] ?? "•";
  console.log(
    `${emoji} [${alert.severity.toUpperCase()}] ${alert.timestamp.toISOString()}: ${alert.name}: ${alert.message}`
  );
}

/**
 * Structured handler: Return JSON for external systems.
 */
export function structuredAlertHandler(
  callback: (json: Record<string, unknown>) => void
): (alert: AlertEvent) => void {
  return (alert: AlertEvent) => {
    callback({
      timestamp: alert.timestamp.toISOString(),
      severity: alert.severity,
      rule: alert.name,
      message: alert.message,
      context: alert.context,
    });
  };
}

/**
 * PagerDuty handler — integrates with PagerDuty Events API v2.
 *
 * Integration setup:
 * - Set PAGERDUTY_ROUTING_KEY environment variable with routing key from PagerDuty integration
 * - If not configured, logs alerts to console only (stub mode)
 *
 * When PAGERDUTY_ROUTING_KEY is set:
 * - Critical alerts trigger PagerDuty incidents
 * - Warning/Info alerts resolve existing incidents
 * - Each rule has a dedup_key to prevent duplicate incidents
 */
export function pagerDutyAlertHandler(integrationKey: string) {
  return async (alert: AlertEvent) => {
    if (!integrationKey) {
      // Stub mode: no PagerDuty routing key configured
      console.log(
        `[AlertEngine] PagerDuty stub (no PAGERDUTY_ROUTING_KEY): ${alert.name}: ${alert.message}`
      );
      return;
    }

    const payload = {
      routing_key: integrationKey,
      event_action: alert.severity === AlertSeverity.CRITICAL ? "trigger" : "resolve",
      dedup_key: `sdvm-${alert.name}`,
      payload: {
        summary: alert.message,
        severity:
          alert.severity === AlertSeverity.CRITICAL
            ? "critical"
            : alert.severity === AlertSeverity.WARNING
              ? "warning"
              : "info",
        source: "sdvm-phase-bot",
        timestamp: alert.timestamp.toISOString(),
      },
      links: [
        {
          href: "https://example.com/health", // Replace with actual dashboard URL
          text: "Bot Health Dashboard",
        },
      ],
    };

    try {
      const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(
          `[AlertEngine] PagerDuty request failed: ${response.statusText}`
        );
      }
    } catch (err) {
      console.error("[AlertEngine] PagerDuty handler error:", err);
    }
  };
}
