# Universal Harness

This folder contains the tool-agnostic harness. It does not require Codex.

## Run

```bash
npm run harness
npm run harness:ci
npm run harness:full
```

Or:

```bash
node scripts/harness-runner.js --mode quick
node scripts/harness-runner.js --check smoke
node scripts/harness-runner.js --tag smoke
node scripts/harness-runner.js --pipeline ci
```

## Configure

Edit `harness.config.json`.

Each check supports:

- `id`: stable check id
- `name`: display name
- `command`: shell command to run
- `tags`: optional labels for filtering checks
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

## Pipelines

Use pipelines for ordered stages with fail-fast behavior:

```json
{
  "pipelines": {
    "ci": [
      { "name": "quality", "mode": "quick", "failFast": true },
      { "name": "build", "check": "build", "failFast": true }
    ]
  }
}
```

Run:

```bash
npm run harness:ci
```
