# Branch lifecycle

Only `prod` and `dev` are permanent. Temporary feature/fix/chore branches are removed after their work is merged. Never automatically discard unmerged work merely to reduce the branch count.

## Native merged-branch cleanup

Use GitHub repository setting **Automatically delete head branches**. Do not add a custom cleanup Action merely to delete successfully merged temporary branches.

This setting is safe only when `dev` and `prod` are protected against deletion. A production PR uses `dev → prod`; protection keeps `dev` permanent while GitHub removes ordinary merged feature/fix/chore heads.

After merging into `dev`, verify the temporary branch is gone. If it remains, inspect the PR state, branch protection/rulesets and whether the branch received new commits after merge before deleting it manually.

Do not automatically delete:
- branches with open PRs,
- unmerged work,
- branches whose purpose is unclear,
- automation branches still in use.

Do not reuse completed temporary branch names.

## Agent completion rule

After a merge:

1. verify the PR is actually merged,
2. verify checks/merge SHA when relevant,
3. verify the temporary remote branch is removed,
4. record unresolved leftovers in Current Handoff,
5. never treat a leftover open branch as an active task without applying Task Continuity.

Locally, agents/users may run `git fetch --prune` and safely remove stale local branches/worktrees only after confirming there is no uncommitted work.

## Repository setup

Protect `prod` and `dev` against deletion and force pushes. Require PRs and relevant checks, including version validation and the production guard. Enable GitHub native automatic head-branch deletion after those protections are in place.

### Required GitHub enforcement for `prod`

The production guard workflow is only a status report until GitHub requires its check. In September 2026, PRs 39 and 40 targeted `prod` directly and were merged while the repository had no ruleset. The guard file alone did not prevent those merges.

An administrator must create an **active branch ruleset** targeting exactly `refs/heads/prod`, with no bypass actors (including repository administrators and integrations):

1. Require a pull request and the `policy / prod-source-and-approval` and `policy / version` checks before merge. The guard rejects every head except this repository's `dev` branch.
2. Block deletion and force pushes, and disable direct branch updates.
3. Keep `prod` locked against updates between explicitly authorized releases. The owner must deliberately unlock it for the specific reviewed `dev → prod` PR, then lock it again after the release. A label is only a supplemental check; agents and integrations can set labels, so it is not proof of the owner's approval.
4. Never enable production auto-merge. Review the live ruleset and a deliberately invalid feature → prod PR before considering the protection verified.

Repository files cannot activate or make GitHub rulesets required. Until the live ruleset is confirmed, treat `prod` as unprotected and do not merge anything into it.

An unmerged abandoned branch needs an explicit reviewed decision to preserve, supersede or discard its unique work. No automatic age-based deletion.

## Adapting branch names

`.agents/project-policy.json` is the machine-readable branch contract. Changing its integration or production branch names is a repository migration, not a one-file edit.

When adapting the names:
1. update/create the actual GitHub branches and protection/rulesets,
2. update workflow triggers and production-source guards,
3. update maintained branch/release documentation and templates,
4. update hosting/deployment branch mappings,
5. run `node scripts/validate-docs.mjs`, `node scripts/validate-agent-stack.mjs` and the project checks before adopting the new flow.

Do not change the policy JSON while leaving CI or deployment rules pointed at the old branches.
