# Universal Harness

This folder contains the tool-agnostic harness. It does not require Codex.

## Run

```bash
npm run harness
npm run harness:full
```

Or:

```bash
node scripts/harness-runner.js --mode quick
node scripts/harness-runner.js --check smoke
```

## Configure

Edit `harness.config.json`.

Each check supports:

- `id`: stable check id
- `name`: display name
- `command`: shell command to run
- `timeoutMs`: timeout in milliseconds
- `retries`: retry count after the first attempt
- `required`: whether failure should fail the whole run

## Modes

Use modes to separate fast iteration from slower release checks:

```json
{
  "modes": {
    "quick": ["lint", "unit", "smoke"],
    "full": ["install-check", "lint", "unit", "build", "smoke"]
  }
}
```
