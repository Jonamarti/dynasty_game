import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

test('Pages never publishes on an unverified master push', () => {
  if (workflow.includes('\n  workflow_run:')) {
    // Long-term implementation (#38). The triggering CI run and master tip must
    // authorize the exact revision before any build or publish step executes.
    assert.match(workflow, /workflows:\s*\[["']CI["']\]/);
    assert.match(workflow, /types:\s*\[completed\]/);
    assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
    assert.ok(workflow.includes("github.event.workflow_run.event == 'push'"));
    assert.ok(workflow.includes("github.event.workflow_run.head_branch == 'master'"));
    assert.ok(workflow.includes('evaluatePagesAuthorization'));
    assert.ok(workflow.includes('Authorize exact CI commit and global verdict'));
    assert.ok(workflow.includes('steps.verify.outputs.sha'));
    assert.ok(workflow.includes('Reject superseded master before publishing'));
    assert.doesNotMatch(workflow, /\n  workflow_dispatch:\s*\n/);
    return;
  }
  // Temporary interlock: legacy push/dispatch publishing must be unreachable.
  assert.match(workflow, /\n  push:\s*\n/);
  assert.match(workflow, /\n  build:\s*\n(?:[^\n]*\n)*?    if: \$\{\{ false \}\}/);
  assert.match(workflow, /\n  deploy:\s*\n    needs: build\s*\n/);
});
