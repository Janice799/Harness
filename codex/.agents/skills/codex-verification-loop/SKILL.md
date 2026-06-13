---
name: codex-verification-loop
description: Run a repeatable Codex project verification loop using the local harness. Use when implementing, reviewing, debugging, or preparing changes where build/test/lint/smoke checks should be run and summarized.
---

# Codex Verification Loop

Use this skill when a task needs repeatable validation.

## Workflow

1. Inspect `harness.config.json`.
2. Choose the smallest useful mode:
   - `quick` for local iteration
   - `full` before commit, PR, release, or handoff
3. Run the harness:

   ```bash
   npm run harness
   ```

   or:

   ```bash
   npm run harness:full
   ```

4. Read `harness/results/latest.json`.
5. Fix required failures before claiming completion.
6. In the final response, report:
   - mode run
   - pass/fail summary
   - any skipped or optional checks
   - remaining failures and exact next action

## Rules

- Do not invent results.
- Do not silently ignore failed required checks.
- If a check is flaky, use configured retries but still report that retry was needed.
- If a check is too slow for quick iteration, move it to the `full` mode instead of deleting it.
- Keep project-specific commands in `harness.config.json`, not inside this skill.
