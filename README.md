# Harness Template

A small verification harness template with two layers:

1. `universal/` - a runtime-agnostic harness runner for build, test, lint, and smoke checks.
2. `codex/` - Codex-specific guidance, skills, and hooks that use the universal harness.

Use only `universal/` if you want a normal project harness. Add `codex/` when
you want Codex to follow the same validation loop automatically.

## Repository Layout

```text
harness-template/
  universal/
    harness.config.json
    scripts/harness-runner.js
    examples/checks/sample-pass.js

  codex/
    AGENTS.md
    .agents/skills/codex-verification-loop/SKILL.md
    .codex/hooks.json
    .codex/hooks/stop_quick_check.js

  .github/workflows/harness.yml
```

## Try It

From the repo root:

```bash
npm run harness
npm run harness:full
```

Or run the universal harness directly:

```bash
cd universal
npm run harness
```

## Use In Any Project

Copy the contents of `universal/` into your project root:

```text
harness.config.json
scripts/harness-runner.js
examples/checks/sample-pass.js
package.json scripts
```

Then edit `harness.config.json`:

```json
{
  "id": "unit",
  "command": "npm test",
  "required": true
}
```

## Use With Codex

First add the universal harness to your project. Then copy the contents of
`codex/` into the same project root:

```text
AGENTS.md
.agents/
.codex/
```

Codex will read `AGENTS.md` automatically. You can also explicitly ask Codex to
use `$codex-verification-loop`.

## Reports

Harness reports are written to:

```text
harness/results/latest.json
harness/results/<timestamp>.json
```

## License

MIT
