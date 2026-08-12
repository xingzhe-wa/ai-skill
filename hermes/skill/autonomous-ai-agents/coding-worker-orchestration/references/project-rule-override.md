# Project Rule Override: When Workers Stall Because of AGENTS.md / CLAUDE.md

## Root Cause

Codex and Claude Code load project context files at startup:

- Global: `~/.codex/AGENTS.md` (Codex), `~/.claude/` (Claude Code)
- Project root: `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`

These files have **higher effective priority** than the Hermes execution-card prompt sent via `codex exec`. If they mandate governance docs, brainstorming, solution design, or "no compile" rules, the worker follows those rules instead of the execution card — even when the prompt explicitly says "don't write docs."

## Symptoms

- Worker finds the correct code location and reports it, but never produces a code diff.
- Worker log shows `brainstorming`, `process skills first`, governance doc titles.
- Worker creates `docs/requirements/*.md` or `openspec/` artifacts instead of modifying source.
- Multiple relaunches with narrower prompts produce the same stall.
- `git status` shows only new untracked docs, no modified source files.

## Diagnosis Steps

1. Check the worker log for skill/process keywords: `brainstorming`, `governance`, `治理`, `requirements`, `openspec`.
2. Run `git status --short` — if only docs are new and no source is modified, suspect rule override.
3. Read these files for governance mandates:
   - `~/.codex/AGENTS.md`
   - `<repo>/AGENTS.md`
   - `<repo>/CLAUDE.md`
   - `<repo>/.agents/skills/` and `<repo>/.claude/skills/` (openspec, explore, propose flows)
4. Look for keywords: `治理文档`, `先落地`, `闭环更新`, `不需要编译`, `不需要运行`, `brainstorming`.

## Fix: Restructure Rule Layers

Move all cognitive/governance responsibilities to Hermes. Keep only engineering constraints in worker-facing rules.

### What to remove from worker-facing rules

- "Before any change, create governance docs"
- "After solving, update governance doc closure"
- "Process skills first / brainstorming"
- "No compile needed, just syntax-correct"
- Any mandate that makes docs the primary deliverable

### What to keep in worker-facing rules

- Language preference (Chinese)
- Auto-execute without confirmation
- No git commit/push
- Run verification and return real results
- UTF-8 encoding, no BOM
- Module structure, build commands
- A **Worker Mode** section: "When task comes from Hermes execution card, only modify specified files, don't create governance docs, don't output analysis, return diff and verification results."

### Concrete example from session

Three layers were restructured:

| File | Before | After |
|------|--------|-------|
| `~/.codex/AGENTS.md` | Mandated governance docs before any implementation | Generic constraints + Worker Mode definition |
| `<repo>/AGENTS.md` | IC-002 (must read governance before any task), IC-004 (must update governance docs after solving) | Removed IC-002/IC-004; added IC-003 Worker Mode |
| `<repo>/CLAUDE.md` | Mandatory governance doc library and closure hook | Removed governance mandates; added Worker Mode + Independent Mode |

After restructuring, the worker's project context no longer conflicts with execution-card prompts.

## Concrete pattern: `crew-client-3.0` desktop client

Three rule layers were conflicting for `crew-client-3.0/CrewOptimizerGUIGantt`:

- `C:\Users\<user>\.codex\AGENTS.md` (global): mandated "同步本地治理" before any implementation, which alone was enough to push Codex into doc-only output.
- `<repo>/AGENTS.md` (project): IC-001 "自动执行最高优先级", IC-002 "先查阅治理总纲", IC-003 "编码规范", IC-004 "治理文档闭环更新 (强制)". IC-002 and IC-004 forced the worker to read/write governance docs before touching code.
- `<repo>/CLAUDE.md` (project): "处理任何问题前，先查阅治理总纲" + "改造前先在 `docs/requirements/` 落地治理文档" + "治理文档闭环更新 (⚠️ 强制 Hook)" — same governance-first pressure from the Claude Code side.

When Hermes sent an execution card saying "only edit this file, no governance doc", Codex found the correct code (`canShowPBDDDeleteButton`) but never produced a diff; instead it generated `docs/requirements/fix-manual-duty-node-delete-boundary.md` and copied in `CMSCEB-971-flight-composition-validation.md` content. Repeated narrower execution cards produced the same stall — confirming this is rule conflict, not a Codex capability issue.

Fix:

- `~/.codex/AGENTS.md`: drop the governance mandate, add a "Worker Mode (被 Hermes 调度时)" section.
- `<repo>/AGENTS.md`: remove IC-002 and IC-004; rename IC-003 to "Worker Mode" with explicit "只改 execution card 指定文件 / 不创建治理文档 / 不输出长篇分析 / 需求分析与根因定位由 Hermes 负责".
- `<repo>/CLAUDE.md`: same surgery — strip the governance library section and the closure hook, add a Worker Mode paragraph and an "Independent Mode" paragraph for the case where the customer drives Claude Code directly without going through Hermes.

Result: a follow-up execution card produced a real `git diff` and the worker returned the change in the same turn.

## Prevention

When setting up a new project for Hermes-driven coding:

1. Put governance/workflow rules in Hermes docs or skills, not in `AGENTS.md`/`CLAUDE.md`.
2. Keep `AGENTS.md`/`CLAUDE.md` lean: engineering facts, build commands, encoding, Worker Mode.
3. Audit `.agents/skills/` and `.claude/skills/` for OpenSpec/explore/propose flows that reinforce doc-first behavior.
4. Test with a small coding task before relying on the worker for complex changes.
