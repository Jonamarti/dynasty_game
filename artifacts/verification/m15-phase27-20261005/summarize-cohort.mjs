#!/usr/bin/env node
/**
 * Analysis-only reducer for the paired M15 phase 27 cohort. It never imports
 * game code or changes the source data. Worker rows are merged in sorted file
 * order; later lines replace earlier rows for the same scenario/seed, which
 * lets resumed worker logs supply their latest result.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const expectedSeeds = 20;
const studentTCritical20 = 2.093;
// All non-slow, pre-shallows scenarios. Food-news is replaced below by the
// explicitly paired arm rows, so its ordinary cohort rows never leak in.
const scenarios = [
  'food-news', 'conflicts', 'tiny', 'band', 'crowded', 'century', 'craft',
  'wilds', 'emptied', 'hearths', 'porters', 'scribes', 'harsh-winter',
  'coast', 'traps', 'millers', 'hunters', 'fishers', 'farmers', 'herders',
  'feasts', 'stewards', 'labour', 'polity', 'conquest', 'culture', 'lean',
  'diggers',
];

function readJsonl(file) {
  return readFileSync(join(directory, file), 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: invalid JSON: ${error.message}`);
      }
    });
}

function key(row) {
  if (typeof row.scenario !== 'string' || typeof row.seed !== 'string' ||
      !Number.isFinite(row.peak) || !Number.isFinite(row.end)) {
    throw new Error(`invalid cohort row: ${JSON.stringify(row)}`);
  }
  return `${row.scenario}\u0000${row.seed}`;
}

function mergeRows(files, { skipFoodNews = false } = {}) {
  const latest = new Map();
  for (const file of files) {
    for (const row of readJsonl(file)) {
      if (skipFoodNews && row.scenario === 'food-news') continue;
      const id = key(row);
      const previous = latest.get(id);
      if (previous && (previous.peak !== row.peak || previous.end !== row.end || previous.steps !== row.steps)) {
        throw new Error(`Conflicting duplicate cohort row: ${file}: ${row.scenario}/${row.seed}`);
      }
      latest.set(id, row);
    }
  }
  return latest;
}

function workerFiles(prefix) {
  return readdirSync(directory)
    .filter(name => new RegExp(`^${prefix}-cohort-worker\\d+\\.jsonl$`).test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function survival(row) {
  return row.peak > 0 ? row.end / row.peak * 100 : 0;
}

function summarizeArm(rows) {
  const sumPeak = rows.reduce((sum, row) => sum + row.peak, 0);
  const sumEnd = rows.reduce((sum, row) => sum + row.end, 0);
  return {
    count: rows.length,
    sumPeak,
    sumEnd,
    weightedSurvivalPct: sumPeak > 0 ? sumEnd / sumPeak * 100 : null,
    meanPerSeedSurvivalPct: rows.length > 0
      ? rows.reduce((sum, row) => sum + survival(row), 0) / rows.length
      : null,
    collapsedBelow25Pct: rows.filter(row => row.peak > 0 && row.end / row.peak < 0.25).length,
  };
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sampleStandardDeviation(values, average) {
  if (values.length < 2) return null;
  const sumSquares = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

const baselineFiles = ['baseline-cohort.jsonl', ...workerFiles('baseline')];
const finalFiles = workerFiles('final');
const baseline = mergeRows(baselineFiles, { skipFoodNews: true });
const final = mergeRows(finalFiles, { skipFoodNews: true });

// This focused food-news run has explicit paired arms and is authoritative for
// that scenario, superseding either cohort's ordinary rows.
for (const row of readJsonl('paired-food-news.jsonl')) {
  if (row.scenario !== 'food-news' || !['baseline', 'final'].includes(row.arm)) continue;
  const destination = row.arm === 'baseline' ? baseline : final;
  const { arm, ...cohortRow } = row;
  destination.set(key(cohortRow), cohortRow);
}

function sortedRows(map, scenario) {
  return [...map.values()]
    .filter(row => row.scenario === scenario)
    .sort((a, b) => a.seed.localeCompare(b.seed, 'en'));
}

const pairedRaw = [];
const summaries = scenarios.map(scenario => {
  const baselineRows = sortedRows(baseline, scenario);
  const finalRows = sortedRows(final, scenario);
  const baselineBySeed = new Map(baselineRows.map(row => [row.seed, row]));
  const finalBySeed = new Map(finalRows.map(row => [row.seed, row]));
  const seeds = [...baselineBySeed.keys()].filter(seed => finalBySeed.has(seed)).sort((a, b) => a.localeCompare(b, 'en'));
  const pairedDeltas = seeds.map(seed => survival(finalBySeed.get(seed)) - survival(baselineBySeed.get(seed)));
  const pairedDeltaMeanPp = mean(pairedDeltas);
  const complete = baselineRows.length >= expectedSeeds && finalRows.length >= expectedSeeds &&
    seeds.length >= expectedSeeds;
  const baselineSummary = summarizeArm(baselineRows);
  const finalSummary = summarizeArm(finalRows);
  const weightedLossPp = baselineSummary.weightedSurvivalPct === null || finalSummary.weightedSurvivalPct === null
    ? null : baselineSummary.weightedSurvivalPct - finalSummary.weightedSurvivalPct;
  const sd = pairedDeltaMeanPp === null ? null : sampleStandardDeviation(pairedDeltas, pairedDeltaMeanPp);
  const ciHalfWidth = seeds.length === expectedSeeds && sd !== null
    ? studentTCritical20 * sd / Math.sqrt(expectedSeeds)
    : null;

  for (const seed of seeds) {
    const baselineRow = baselineBySeed.get(seed);
    const finalRow = finalBySeed.get(seed);
    pairedRaw.push({
      scenario,
      seed,
      baseline: baselineRow,
      final: finalRow,
      baselineSurvivalPct: survival(baselineRow),
      finalSurvivalPct: survival(finalRow),
      deltaPp: survival(finalRow) - survival(baselineRow),
    });
  }

  return {
    scenario,
    expectedSeeds,
    baseline: baselineSummary,
    final: finalSummary,
    pairedCount: seeds.length,
    pairedDeltaMeanPp,
    pairedDelta95PctApprox: ciHalfWidth === null ? null : {
      lowerPp: pairedDeltaMeanPp - ciHalfWidth,
      upperPp: pairedDeltaMeanPp + ciHalfWidth,
      halfWidthPp: ciHalfWidth,
      method: 'approximate Student t interval: t(19)=2.093 × paired SEM, n=20',
    },
    baselineMinusFinalWeightedLossPp: weightedLossPp,
    weightedLossGateMax3Pp: complete && weightedLossPp !== null ? weightedLossPp <= 3 : null,
    partial: !complete,
  };
});

pairedRaw.sort((a, b) => a.scenario.localeCompare(b.scenario, 'en') || a.seed.localeCompare(b.seed, 'en'));
const partial = summaries.some(summary => summary.partial);
const summaryDocument = {
  format: 'm15-phase27-cohort-summary-v1',
  expectedClassicScenarios: scenarios.length,
  expectedSeedsPerArmPerScenario: expectedSeeds,
  partial,
  status: partial ? 'partial' : 'complete',
  note: partial
    ? 'At least one scenario has fewer than 20 unique rows in either arm or fewer than 20 matched seeds; do not treat the overall cohort as final.'
    : 'All 28 classic scenarios have at least 20 unique rows in both arms and 20 matched seeds.',
  survivalDefinitions: {
    weighted: '100 × sum(end) / sum(peak), matching tools/seeds.ts',
    arithmeticMeanPerSeed: 'mean of 100 × end / peak for each unique seed; peak=0 contributes 0',
    collapse: 'peak > 0 and end / peak < 0.25',
    pairedDelta: 'final per-seed survival percentage minus baseline percentage',
  },
  scenarios: summaries,
};

writeFileSync(join(directory, 'cohort-summary.json'), `${JSON.stringify(summaryDocument, null, 2)}\n`);
const columns = [
  'scenario', 'baselineCount', 'finalCount', 'pairedCount',
  'baselineWeightedSurvivalPct', 'finalWeightedSurvivalPct',
  'baselineMeanPerSeedSurvivalPct', 'finalMeanPerSeedSurvivalPct',
  'baselineCollapsedBelow25Pct', 'finalCollapsedBelow25Pct',
  'pairedDeltaMeanPp', 'pairedDeltaCi95LowPpApprox', 'pairedDeltaCi95HighPpApprox',
  'baselineMinusFinalWeightedLossPp', 'weightedLossGateMax3Pp', 'partial',
];
const tsvValue = value => value === null || value === undefined ? '' :
  typeof value === 'number' ? Number.isInteger(value) ? String(value) : value.toFixed(4) : String(value);
const tsvRows = summaries.map(summary => [
  summary.scenario,
  summary.baseline.count,
  summary.final.count,
  summary.pairedCount,
  summary.baseline.weightedSurvivalPct,
  summary.final.weightedSurvivalPct,
  summary.baseline.meanPerSeedSurvivalPct,
  summary.final.meanPerSeedSurvivalPct,
  summary.baseline.collapsedBelow25Pct,
  summary.final.collapsedBelow25Pct,
  summary.pairedDeltaMeanPp,
  summary.pairedDelta95PctApprox?.lowerPp ?? null,
  summary.pairedDelta95PctApprox?.upperPp ?? null,
  summary.baselineMinusFinalWeightedLossPp,
  summary.weightedLossGateMax3Pp,
  summary.partial,
].map(tsvValue).join('\t'));
writeFileSync(join(directory, 'cohort-summary.tsv'), `${columns.join('\t')}\n${tsvRows.join('\n')}\n`);
writeFileSync(join(directory, 'cohort-paired.jsonl'), pairedRaw.map(row => JSON.stringify(row)).join('\n') + (pairedRaw.length ? '\n' : ''));

console.log(`${summaryDocument.status}: ${summaries.filter(s => !s.partial).length}/${summaries.length} scenarios complete; ${pairedRaw.length} matched rows written.`);
