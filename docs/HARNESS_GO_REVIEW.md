# Harness-go Review Notes

Reference repo: `git@github.com:Janice799/Harness-go.git`

## Summary

`Harness-go` is a more application-like harness implementation. It has a Go
library for case execution plus a server, scheduler, metrics, webhooks, and a
dashboard. This repository stays intentionally smaller: a universal command
runner plus a Codex adapter.

## Useful Ideas To Keep

- Case tags and tag filtering
- Suites grouped in config
- Pipelines made of ordered stages
- Scheduled recurring runs
- Run history with per-case trends
- JSON and CSV exports
- Webhook notifications for failures
- A small dashboard for local visibility

## What Was Added Here

The universal JavaScript runner now supports tags:

```bash
node universal/scripts/harness-runner.js --root universal --tag smoke
```

Checks can define:

```json
{
  "id": "smoke",
  "tags": ["smoke"],
  "command": "node examples/checks/sample-pass.js"
}
```

## Recommended Future Extensions

1. Add `pipelines` to `harness.config.json`.
2. Add an optional `harness serve` dashboard command.
3. Add webhook notification support.
4. Add a scheduler command for local monitoring.
5. Add run comparison using `harness/results/latest.json` and prior reports.

## Keep Out Of The Core For Now

Do not make the default template depend on a long-running server or dashboard.
Most projects need the command runner first. Dashboard, scheduler, and webhooks
should remain optional extensions.
