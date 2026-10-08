/** A supplied, real mining order against a local iron ore node. */
import type { Simulation } from '../src/sim/core/Simulation.ts';
import { RNG } from '../src/sim/core/RNG.ts';
import { telemetry } from '../src/sim/core/Telemetry.ts';
import { ResourceNode, RESOURCE_DEFS } from '../src/sim/entities/ResourceNode.ts';

export function setupIronMining(sim: Simulation): void {
  const miner = sim.livingPeople().find(person => !person.isChild);
  if (!miner) throw new Error('ironminers needs an adult miner');
  miner.knownTech.add('mining');
  miner.needs.hunger = miner.needs.thirst = miner.needs.cold = miner.needs.fatigue = 0;
  miner.workedTicks = 0;
  // This opportunity counter keeps the health gate applicable if the data row
  // disappears; absence must fail visibly instead of becoming n/a.
  telemetry.count('bog_iron_fixture_mining_opportunities');
  if (!RESOURCE_DEFS.iron_ore) return;

  const node = new ResourceNode('iron_ore', Math.round(miner.x), Math.round(miner.y),
    new RNG('iron-mining-health-fixture'), sim.ids);
  node.amount = 12;
  telemetry.count('bog_iron_fixture_node_id', node.id);
  sim.nodes.push(node);
  sim.nodesById.set(node.id, node);
  sim.nodeHash.rebuild(sim.nodes);
  if (sim.order(miner, 'gather', { nodeId: node.id })) {
    telemetry.count('bog_iron_fixture_mining_orders');
  }
}
