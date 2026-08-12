---
name: coding-worker-orchestration
description: "Use when orchestrating coding workers and handoffs."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [coding-worker, delegation, codex, verification, orchestration]
    related_skills: [codex, claude-code, systematic-debugging]
---

# Coding Worker Orchestration

Use this when Hermes is acting as a dispatch center for coding work: launching Codex/Claude Code/OpenCode workers, monitoring them, taking over if needed, and validating the final artifact.

## The Split (read first)

Hermes and the coding worker occupy non-overlapping roles:

| Hermes (cognitive) | Worker (executive) |
|---|---|
| Clarify goal, reproduce | Read the repo |
| Trace call chain | Edit the named files |
| Hypothesize root cause | Add focused tests |
| Design the fix strategy | Run verification commands |
| Write the execution card | Return diff + command output |
| Maintain governance docs | (never create governance docs) |
| Final acceptance | (never self-accept) |

If a worker asks Hermes to define the problem, locate the bug, or design the fix, the split is being violated. The worker should only ask code-level questions inside its assigned scope. When in doubt: cognitive work belongs in the Hermes-side execution card; the worker prompt carries only the implementation brief.

## Core Contract

Hermes owns:

1. Goal framing and constraints.
2. Requirements analysis, reproduction summary, bug triage, root-cause hypothesis, and repair strategy.
3. Worker selection and prompt quality.
4. Progress monitoring against real repository state.
5. Final diff review and verification.
6. User-facing summary of changes, tests, unverified areas, and risk.

Workers own:

1. Reading the repo to implement the assigned execution card.
2. Editing files.
3. Adding or updating focused tests.
4. Running tests/builds.
5. Returning implementation diff, command output, blockers, and residual risk.

Do not delegate primary requirements analysis, long-form bug diagnosis, or solution-design documentation to Codex/Claude Code. Hermes should do that work first, then hand the worker a concrete coding brief. A worker may report local code discoveries while implementing, but its success requires code artifacts and real verification output, not analysis text.

### Hermes-First Analysis Gate

Before launching a coding worker, Hermes should produce a compact internal execution card containing:

- User-visible behavior and minimal reproduction.
- Confirmed repository evidence: files, symbols, and relevant call chain.
- Root-cause statement, or a clearly ranked hypothesis if evidence is incomplete.
- Exact behavior to change and behavior that must remain unchanged.
- Target files and ownership boundaries.
- Focused regression scenario and verification command.

Do not ask a coding worker to discover the entire problem space when Hermes can inspect it directly. If additional investigation is needed, use a short evidence-gathering task with an explicit output such as `file:line -> observation -> implication`; then Hermes converts that evidence into the implementation card. Keep worker prompts implementation-oriented and prohibit plan or governance-document drift.

## Launch Checklist

1. Confirm the actual project/repository path from the user's request or an explicit workspace setting before inspecting or editing. Do not infer that the shell's current directory or the user's home directory is the project root. On Windows, normalize and verify the exact drive/path (for example, `D:\\WorkFile\\ai\\h5-game`) with a read-only listing before creating files.
2. If the target directory is empty or is not yet a Git repository, report that fact internally and create the project only in the explicitly verified target path. Never initialize a scratch repository in the user's home directory as a substitute.
3. Confirm the actual repository path and git status before launching.
4. Complete Hermes-side analysis first: summarize reproduction, suspected files, root-cause hypothesis, and intended repair strategy.
3. Build an execution card for the worker: project path, target files, behavior to change, constraints, verification command, and required report format.
4. Include explicit constraints in the worker prompt: no commit, no push, no destructive cleanup, preserve unrelated changes.
5. Tell the worker to prioritize code changes and tests. Analysis-only or governance-doc output is not an acceptable deliverable for coding tasks.
6. Use background execution for long worker runs and keep the session id.
7. Track a local todo item for worker monitoring and final validation.

## Monitoring Rules

