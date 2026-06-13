# Universal Harness

This folder contains the tool-agnostic harness. It does not require Codex.

## Run

```bash
npm run harness
npm run harness:ci
npm run harness:full
npm run harness:history
npm run harness:compare
npm run harness:watch
```

Or:

```bash
node scripts/harness-runner.js --mode quick
node scripts/harness-runner.js --check smoke
node scripts/harness-runner.js --tag smoke
node scripts/harness-runner.js --pipeline ci
node scripts/harness-runner.js --history
node scripts/harness-runner.js --compare latest
node scripts/harness-runner.js --mode quick --failures-only
node scripts/harness-scheduler.js --interval 30s --mode quick
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

## History And Comparison

Each run writes timestamped JSON plus `harness/results/latest.json`.

List recent runs:

```bash
npm run harness:history
```

Compare latest with the previous timestamped run:

```bash
npm run harness:compare
```

Compare latest with a specific run id or file:

```bash
node scripts/harness-runner.js --compare 2026-06-13T00-00-00-000Z
node scripts/harness-runner.js --compare harness/results/some-run.json
```

For compact automation output:

```bash
node scripts/harness-runner.js --pipeline ci --summary
node scripts/harness-runner.js --compare latest --summary
```

## Scheduler

Use the scheduler when you want the harness to keep checking a project on an
interval, such as local health monitoring while you work:

```bash
npm run harness:watch
```

That runs `quick` every 30 seconds. To run the CI pipeline every 30 seconds:

```bash
npm run harness:watch:ci
```

Direct usage:

```bash
node scripts/harness-scheduler.js --interval 30s --mode quick
node scripts/harness-scheduler.js --interval 30s --pipeline ci
```

For testing the scheduler without leaving it running:

```bash
node scripts/harness-scheduler.js --interval 1s --max-runs 2
```

Stop a long-running scheduler with `Ctrl+C`.
