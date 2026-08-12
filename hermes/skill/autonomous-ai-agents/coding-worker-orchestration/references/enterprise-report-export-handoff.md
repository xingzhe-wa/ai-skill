# Enterprise Report Export Handoff

Use this reference when a coding task starts from business work items and spreadsheet samples, especially Java/Spring server-side report exports.

## Intake Pattern

1. Pull and read the parent work item plus child work items before coding.
2. Treat parent items as entry/scope and child items as division/report-specific logic.
3. Read every attached spreadsheet sample. If spreadsheet libraries are unavailable, unzip `.xlsx` and inspect `xl/workbook.xml`, `xl/sharedStrings.xml`, worksheet XML, styles, sheet names, headers, dimensions, and formulas with standard library tooling.
4. Convert the confirmed requirements into a repo-local implementation note before launching a worker. Keep it under an existing docs area and make it concise: scope, APIs, grouping keys, field mappings, output sheets, validation constraints, and known follow-ups.
5. Give the coding worker an execution card that references the document and lists exact constraints. Do not ask the worker to rediscover the business requirements.

## Common Pitfalls

- Do not confuse UI compression with business aggregation. For example, a Gantt "compress" mode may pack non-overlapping rows for display, while an export "compress" mode may require a full business grouping key.
- Do not use unordered collections for ordered business keys. For route/fleet/subfleet structures, preserve the natural duty/segment order and preserve duplicates unless the business explicitly says to deduplicate.
- For composition structures, use the confirmed business sort. If the user corrects the sort order, update the grouping key immediately; a stable but wrong order causes false splits or false merges.
- For monetary grouping keys, compare the same persisted/calculated amount the report displays, with the same scale and rounding. Prefer existing calculation detail fields such as two-decimal `subTotal` over recomputing rules.
- If sample spreadsheets contain obvious header typos, record the corrected header explicitly in the implementation note so the worker does not blindly duplicate the wrong template.
- If a repository forbids default builds/tests, do not ask the worker to run them. Require static verification instead: whitespace diff check, encoding/BOM/U+FFFD checks, and import/package consistency.

## Worker Card Checklist

Include:

- Project path and protected files the worker must not touch.
- The repo-local requirements document path.
- Controller/service/API names or naming constraints.
- Required list/debug endpoints and export endpoints.
- Export technology and expected sheet names/column order.
- The exact business grouping key and aggregation semantics.
- What can be left as an explicit unimplemented extension point, and what must not return fake data.
- Verification commands allowed by the repository rules.
- Required summary format: changed files, endpoints, verification output, unresolved items, diff summary.

## CLI Worker Fallback

If an external Codex/Claude CLI worker fails before making code changes because of provider/model policy or local proxy restrictions, kill that process and relaunch through another available worker mechanism with the same execution card. Capture the fallback as orchestration behavior, not as a durable claim that the CLI or provider is broken.
