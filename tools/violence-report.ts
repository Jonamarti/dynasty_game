export function aggressionSummary(values: readonly number[]): { median: string; aboveHalf: string } {
  if (values.length === 0) return { median: 'n/a', aboveHalf: 'n/a' };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[sorted.length >> 1]!.toFixed(2),
    aboveHalf: (sorted.filter(value => value > 0.5).length / sorted.length * 100).toFixed(0) + '%',
  };
}

export function opensAdultAssaultWindow(type: string, isChild: boolean): boolean {
  return type === 'assault' && !isChild;
}
