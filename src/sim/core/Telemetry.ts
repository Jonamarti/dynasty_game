/**
 * Opt-in event counters.
 *
 * Disabled by default so the browser build pays nothing; the headless harness
 * enables it and turns the counts into the event histogram of the health report.
 * Counting events is how `sim:check` can assert "people actually eat" rather
 * than merely "the simulation did not crash".
 */
class Telemetry {
  private counts = new Map<string, number>();
  private enabled = false;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  count(event: string, amount = 1): void {
    if (!this.enabled) return;
    this.counts.set(event, (this.counts.get(event) ?? 0) + amount);
  }

  get(event: string): number {
    return this.counts.get(event) ?? 0;
  }

  reset(): void {
    this.counts.clear();
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}

export const telemetry = new Telemetry();
