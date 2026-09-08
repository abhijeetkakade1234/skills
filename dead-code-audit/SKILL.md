---
name: dead-code-audit
description: Full-repo code-quality and maintainability audit for dead code, duplicate logic, unused UI components, overly complex implementations, legacy code, redundant DB/API calls, abandoned files, and tech debt. Use when the user asks for a codebase cleanup review, a dead-code audit, a maintainability pass, or wants to find what can be deleted or simplified.
---

# Dead-code / maintainability audit

Act as a senior software engineer performing a code quality and maintainability
review. Identify what does not provide value and give a safe, prioritized plan
to remove or fix it. Be aggressive in surfacing candidates, conservative in the
risk assessment for each one.

## What to look for

Check every relevant repo area for:

1. Dead code: unused functions, files, components, routes, APIs, variables,
   imports, dependencies.
2. Duplicate logic that should be consolidated.
3. Unused UI components.
4. Overly complex implementations that can be simplified.
5. Legacy code that is no longer needed.
6. Redundant database queries or API calls.
7. Files that appear abandoned or disconnected from the application.
8. Opportunities to reduce technical debt.

For every finding, report:

- **What it is**: file:line or file/dir.
- **Why it is unnecessary**: actual evidence, such as grep results or call-graph
  tracing. Never call something dead on vibes.
- **Impact of removing it**: lines saved, bundle/deploy size, complexity, or
  maintenance burden.
- **Risk before deletion**: external clients, cron, migrations, tests, deployed
  hardware/firmware, support scripts, or other unknown callers.
- **Recommended action**: delete now / verify then delete / consolidate with X /
  archive, do not delete / leave alone and why.

Always grep the whole repo before claiming code is dead. A backend route might
only be called from frontend code, and a shared utility might be imported from a
different app.

## Run the audit

Identify the repo's real top-level areas first. Split by deployable or service
boundary, not by file count. For example, in a repo with `apps/backend`,
`apps/frontend`, `apps/lambda`, `apps/edge`, `apps/processed_uploading`, and
`apps/stream_uploading`, use:

- `apps/backend`
- `apps/frontend`
- `apps/lambda`
- `apps/edge`, `apps/processed_uploading`, and `apps/stream_uploading` together
  if they are small and related

Launch one subagent per area in parallel when subagents are available. Each
subagent prompt must:

- State the work is read-only and must not edit files.
- Name the specific directories in scope.
- Include short architectural context: what the area does, what talks to it, and
  known patterns to compare against.
- Repeat the 8 audit categories with 1-2 concrete, area-specific examples.
- Require whole-repo grep evidence before any dead-code claim.
- Cap the response to 1200-1500 words.
- Prioritize high-confidence, high-impact findings over exhaustive nitpicking.
- For hardware, firmware, infra, or field-deployed software, prefer "archive,
  do not delete" and "verify with owner" over deletion.

Wait for all subagents to report back. Do not duplicate an agent's scoped grep
work while it is running.

If subagents are unavailable, do the same split locally with `rg`, one area at a
time, and keep notes by tier.

## Consolidate the report

Merge findings into one deduplicated report grouped by actionability:

1. **Safe to delete now**: zero references found anywhere, no ambiguity.
2. **Verify with someone first, then delete**: likely dead, but external callers,
   feature flags, env-gated paths, cron, migrations, tests, support scripts, or
   deployed systems need quick human confirmation.
3. **Do not touch without sign-off**: hardware, infra, field-deployment risk, or
   live experimental/unvalidated production paths.
4. **Consolidation opportunities**: real duplication worth fixing, but larger
   than a delete.
5. **Repo hygiene**: gitignore gaps, tracked build artifacts, generated files,
   stale outputs, or checked-in local data.
6. **Architectural notes**: undocumented deployment tracks, doc/code
   disagreement, config drift, or decisions surfaced by the audit.

Present the merged report in chat unless the user asks for a tracking document.

## Tracking checklist

If asked to track the audit as a checklist, write or update
`TECH_DEBT_CLEANUP.md` at the repo root using the same tier structure above.
Use one `- [ ]` checkbox per finding, with enough context to action it later:
file path, why, risk, and recommended action.

When updating an existing checklist:

- Do not duplicate already tracked items.
- Preserve checked boxes.
- Append genuinely new findings.

When working through the checklist, handle one item at a time: make the change,
verify it with the smallest relevant test/build/syntax check, then check the
box. Do not batch unrelated deletions into one uncommitted pile.
