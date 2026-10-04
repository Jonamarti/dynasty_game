import { Simulation } from '../../../src/sim/core/Simulation.ts';

// Isolated fault injection: reproduce a retired owner whose entrypoint ignores
// its lease. The production implementation stays intact for concurrent checks.
(Simulation.prototype as unknown as { assertExecutionAuthority(): void }).assertExecutionAuthority = () => {};
