# Stalled Coding Worker Handoff

## When This Applies

Use this pattern when a coding worker was launched correctly but spends several minutes producing planning/governance output, docs, or repeated investigation without implementing the requested code change.

**Most common cause**: project-level `AGENTS.md`/`CLAUDE.md` rules override the execution card. See `references/project-rule-override.md` for diagnosis and fix before retrying the worker.

## Concrete Pattern

1. Poll the worker log for actual code activity.
2. Inspect `git status --short` and targeted `git diff` while the worker runs.
3. If the diff contains only docs or unrelated files and the task requires code, treat the worker as stalled.
4. Kill the background worker to avoid concurrent edits.
5. Review any untracked artifacts it left behind; keep only artifacts that are relevant and verified.
6. Continue manually or relaunch a narrower worker prompt with exact files and expected edit points.

## Verification Pattern From Session

A native Maven command failed before compilation because the local Maven launcher could not find `org.codehaus.plexus.classworlds.launcher.Launcher`. That is an environment setup issue, not code evidence.

A useful fallback was:

1. Build a minimal Windows-compatible classpath from existing `target/classes`, project jars, and only required local Maven dependencies.
2. Compile the changed production files and focused test with `javac`.
3. Execute the focused JUnit test with `org.junit.runner.JUnitCore`.
4. Run `git diff --check`.
5. Put this ad-hoc verification in `C:\Users\<user>\AppData\Local\Temp\hermes-verify-*.sh` and have the script clean itself and generated class directories on exit.

Do not generalize this as "Maven is broken". Prefer the native build whenever it is healthy.

## Hermes-Takeover Boundary (exception, not default)

If the worker has stalled, the default next move is **not** Hermes writing code. The escalation order is:

1. Diagnose the stall (see `references/project-rule-override.md`).
2. Relaunch the worker with a narrower execution card.
3. Try a different worker (Codex → Claude Code → OpenCode).
4. **Only after steps 1–3 fail and the user is waiting**, Hermes may edit the named files itself, and must:
   - State in plain text that this is an exception path, not the default mode.
   - Keep the change minimal and only touch the execution card's named files.
   - Re-run the same focused verification the worker would have run (typically the project's existing JUnit/TestNG/Pytest harness, or the temp ad-hoc javac/JUnit fallback above).
   - Hand the diff back to the worker on the next round so the worker resumes ownership rather than Hermes staying in the seat.

The rule of thumb: **the worker writes the diff, Hermes writes the brief and the acceptance report**. Crossing that line is allowed, but never silent and never more than one turn.