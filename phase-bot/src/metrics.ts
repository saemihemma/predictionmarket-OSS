/**
 * Prometheus-compatible metrics for SDVM monitoring.
 *
 * Tracks:
 * - Active rounds and phase transitions
 * - Participation rates and slash pool balance
 * - Tally rewards earned
 * - Relay balance
 * - Rate limit rejections
 *
 * @module metrics
 * @see SDVM_PHASE_BOT_ARCHITECTURE.md Section 11
 */

/**
 * Single metric sample with labels.
 */
interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
  timestamp?: number;
}

/**
 * Metrics registry for collecting and exporting metrics.
 */
export class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>(); // histogram name -> values

  /**
   * Increment a counter by 1 or by a specified amount.
   *
   * @param name - Counter name (e.g. "sdvm_tally_reward_earned")
   * @param amount - Amount to increment (default 1)
   * @param labels - Optional labels object
   */
  public incrementCounter(
    name: string,
    amount: number = 1,
    labels?: Record<string, string>
  ): void {
    const key = this.labelKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + amount);
  }

  /**
   * Set a gauge value.
   *
   * @param name - Gauge name (e.g. "sdvm_active_rounds")
   * @param value - Value to set
   * @param labels - Optional labels
   */
  public setGauge(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    const key = this.labelKey(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Record a histogram sample (for computing latency percentiles, etc.).
   *
   * @param name - Histogram name (e.g. "sdvm_phase_transition_latency_ms")
   * @param value - Sample value
   * @param labels - Optional labels
   */
  public recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>
  ): void {
    const key = this.labelKey(name, labels);
    const samples = this.histograms.get(key) ?? [];
    samples.push(value);
    this.histograms.set(key, samples);
  }

  /**
   * Export metrics in Prometheus text format.
   * Returns a multi-line string suitable for /metrics endpoint.
   */
  public exportPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    for (const [key, value] of this.counters) {
      lines.push(`${this.decodeKey(key)} ${value}`);
    }

    // Export gauges
    for (const [key, value] of this.gauges) {
      lines.push(`${this.decodeKey(key)} ${value}`);
    }

    // Export histograms (as quantiles + count + sum)
    for (const [key, samples] of this.histograms) {
      if (samples.length === 0) continue;

      const sorted = [...samples].sort((a, b) => a - b);
      const count = sorted.length;
      const sum = sorted.reduce((a, b) => a + b, 0);
      const p50 = sorted[Math.floor(count * 0.5)];
      const p95 = sorted[Math.floor(count * 0.95)];
      const p99 = sorted[Math.floor(count * 0.99)];

      const [name, labelStr] = this.decodeKey(key).split("{");
      const labelsPart = labelStr ? `{${labelStr}` : "";

      lines.push(`${name}_p50${labelsPart} ${p50}`);
      lines.push(`${name}_p95${labelsPart} ${p95}`);
      lines.push(`${name}_p99${labelsPart} ${p99}`);
      lines.push(`${name}_count${labelsPart} ${count}`);
      lines.push(`${name}_sum${labelsPart} ${sum}`);
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Export metrics as JSON for external systems.
   */
  public exportJSON(): MetricSample[] {
    const samples: MetricSample[] = [];

    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseKey(key);
      samples.push({ name, labels, value, timestamp: Date.now() });
    }

    for (const [key, value] of this.gauges) {
      const { name, labels } = this.parseKey(key);
      samples.push({ name, labels, value, timestamp: Date.now() });
    }

    return samples;
  }

  /**
   * Helper: encode metric name + labels into a single key.
   */
  private labelKey(
    name: string,
    labels?: Record<string, string>
  ): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  /**
   * Parse key back into name and labels.
   */
  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
    if (!match) {
      return { name: key, labels: {} };
    }

    const name = match[1];
    const labels: Record<string, string> = {};

    if (match[2]) {
      const pairs = match[2].split(",");
      for (const pair of pairs) {
        const [k, v] = pair.split("=");
        if (k && v) {
          labels[k] = v.replace(/^"|"$/g, "");
        }
      }
    }

    return { name, labels };
  }

  /**
   * Decode key back to Prometheus format (without quotes).
   */
  private decodeKey(key: string): string {
    // Replace escaped quotes for output
    return key.replace(/"([^"]*)"/g, '$1');
  }
}

/**
 * SDVM Bot Metrics Collector.
 * Wraps the registry and provides convenient methods for common SDVM metrics.
 */
export class SDVMMetricsCollector {
  private registry = new MetricsRegistry();

  /**
   * Set number of currently active (non-SETTLED) rounds.
   */
  public setActiveRounds(count: number): void {
    this.registry.setGauge("sdvm_active_rounds", count);
  }

  /**
   * Record a phase transition latency (milliseconds from deadline to successful call).
   *
   * @param roundId - Round ID being transitioned
   * @param phaseFrom - Source phase (0=COMMIT, 1=REVEAL)
   * @param latencyMs - Time in milliseconds
   */
  public recordPhaseTransitionLatency(
    roundId: string,
    phaseFrom: number,
    latencyMs: number
  ): void {
    const phaseName = phaseFrom === 0 ? "commit_reveal" : "reveal_tally";
    this.registry.recordHistogram("sdvm_phase_transition_latency_ms", latencyMs, {
      phase: phaseName,
      round_id: roundId.slice(0, 8), // Abbreviated ID for log readability
    });
  }

  /**
   * Record participation rate (as basis points: 0-10000).
   * revealed_weight / committed_weight * 10000
   *
   * @param roundId - Round ID
   * @param participationBps - Basis points (0-10000)
   */
  public setParticipationRate(roundId: string, participationBps: number): void {
    this.registry.setGauge("sdvm_participation_rate_bps", participationBps, {
      round_id: roundId.slice(0, 8),
    });
  }

  /**
   * Set slash pool balance (in mist).
   *
   * @param balanceMist - Current slash pool balance in mist
   */
  public setSlashPoolBalance(balanceMist: bigint): void {
    this.registry.setGauge("sdvm_slash_pool_balance", Number(balanceMist) / 1e9);
  }

  /**
   * Increment consecutive rolls counter for a dispute.
   *
   * @param disputeId - Dispute ID
   */
  public incrementConsecutiveRolls(disputeId: string): void {
    this.registry.incrementCounter("sdvm_consecutive_rolls", 1, {
      dispute_id: disputeId.slice(0, 8),
    });
  }

  /**
   * Record tally caller reward earned.
   *
   * @param rewardMist - Reward amount in mist
   */
  public recordTallyRewardEarned(rewardMist: bigint): void {
    this.registry.incrementCounter(
      "sdvm_tally_reward_earned",
      Number(rewardMist) / 1e9
    );
  }

  /**
   * Set relay SUI balance (in SUI units).
   *
   * @param balanceSui - Balance in SUI
   */
  public setRelayBalance(balanceSui: number): void {
    this.registry.setGauge("relay_balance_sui", balanceSui);
  }

  /**
   * Increment rate limit rejection counter.
   *
   * @param reason - Rejection reason (e.g. "dispute_rate_limit", "sender_rate_limit")
   */
  public incrementRateLimitRejection(reason: string): void {
    this.registry.incrementCounter("relay_rate_limit_rejections", 1, {
      reason,
    });
  }

  /**
   * Export metrics in Prometheus format.
   */
  public exportPrometheus(): string {
    return this.registry.exportPrometheus();
  }

  /**
   * Export metrics as JSON.
   */
  public exportJSON() {
    return this.registry.exportJSON();
  }
}