1. Poll both worker logs and the worktree diff periodically.
2. Treat repeated planning/governance/doc-only output as a stall if the task requires code changes.
3. If a worker creates unrelated half-finished artifacts, inspect them before deciding whether to keep or delete.
4. If the worker stalls, kill it, preserve any useful investigation, and either take over directly or relaunch with a narrower prompt.
5. Do not let a worker's self-report be the final truth. Verify files, diffs, and command output yourself.

## Verification Rules

1. Prefer the repo's native test/build commands.
2. If the native toolchain is blocked by local setup, do not record the failure as a durable tool limitation. Build a narrower verification path with available compilers/runners when possible.
3. For ad-hoc verification scripts, put them under the OS temp directory, name them clearly, and make them clean themselves and generated outputs on exit.
4. State clearly whether verification was full-suite, targeted, or ad-hoc.
5. Keep temporary verification artifacts out of the repo unless they are intended tests or reusable scripts.
6. When a coding worker self-reports incomplete items, treat the result as an implementation checkpoint, not a completed handoff. Read the touched files yourself, fix narrowly scoped gaps when they are clear, then run the allowed verification before reporting completion.
7. For export/report features, add requirement-specific ad-hoc checks when full builds are disallowed: verify endpoint paths, sheet/column constants, grouping-key fields, monetary aggregation direction, encoding, and that debug/list endpoints do not return fabricated placeholder data.

See `references/stalled-codex-handoff.md` for a concrete stalled-worker handoff and temp-script verification pattern. See `references/project-rule-override.md` for the most common stall cause (project `AGENTS.md`/`CLAUDE.md` overriding the execution card) and how to fix it. See `references/codex-cli-environment-fixes.md` for 403/reasoning-effort/proxy/stall diagnostics when `codex exec` fails before reaching the model. See `references/yunxiao-export-requirement-intake.md` for turning parent/child Yunxiao work items, attachments, and missing sample files into a worker-ready export-feature brief. See `references/enterprise-report-export-handoff.md` for converting business work items plus spreadsheet samples into a worker-ready Java/Spring report export implementation card. See `references/java-easyexcel-scenario-export.md` for scenario-derived request contracts and 0-byte/legacy-XLS EasyExcel export acceptance checks. See `references/third-party-model-provider-setup.md` for Claude Code CLI configuration when using non-Anthropic models (glm-5.x, open.bigmodel.cn, model recognition warnings, settings.json tier mapping, dispatch patterns). For scenario-backed export API contract reviews, use the `API Contract Gate For Export Features` and `Post-Worker Acceptance Gate` sections above.

## Chrome Extension MVP Handoff

For a new Google Chrome MV3 extension in an empty repository, include these acceptance gates in the coding-worker execution card:

1. Verify the target directory and initialize Git only when the explicitly confirmed workspace is empty and not already a repository; preserve pre-existing user files.
2. Require a real build that emits `dist/manifest.json`, the MV3 service worker, popup/options HTML, and every script referenced by the manifest.
3. Treat content scripts as classic injected scripts unless the manifest explicitly uses a supported module configuration. After bundling, inspect the emitted content script for unresolved imports or asset references; inline tiny runtime helpers or configure the bundler so the injected file is self-contained.
4. Keep File System Access API directory selection in an extension page (popup/options), pass the selected handle to the service worker, and centralize file reads/writes there. Use a fixed JSON filename, schema validation before writes, and an explicit disconnected-directory state.
5. Test pure data/model/storage code independently, then run `npm test`, `npm run build`, and a strict TypeScript check. Inspect the final manifest and referenced output files separately from the worker's self-report.

The reusable Chrome-specific verification recipe is in `references/chrome-mv3-extension-acceptance.md`. For File System Access permission boundaries, local comment/history file separation, URL exclusion tests, and low-interference content-script UX, see `references/chrome-local-comment-history.md`.

## Chrome File System Access Permission Boundary

