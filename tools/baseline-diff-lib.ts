export interface ScenarioMatrixRecord {
  name: string;
  passed: string[];
  failed: string[];
  na: string[];
}

export interface MatrixTransition {
  scenario: string;
  from: 'passed' | 'failed' | 'na';
  to: 'passed' | 'failed' | 'na';
  checks: string[];
}

/** Validate the persisted contract before comparing any results. */
export function parseScenarioMatrix(input: unknown): ScenarioMatrixRecord[] {
  if (!Array.isArray(input)) throw new TypeError('matrix must be an array');
  const names = new Set<string>();
  return input.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError(`scenario ${index} must be an object`);
    const record = row as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.join(',') !== 'failed,na,name,passed') throw new TypeError(`scenario ${index} has unknown or missing fields`);
    if (typeof record.name !== 'string' || !record.name || names.has(record.name)) throw new TypeError(`scenario ${index} has an invalid or duplicate name`);
    names.add(record.name);
    for (const field of ['passed', 'failed', 'na'] as const) {
      if (!Array.isArray(record[field]) || record[field].some(value => typeof value !== 'string' || value.length === 0)) {
        throw new TypeError(`scenario ${record.name} has an invalid ${field} list`);
      }
    }
    const passed = record.passed as string[];
    const failed = record.failed as string[];
    const na = record.na as string[];
    const memberships = [...passed, ...failed, ...na];
    if (new Set(memberships).size !== memberships.length) throw new TypeError(`scenario ${record.name} lists a check more than once`);
    return {
      name: record.name,
      passed,
      failed,
      na,
    };
  });
}

function checkStates(record: ScenarioMatrixRecord): Map<string, 'passed' | 'failed' | 'na'> {
  const states = new Map<string, 'passed' | 'failed' | 'na'>();
  record.passed.forEach(id => states.set(id, 'passed'));
  record.failed.forEach(id => states.set(id, 'failed'));
  record.na.forEach(id => states.set(id, 'na'));
  return states;
}

export function compareScenarioMatrices(before: readonly ScenarioMatrixRecord[], after: readonly ScenarioMatrixRecord[]): MatrixTransition[] {
  const afterByName = new Map(after.map(row => [row.name, row]));
  const beforeByName = new Map(before.map(row => [row.name, row]));
  const names = [...before.map(row => row.name), ...after.map(row => row.name).filter(name => !beforeByName.has(name))];
  const transitions: MatrixTransition[] = [];
  for (const name of names) {
    const oldRow = beforeByName.get(name);
    const newRow = afterByName.get(name);
    if (!oldRow || !newRow) continue;
    const oldStates = checkStates(oldRow);
    const newStates = checkStates(newRow);
    const ids = new Set([...oldStates.keys(), ...newStates.keys()]);
    const grouped = new Map<string, string[]>();
    for (const id of ids) {
      const from = oldStates.get(id);
      const to = newStates.get(id);
      if (!from || !to || from === to) continue;
      const key = `${from}->${to}`;
      const group = grouped.get(key) ?? [];
      group.push(id);
      grouped.set(key, group);
    }
    for (const [key, checks] of grouped) {
      const [from, to] = key.split('->') as [MatrixTransition['from'], MatrixTransition['to']];
      transitions.push({ scenario: name, from, to, checks: checks.sort() });
    }
  }
  return transitions;
}

export function isBaselineRegression(transitions: readonly MatrixTransition[]): boolean {
  return transitions.some(({ from, to }) => (to === 'failed' && from !== 'failed') || (from === 'passed' && to === 'na'));
}


/**
 * A green diff is meaningless if the run silently skipped scenarios or checks.
 * The pinned baseline supplies the expected inventory; never infer it from the
 * result being validated. Each CI shard uses the same round-robin partition as
 * tools/scenarios.ts (--shard part/total, applied after --slow selection).
 *
 * Updating the inventory is a deliberate baseline review, not an automatic
 * side effect of adding a check or a scenario.
 */
export function validateMatrixCoverage(
  baseline: readonly ScenarioMatrixRecord[],
  actual: readonly ScenarioMatrixRecord[],
  shard?: { part: number; total: number },
): string[] {
  const problems: string[] = [];
  if (baseline.length === 0) return ['Pinned baseline is empty'];
  const expected = shard
    ? baseline.filter((_, index) => index % shard.total === shard.part - 1)
    : baseline;
  if (expected.length === 0) return ['Requested shard has no expected scenarios'];
  const expectedByName = new Map(expected.map(row => [row.name, row]));
  const actualByName = new Map(actual.map(row => [row.name, row]));
  for (const row of expected) {
    const found = actualByName.get(row.name);
    if (!found) {
      problems.push(`Missing scenario: ${row.name}`);
      continue;
    }
    const expectedChecks = checkStates(row);
    const actualChecks = checkStates(found);
    for (const id of expectedChecks.keys()) {
      if (!actualChecks.has(id)) problems.push(`Missing check: ${row.name}/${id}`);
    }
    for (const id of actualChecks.keys()) {
      if (!expectedChecks.has(id)) problems.push(`Unexpected check (requires baseline review): ${row.name}/${id}`);
    }
  }
  for (const row of actual) {
    if (!expectedByName.has(row.name)) problems.push(`Unexpected scenario (requires baseline review): ${row.name}`);
  }
  return problems;
}
