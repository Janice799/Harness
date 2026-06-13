# Codex Adapter

This folder contains Codex-specific files that make Codex use the universal
harness consistently.

Add these files to a project after adding the `universal/` harness files.

## Files

```text
AGENTS.md
.agents/skills/codex-verification-loop/SKILL.md
.codex/hooks.json
.codex/hooks/stop_quick_check.js
```

## What Each File Does

- `AGENTS.md` tells Codex the project validation rules.
- `.agents/skills/codex-verification-loop/SKILL.md` defines a reusable workflow.
- `.codex/hooks.json` registers a `Stop` hook.
- `.codex/hooks/stop_quick_check.js` runs the quick harness when Codex stops a turn.

Codex requires hook review/trust before non-managed hooks run.

## Expected Project Root

After copying both layers, your project root should contain:

```text
AGENTS.md
.agents/
.codex/
harness.config.json
scripts/harness-runner.js
```

Then run:

```bash
npm run harness
```