For Chrome MV3 extensions using `FileSystemDirectoryHandle`, keep user-mediated permission calls in the extension page that owns the click (`options.html`/popup). In a service worker, do not unconditionally call `requestPermission()` or `queryPermission()` on a handle received through messaging or restored from IndexedDB: the object may not expose those methods in that context. Make permission methods optional in the extension-page helper, request permission only when present, and let the worker validate the handle by actually opening/reading or creating the fixed data file. Use that real file-access result for connected/disconnected state and add a regression test with a directory-like handle that only implements `getFileHandle()`.

When a coding worker asks for confirmation after Hermes has already supplied a concrete execution card, treat that as a stall: send one explicit “implement now” response if the PTY is still usable; otherwise terminate it and apply the narrowly scoped fix directly, then run the worker-specified verification yourself.

## Chrome MV3 Debugging And UX Acceptance

For Chrome extensions that use File System Access API, treat directory selection as a multi-boundary workflow: the popup/options page owns the user gesture and optional permission request; the MV3 service worker owns handle persistence and file I/O; the UI must preserve the exact failure reason. Do not call `requestPermission()` or `queryPermission()` unconditionally in the service worker because a transferred or restored directory-like handle may not expose those methods. Validate a handle by actual access to the fixed data file, and add a regression test with a minimal handle exposing only `getFileHandle()`.

For user-facing extension bugs, acceptance must include the loaded artifact, not only source tests: rebuild, inspect `dist/manifest.json` and every referenced file, then explicitly reload or reinstall the unpacked extension before reporting a fix. State flows must distinguish loading, connected, cancelled, permission denied, file/schema failure, and backend/message failure; do not immediately overwrite a detailed connection error with a generic “not connected” refresh result.

Content-script UI should minimize reading interference: provide a draggable header, a collapse-to-strip control, and a selection-context action near selected text instead of requiring users to find a permanently fixed panel button. For a reading-first extension, make the default collapsed state a small fixed-size floating button at the bottom-right, with strong contrast and a movement threshold so a click expands while a drag only repositions it; never use a wide pill as the minimized state. Keep context fields such as selected text and anchor as one read-only reference summary, hide duplicate editable fields, and verify these strings and event handlers in the emitted content script. When the draggable header uses `setPointerCapture`, guard the `pointerdown` handler with `event.target.closest('button')` so the capture does not swallow clicks on buttons inside the header (e.g. minimize/expand toggle).

### Native-Comment Mechanism Review Gate

When reproducing a mature document annotation feature, review the anchoring mechanism before delegating implementation. Plain selected-text search, paragraph text, child-index DOM paths, or a saved raw Range are not equivalent to native comments: dynamic rendering, inline-node splits, repeated text, and inserted nodes will break them. Require an explicit feasibility review and a layered persisted selector before coding:

1. TextQuote selector: exact text plus normalized prefix/suffix context.
2. TextPosition selector: start/end offsets within a stable content block.
3. Structural metadata: content-container and block fingerprints, block index, and optional legacy DOM path.
4. Fallbacks: current DOM quote match, selected-text search, anchor/block highlighting, and a bounded retry for dynamic rendering.

The worker must add pure tests before declaring success: duplicate exact text disambiguated by prefix/suffix, whitespace/zero-width normalization, DOM structure changes with quote recovery, and legacy comments without the new selector. Verify the new selector is generated on comment creation and is first in production locator order; adding schema fields without wiring the content script is incomplete. Report the hard limit: materially edited or deleted source cannot be perfectly restored by a local-only annotator.

A concise reusable reference for this review and acceptance checklist is in `references/native-comment-anchor-review.md`. **Post-mortem: the layered selector approach can fail entirely on platforms with custom editors (Yuque Lake, Notion, Feishu) where content is nested 20+ levels deep with hashed CSS Module class names and non-standard paragraph tags. In that case, abandon DOM-selector-based search and use `window.find()` as the primary locator — it delegates cross-node/cross-paragraph matching and scrolling to the browser engine with zero structure assumptions. See the "Browser-Native window.find()" section in the reference file.** Before building any text-search pipeline, verify the target platform's actual DOM structure via browser tools; if `querySelectorAll('p,h1,...')` returns zero results on visible content, the selector approach is already dead.

### Chrome Local Directory And Comment Locator Lessons

