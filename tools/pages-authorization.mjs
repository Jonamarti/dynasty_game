/**
 * #11: pure deployment authorization policy for GitHub Pages.
 * Call only after fetching the authoritative master tip, the triggering CI
 * attempt's jobs, and the triggering CI run's artifacts via the GitHub API.
 * This module has no side effects and does not itself publish anything.
 */
export function evaluatePagesAuthorization({ run, repository, masterSha, jobs, artifacts }) {
  const errors = [];
  if (!run || typeof run !== 'object') return { allowed: false, errors: ['Missing CI run'] };
  if (typeof repository !== 'string' || !repository.includes('/')) {
    errors.push('Missing target repository');
  }
  if (run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository) {
    errors.push('CI originated outside target repository');
  }
  if (run.name !== 'CI' || run.event !== 'push' ||
      run.head_branch !== 'master' ||
      run.status !== 'completed' || run.conclusion !== 'success') {
    errors.push('Not a successful completed CI push to master');
  }
  if (typeof run.head_sha !== 'string' || !/^[0-9a-f]{40}$/i.test(run.head_sha)) {
    errors.push('Invalid CI commit SHA');
  } else if (run.head_sha !== masterSha) {
    errors.push('Master tip differs from the CI commit');
  }
  if (!Number.isSafeInteger(run.id) || run.id <= 0 ||
      !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) {
    errors.push('Invalid CI run or attempt identity');
  }
  if (!Array.isArray(jobs)) {
    errors.push('CI jobs were not fetched');
  } else {
    const verdicts = jobs.filter(job => job?.name === 'Full verification verdict');
    if (verdicts.length !== 1 || verdicts[0].status !== 'completed' ||
        verdicts[0].conclusion !== 'success') {
      errors.push('Exactly one completed and successful global verdict is required');
    }
  }
  if (!Array.isArray(artifacts)) {
    errors.push('CI artifacts were not fetched');
  } else {
    const expected = 'ci-global-verdict-' + run.run_attempt;
    const valid = artifacts.filter(artifact => artifact?.name === expected &&
      artifact.expired === false && Number(artifact.size_in_bytes) > 0);
    if (valid.length !== 1) {
      errors.push('Exactly one nonexpired, nonempty verdict artifact is required for this attempt');
    }
  }
  return { allowed: errors.length === 0, errors, sha: errors.length ? null : run.head_sha };
}
