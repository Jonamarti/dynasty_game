# Deployment authorization — issue #11

This PR is stacked on #37 (which is stacked on #34). The deploy workflow no longer accepts manual dispatch or direct push; it receives only completed `CI` runs.

Authorization is **fail-closed**: same repository (head and base), workflow `CI`, successful conclusion, `push` event on `master`, valid SHA currently at the master tip, exactly one successful `Full verification verdict` job for the *triggering attempt*, and exactly one non-expired `ci-global-verdict-<attempt>` artifact. The build checks out the **verified SHA** rather than the deploy workflow branch. A second master-tip check guards against superseding commits just before the Pages deployment.

A failing/cancelled/skipped E2E or scenario shard blocks the global verdict, therefore cannot authorize deployment. The old green fast branch gate cannot authorize it either. Manual `workflow_dispatch` is intentionally removed. Credentials use read-only checkout; Pages and OIDC permissions are scoped to the publish job.

**Limits:** This PR must not be merged before its stacked dependencies. The workflow_run event reads the default-branch workflow, so a real end-to-end deployment cannot be proven by a branch PR run. Validate the configuration and authorization cases on the branch first, then verify a real eligible CI push on master after integrating prerequisites. Do not trigger a production deploy merely to test the gate. The SHA-tip check happens prior to `deploy-pages`, not atomically with the Pages API. Any stricter atomicity needs an environment policy. `master` currently has no required status protection; configure `Full verification verdict` as required separately. No gameplay/seed/save/artifact screenshot changes are introduced.

## Authorization scenarios
| CI input | Expected |
| --- | --- |
| Successful full CI push on master for current SHA with verdict and artifact | Permit |
| Failed, cancelled, or skipped CI | Reject |
| PR run, branch run, manual dispatch, or fork | Reject |
| Successful fast-only run without global verdict | Reject |
| Old SHA after master moves | Reject |
| Artifact from another attempt or absent verdict job | Reject |

## 2026-11-03 — synchronize the verified-deploy branch

The stacked branch is updated to include #37's current full-verdict workflow, the latest master screenshot-history protections, and the shared exact Node pin from `.nvmrc`. Both setup-node steps in `deploy.yml` and the authorization-test workflow now use `.nvmrc`, while the deployment still checks the triggering successful CI run, its same-SHA global verdict, and the current `master` tip before publishing. This synchronization does not deploy Pages and does not alter game mechanics or the matrix baseline. Fresh CI and the negative authorization tests must pass before the PR leaves draft.
