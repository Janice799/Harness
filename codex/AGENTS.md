# Codex Project Guidance

## Purpose

This repository uses a small validation harness to keep Codex work repeatable.

## Applying This Harness To Another Project

When asked to apply this harness to a project, use this instruction:

```text
Use git@github.com:Janice799/Harness.git as the harness template.
Apply the universal harness to this project.
If this is a Codex project, also apply the codex adapter.
Then update harness.config.json for this project's build/test/lint/smoke commands.
Run the quick harness and report the result.
```

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
