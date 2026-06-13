# Codex Project Guidance

## Purpose

This repository uses a small validation harness to keep Codex work repeatable.

## Required Behavior

- Before editing, inspect the relevant files and existing project conventions.
- After making code changes, run the smallest useful harness mode first:

  ```bash
  npm run harness
  ```

- Before finishing substantial work, run:

  ```bash
  npm run harness:full
  ```

- If a command fails, fix the cause before continuing unless the user explicitly asks to skip it.
- Do not claim a check passed unless it was actually run in this session.
- If a check cannot run because dependencies or credentials are missing, report that clearly.

## Harness Modes

- `quick`: fast checks suitable during development
- `full`: slower checks suitable before commit, PR, or release

## Result Files

Harness reports are written to:

```text
harness/results/latest.json
```
