# Apply This Harness With An Agent

Give this file to a coding agent when you want it to install the harness into a
project.

## Agent Instruction

```text
Use git@github.com:Janice799/Harness.git as the harness template.
Apply the universal harness to this project.
If this is a Codex project, also apply the codex adapter.
Then update harness.config.json for this project's build/test/lint/smoke commands.
Run the quick harness, compare it with the previous run if history exists, and report the result.
```

## What The Agent Should Do

1. Fetch or inspect `git@github.com:Janice799/Harness.git`.
2. Copy the contents of `universal/` into the target project root.
3. If the target project uses Codex, copy the contents of `codex/` into the
   target project root.
4. Update `harness.config.json` so commands match the target project.
5. Run:

   ```bash
   npm run harness
   ```

6. If there is prior history, run:

   ```bash
   npm run harness:compare
   ```

7. Report:
   - which files were added or changed
   - which harness mode ran
   - pass/fail summary
   - status changes versus the previous run, if available
   - any remaining failures

## Expected Target Project Files

After applying the universal harness:

```text
harness.config.json
scripts/harness-runner.js
examples/checks/sample-pass.js
```

After applying the Codex adapter:

```text
AGENTS.md
.agents/skills/codex-verification-loop/SKILL.md
.codex/hooks.json
.codex/hooks/stop_quick_check.js
```

## Notes

- Do not overwrite an existing `AGENTS.md` blindly. Merge the Codex harness
  guidance into it.
- Keep project-specific commands in `harness.config.json`.
- Keep the harness small at first. Add slow checks only to the `full` mode.