For File System Access API directory selection in MV3, never rely on passing `FileSystemDirectoryHandle` through `chrome.runtime.sendMessage`: structured message transfer can lose the handle prototype and permission/file methods in the service worker. The extension page that owns the user gesture must request optional permission methods and persist the handle directly to IndexedDB; send only a serializable directory name or connect command. The service worker then restores the handle from IndexedDB, validates the fixed comment/history files by actual file access, and reports a connected state. Keep success, permission, persistence, validation, cancellation, and refresh outcomes visible in the directory section itself; do not let a generic refresh overwrite a detailed error.

For document comment location, plain text search is not equivalent to native document comments. For new comments, persist an optional structured Range anchor: start/end DOM paths and offsets plus short prefix/suffix context. Restore that Range first so repeated text occurrences remain disambiguated; then fall back to normalized selected text in the smallest relevant block-level DOM element, normalized anchor fallback, global text-node scan, block-level fallback highlight, and a short retry loop for dynamically rendered content. Strip zero-width and non-breaking spaces, collapse whitespace, and build a normalized-character-to-original-Text-node offset map before creating a `Range`; never apply offsets from normalized text directly to raw DOM strings. **Critical: when a user selects text across multiple block elements (e.g. spanning two `<p>` tags), `getSelection().toString()` returns `\n` between blocks, which normalizes to a space; but the DOM text nodes have no space between blocks. Without inserting a synthetic space at block boundaries in the normalized map, every text-search layer fails.** Preserve compatibility for old comments without structured anchors. Add tests for whitespace normalization, candidate priority, structured-anchor validation, and fallback behavior; inspect the emitted content script for the locator and retry strings.

## API Contract Gate For Export Features

Before dispatching a worker for a report/export feature, freeze the request boundary in the execution card. Separate frontend display/replay fields from server query inputs. If a selected scenario already determines division, period, and the calculated data set, the request DTO should normally contain only the scenario identifier plus an explicit output mode (for example `displayModel`). Do not pass frontend-only fields such as selected fleet/base/date filters unless the backend contract explicitly requires independent filtering. Use an existing analogous endpoint, such as a cost-table API, as the contract reference before allowing the worker to design new DTO fields.

For multi-sheet EasyExcel exports, require the worker to state the exact URI, request DTO fields, sheet names, column order, and source of each aggregate value. The service should reuse persisted calculation details (for example two-decimal `subTotal`) instead of silently reimplementing business allowance rules.

## Post-Worker Acceptance Gate

A worker summary is not evidence of correctness. Re-read the changed files and inspect the diff after completion. For Compress/report work, explicitly verify:

1. The grouping key contains the complete ordered business structure and does not use a UI-only row key or a display label as a substitute.
2. Ordered sequences such as fleet/subfleet preserve duplicates and order; composition ordering matches the business rule.
3. Per-COP values come from one representative pairing in a validated group; monthly values multiply that per-COP value by group count exactly once.
4. Request/response field names are consistent end to end, and removed request fields no longer appear in service accessors or mapper request assembly.
5. Static checks cover `git diff --check`, UTF-8 without BOM/U+FFFD, and a fresh targeted probe for the corrected invariants. Label this as targeted/ad-hoc verification when Maven or the full suite is intentionally not run.

## Pitfalls

