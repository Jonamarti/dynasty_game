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
  return transitions.some(({ from, to }) => from === 'passed' && (to === 'failed' || to === 'na'));
}
