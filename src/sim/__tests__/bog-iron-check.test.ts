import { describe, it, expect } from 'vitest';
import { RESOURCE_DEFS } from '../entities/ResourceNode.ts';
import { TECH } from '../knowledge/Tech.ts';
import { telemetry } from '../core/Telemetry.ts';
import { Simulation } from '../core/Simulation.ts';
import { runScenario, SCENARIOS } from '../../../tools/simcheck.ts';

const CHECK_ID = 'iron-ore-is-mined';

function checkFor(setup = SCENARIOS.ironminers!.setup) {
  const scenario = { ...SCENARIOS.ironminers!, setup };
  return runScenario(scenario, 200).checks.find(check => check.id === CHECK_ID)!;
}

describe('iron-ore-is-mined health gate', () => {
  it('mines iron ore through a supplied order', () => {
    const check = checkFor();
    expect(check.skipped).not.toBe(true);
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('iron ore harvested');
  });

  it('fails when the supplied node is absent instead of reporting n/a', () => {
    const originalSetup = SCENARIOS.ironminers!.setup!;
    const check = checkFor(sim => {
      originalSetup(sim);
      const id = telemetry.get('bog_iron_fixture_node_id');
      const node = sim.nodesById.get(id);
      expect(node?.kind).toBe('iron_ore');
      sim.nodesById.delete(id);
      sim.nodes.splice(sim.nodes.indexOf(node!), 1);
      sim.nodeHash.rebuild(sim.nodes);
    });
    expect(check.skipped).not.toBe(true);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('fixture node worked false');
  });

  it('fails when the iron_ore resource row is absent instead of reporting n/a', () => {
    const resource = RESOURCE_DEFS.iron_ore;
    try {
      const scenario = {
        ...SCENARIOS.ironminers!,
        create: (config: ConstructorParameters<typeof Simulation>[0]) => {
          const sim = new Simulation(config);
          delete (RESOURCE_DEFS as unknown as Record<string, unknown>).iron_ore;
          return sim;
        },
      };
      const check = runScenario(scenario, 0).checks.find(item => item.id === CHECK_ID)!;
      expect(check.skipped).not.toBe(true);
      expect(check.ok).toBe(false);
      expect(check.detail).toContain('iron_ore resource false');
    } finally {
      if (resource) RESOURCE_DEFS.iron_ore = resource;
    }
  });

  it('fails when bog_iron technology is absent instead of reporting n/a', () => {
    const node = TECH.bog_iron;
    try {
      delete (TECH as unknown as Record<string, unknown>).bog_iron;
      const check = checkFor();
      expect(check.skipped).not.toBe(true);
      expect(check.ok).toBe(false);
      expect(check.detail).toContain('bog_iron tech false');
    } finally {
      if (node) TECH.bog_iron = node;
    }
  });
});
