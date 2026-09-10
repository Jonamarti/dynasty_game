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
  /**
   * The largest single value ever reported for an event, alongside `counts`'
   * running sum. `path_worst_expanded` is what this exists for: a mean tells
   * you the typical search, and a report that only had means could not
   * distinguish "every search is cheap" from "most are free and one cost
   * five figures" — which is exactly the shape a broken corner rule or a
   * missing region pre-check produces.
   */
  private maxes = new Map<string, number>();
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

  max(event: string, value: number): void {
    if (!this.enabled) return;
    if (value > (this.maxes.get(event) ?? -Infinity)) this.maxes.set(event, value);
  }

  get(event: string): number {
    return this.counts.get(event) ?? 0;
  }

  reset(): void {
    this.counts.clear();
    this.maxes.clear();
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  maxSnapshot(): Record<string, number> {
    return Object.fromEntries(this.maxes);
  }
}

export const telemetry = new Telemetry();