- A worker may spend time producing process docs instead of code.
- Once an execution card contains enough context and explicit implementation authority, the worker must execute without asking for confirmation. If it asks “shall I proceed?” or stops after a design summary, treat it as stalled: answer through process input if possible, otherwise kill/relaunch with a narrower execution card or take over. Do not leave the user waiting on a confirmation loop. Check the diff, not just the transcript.
- Background workers can leave untracked files behind. Review and remove irrelevant half-finished artifacts before finalizing.
- For repository/reference collection, verify the target directory and network path first, then clone one repository at a time when downloads are large or the connection is unstable. Prefer `--depth 1 --filter=blob:none` for large research repositories. After each attempt, inspect whether the directory is a valid Git worktree before retrying; remove only the newly created broken clone directory. If a repository still cannot be fetched after a bounded retry, stop retrying and provide the user with the exact command to run from the verified project root, clearly marking that repository as incomplete. Do not leave the user waiting on repeated network retries.
- **Environment setup failures are not proof the code is invalid.** Separate toolchain health from targeted code verification.
- **Vitest on Windows may hit `EBUSY` on the temp directory** when tests run concurrently. This is a platform temp-dir lock, not a code bug. Rerun with `--pool=forks --poolOptions.forks.singleFork --fileParallelism=false` and a local temp dir (`TMPDIR="$PWD/.tmp-vitest"`). Add `.tmp-vitest/` to `.gitignore`.
- Do not report a full build as green when only a targeted or ad-hoc verification ran.
- **Project rules can override the execution card.** Codex/Claude Code load `AGENTS.md`/`CLAUDE.md` from both `~/.codex/` and the project root. If those files mandate governance docs, brainstorming, or "no compile" rules, the worker follows them *instead of* the Hermes prompt — no matter how explicit the prompt is. This is the #1 cause of repeated doc-only stalls when the worker has clearly found the right code. See `references/project-rule-override.md`.
- **When the worker stalls repeatedly on the same project, audit the rule files, not just the prompt.** Check `~/.codex/AGENTS.md`, `<repo>/AGENTS.md`, and `<repo>/CLAUDE.md` for governance mandates that conflict with worker-mode execution. Restructure them to keep governance with Hermes and pass only engineering constraints to the worker.
- **Never let a worker and the parent edit the same file concurrently.** If a worker reports that a file was modified after the parent's last read, stop patching that file, re-read the full file, inspect the diff, and choose one owner for the next edit. Partial patching during concurrent writes can duplicate declarations, delete methods, or overwrite a working fix.
- **For Windows Java repositories, treat line endings as a verification concern.** Run `git -c core.whitespace=cr-at-eol diff --check` for CRLF files; ordinary `git diff --check` can report every changed CRLF line as trailing whitespace. Separately verify UTF-8 without BOM and absence of `U+FFFD`.
- **When a runtime stack trace still shows an old-looking path after a source fix, compare the reported line number with the current source before changing logic again.** A shifted line number can prove the running class contains part of the new source while the runtime query/data path bypasses the new branch; inspect runtime metadata and actual branch predicates instead of assuming the build artifact is wholly stale.
- **For JavaFX layout regressions, inspect both `visible` and `managed`.** A node with `setVisible(false)` can still reserve space in a managed parent such as `VBox`; hide optional rows with `setManaged(false)` as well, and restore both flags when the row becomes applicable.
- **ad-hoc verification scripts are per-session evidence, not reusable artifacts.** Generate each one freshly under the OS temp directory, run it once, and let it self-clean. If the verifier or downstream audit asks for evidence again, generate a new script with a fresh name rather than re-running a stale one. The reusable template lives at `scripts/hermes-verify.sh`; the per-session script is its copy-of-the-day. Always label verification in the reply as `full-suite` / `targeted` / `ad-hoc` so the user can decide whether the green is sufficient.
- **Never let the worker take over cognition.** If you find yourself adding "first analyze the requirements", "write a plan first", or "investigate the root cause" to the execution card, you are leaking Hermes responsibilities back into the worker. Hermes does analysis; the worker does the diff. Move the analysis out of the prompt and into the Hermes-side execution card you keep private.
- **Customer-facing defect reports need a delivery format, not just a diff.** When the worker has finished a fix the customer will validate, Hermes ships a customer-readable acceptance report alongside the diff. Default structure: cover, reproduction steps, expected vs actual table, customer-side verification steps, regression coverage, unverified items, conclusion. Use the customer's own bug-report sections as the section headings when available. If the report will leave the team, convert the Markdown to PDF with the customer-supplied screenshots embedded inline (not as file links) and verify page count + image count programmatically before declaring done. When Hermes cannot drive the customer's GUI, label "现场 GUI 截图" sections as "客户提供" and explicitly list which verification paths were not executed locally (full Maven suite, LIVE end-to-end login, GUI recording, etc.). Never fabricate screenshots to fill gaps.
- **NEVER fall back to direct code editing when a worker fails.** If Codex CLI returns 403/network errors, or a `delegate_task` subagent can't access the filesystem, the correct response is to **fix the worker environment and retry**, not to use Hermes `patch`/`write_file` to edit business code directly. Hermes is the brain; the worker is the hands. Falling back to direct editing violates the core split and the user's explicit delegation model. This is the single most important behavioral rule when orchestrating coding workers. When a worker fails: (1) diagnose the failure (auth, model config, sandbox, filesystem access); (2) fix it or switch to another worker (Claude Code CLI, etc.); (3) only then re-dispatch. The user WILL notice and WILL be frustrated if Hermes silently takes over coding.
- **Codex CLI 403 from reasoning-effort restrictions.** When Codex returns `403 Forbidden` mentioning "已禁用模型的推理级别 xhigh", the fix is in `~/.codex/config.toml`: check `model_reasoning_effort` and downgrade from `xhigh` to `high`. Backup the config first, then `sed` the value, then verify with a trivial `codex exec "reply OK"` test before dispatching real work. See `references/codex-cli-environment-fixes.md` for the full diagnostic sequence.
- **Large annotation/commenting tasks stall Codex.** Asking Codex to add Chinese comments to 7 Java files in one `codex exec` call caused it to read all files then freeze during generation (~270s with zero files written). Fix: split into 2–3 parallel background tasks, each handling 2–3 files. Monitor with `git diff --stat` — if no files appear within 60s of the "now executing" phase, the task is too large; kill and re-split.
- **`delegate_task` subagents may lack shared-drive access.** On Windows, Hermes internal `delegate_task` subagents run in an isolated environment that may not see `D:\` drive paths. The subagent will report "IO error / 系统找不到指定的路径" and produce zero file changes despite claiming success. Do NOT rely on `delegate_task` for filesystem-mutating tasks on non-home-drive paths — use the Codex/Claude Code CLI which inherits the user's full filesystem access.
- **Always include project comment/annotation rules in the execution card.** When the project's `AGENTS.md`/`CLAUDE.md` requires detailed Chinese comments (or any specific annotation standard), explicitly restate this requirement in the worker prompt. Do not assume the worker will self-enforce annotation rules it read at startup — call them out per-task. Verify comment coverage during diff review, not just logic correctness. **Annotation verification checklist:** (a) every class has a JavaDoc with business module + requirement ID; (b) every public method has a JavaDoc with params/return/steps; (c) complex logic (grouping keys, aggregation, route calculation) has inline step-by-step comments; (d) reused methods note their source and reason for reuse. If any are missing, re-dispatch a focused annotation task (see the "Large annotation tasks" pitfall for task-size guidance) — do NOT patch comments yourself.
- **GBK encoding corruption on Windows Java repos.** When editing UTF-8 files containing Chinese text on Windows, the worker must read and write in UTF-8. If a script or tool reads a UTF-8 file as GBK (the Windows default codepage), every Chinese character becomes mojibake (`鐢`/`鍗`/`銆`). After worker edits, always verify: check for `U+FFFD` replacement characters and GBK-mojibake patterns (`grep -lq '鐢\|鍗\|銆\|锛\|鏉' <file>`). Include this encoding-safe-edit requirement explicitly in the execution card prompt.
- **Installing a skill for both Codex and Claude Code is a two-target operation.** For a repository skill such as `skills/<name>`, install/copy the same directory into both `~/.codex/skills/<name>` and `~/.claude/skills/<name>` when the user says both workers need it. Verify with file lists and byte/hash comparison against the source. On Windows Git Bash, Windows Node may misresolve `/c/...` script paths as `D:\c\...`; run Node scripts through a native path from `cygpath -w "$HOME/.../script.mjs"`. If `git clone` or `curl -o` has local path/write quirks, prefer fetching trusted raw file contents and writing via Hermes `write_file`, then validate the installed script with a real resolver/help command.