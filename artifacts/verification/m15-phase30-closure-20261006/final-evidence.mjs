import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const dir = 'artifacts/verification/m15-phase30-closure-20261006/';
const read = name => readFileSync(dir + name, 'utf8');
const matrixRows = text => [...text.matchAll(/^  (\S+)\s+(\d+)\/(\d+)\s+[\d,]+\s+(.+)$/gm)]
  .map(([, name, passed, total, failed]) => ({ name, passed: Number(passed), total: Number(total),
    failures: failed.trim() === '-' ? [] : failed.trim().split(', ') }));
const currentMatrixText = read('matrix-closed.log');
assert(currentMatrixText.includes('SOME SCENARIOS FAILED'));
const matrix = matrixRows(currentMatrixText);
const previousMatrix = matrixRows(read('matrix-before.log'));
assert.equal(matrix.length, 32);
for (const previous of previousMatrix) assert.deepEqual(matrix.find(row => row.name === previous.name), previous);
assert.deepEqual(matrix.find(row => row.name === 'frontier-cohort'),
  { name: 'frontier-cohort', passed: 3, total: 3, failures: [] });
assert.equal(matrix.reduce((sum, row) => sum + row.failures.length, 0), 116);

const beforeClosure = JSON.parse(read('classic-matrix-before.json'));
const beforePhase = JSON.parse(read('classic-phase29-before.json'));
const after = JSON.parse(read('classic-matrix-after.json'));
assert.equal(beforePhase.length, 30); assert.equal(after.length, 30);
assert.deepEqual(after, beforeClosure); assert.deepEqual(after, beforePhase);
assert(read('classic-closed.log').includes('All classic scenario final checkpoints and check results match.'));

const log = read('frontier-cohort-final20.log');
assert(log.includes('MEAN SURVIVAL'));
const population = [...log.matchAll(/^  (\w+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/gm)]
  .map(([, seed, peak, end, roundedPercent, born, infants, children, adults]) => ({ seed,
    peak: Number(peak), end: Number(end), roundedEndOverPeakPercent: Number(roundedPercent),
    born: Number(born), starvationInfants: Number(infants), starvationChildren: Number(children), starvationAdults: Number(adults) }));
// The last two columns of the historic log lack a delimiter on overflow.
// Parse only the unambiguous first six water fields; use printed aggregates
// for observed hydration and net fish decline, never manufacture missing data.
const water = [...log.matchAll(/^    (\w+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/gm)]
  .map(([, seed, fresh, sea, dehydration, starvation, shallow, crossed]) => ({ seed,
    freshDrinkingTicks: Number(fresh), autonomousSeaDrinkingTicks: Number(sea), dehydrationDeaths: Number(dehydration),
    starvationDeaths: Number(starvation), shallowRiverObservations: Number(shallow), provenBankToBankCrossings: Number(crossed) }));
assert.equal(population.length, 20); assert.equal(water.length, 20);
const waterLine = log.split('\n').find(line => line.includes('FRONTIER WATER'));
const number = pattern => { const match = log.match(pattern); assert(match); return Number(match[1]); };
const totals = {
  meanEndOverPeakPercent: number(/MEAN SURVIVAL ([\d.]+)%/),
  freshDrinkingTicks: number(/freshwater drinking ticks (\d+)/),
  autonomousSeaDrinkingTicks: number(/autonomous sea (?:drinks|drinking ticks) (\d+)/),
  dehydrationDeaths: number(/dehydration deaths (\d+)/),
  shallowRiverObservations: number(/shallow-river observations (\d+)/),
  provenBankToBankCrossings: number(/bank-to-bank crossings (\d+)/),
  freshFishStockNetDecline: number(/fresh fish stock net decline ([\d.]+)/),
  hydratingFoodUnitsObserved: number(/food units observed in eatenToday (\d+)/),
  aiHydratingFoodCandidateObservations: number(/AI candidate observations (\d+)/),
  saltVisibleAutonomousNpcOpportunities: null,
};
for (const field of ['freshDrinkingTicks', 'autonomousSeaDrinkingTicks', 'dehydrationDeaths', 'shallowRiverObservations', 'provenBankToBankCrossings'])
  assert.equal(water.reduce((sum, row) => sum + row[field], 0), totals[field]);
totals.births = population.reduce((sum, row) => sum + row.born, 0);
totals.deaths = number(/\((\d+) deaths\)/);
totals.starvationDeaths = water.reduce((sum, row) => sum + row.starvationDeaths, 0);
totals.starvationInfants = population.reduce((sum, row) => sum + row.starvationInfants, 0);
totals.starvationAdults = population.reduce((sum, row) => sum + row.starvationAdults, 0);
const habitatCounts = log.match(/fresh\/salt fish nodes (\d+)\/(\d+)/); assert(habitatCounts);
totals.freshFishNodes = Number(habitatCounts[1]); totals.saltFishNodes = Number(habitatCounts[2]);
assert.equal(Number((population.reduce((sum, row) => sum + row.end / row.peak * 100, 0) / 20).toFixed(1)), totals.meanEndOverPeakPercent);
totals.collapseSeeds = population.filter(row => row.end < row.peak / 4).length;
totals.extinctionSeeds = population.filter(row => row.end === 0).length;
assert.equal(totals.dehydrationDeaths, 0); assert.equal(totals.autonomousSeaDrinkingTicks, 0);
const evidence = { referenceBeforePhase: '3d585f6', referenceBeforeClosure: '8aba05f',
  classicalStatesEqual: 30, codecFallbackScenarios: after.filter(row => row.configFallback).map(row => row.name),
  classicalFailingChecksPreserved: 116, matrix, cohort: { stepsPerSeed: 12000, ticksPerDay: 60,
    yearsOfGameCalendarPerSeed: 5, totals, waterSummarySource: waterLine.trim(),
    caveats: ['end/peak is population retention, not individual survival',
      'shallow observations are person-ticks, not steps or crossings',
      'fish decline is net stock, not exact harvest', 'daily ledger can omit hydration observations',
      'salt opportunity count was not printed for this cohort; null means unavailable'],
    seeds: population.map(row => ({ ...row, ...water.find(entry => entry.seed === row.seed) })) } };
writeFileSync(dir + 'final-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ classicalStatesEqual: evidence.classicalStatesEqual, classicalFailingChecksPreserved: 116,
  cohort: totals }, null, 2));
