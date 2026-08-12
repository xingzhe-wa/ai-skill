# Yunxiao Export Requirement Intake

Use this reference when a user gives one or more Yunxiao work item IDs as the source of truth for a coding task, especially when Hermes is expected to understand the requirement before dispatching a coding worker.

## Intake Pattern

1. Load the Yunxiao workflow skill when available, but if multiple externally owned copies make the skill name ambiguous, do not patch or modify those external skills. Use the readable workflow file as operational guidance and keep any reusable orchestration lesson in this skill.
2. Pull `summary` for every work item ID the user names. For parent-child requirement sets, pull the parent entry and every detailed child entry, even if the user says one item is the entry point.
3. Read each generated `context.md`, then inspect `context.json` for these fields before summarizing:
   - `currentWorkitem.attachments`
   - `parentWorkitem.attachments`
   - `currentWorkitemComments`
   - `testcases`
   - `relations`
   - `gitHistory`
4. Visually inspect downloaded image attachments. Requirement screenshots often carry UI button/layout details that are only partially represented in the markdown text.
5. Treat missing referenced sample files as an explicit unverified item. If the work item text says "see Excel attachment" but `currentWorkitem.attachments` is empty, do not infer exact column order, sheet names, cell formats, or file naming from text alone.
6. Produce a worker-ready requirement brief before launching implementation: entry/menu behavior, API surface, branch logic by domain field, shared algorithms, field-level rules, reusable existing services to inspect, verification commands, and residual risks.

## Report Shape

For coding-worker handoff, keep the user-facing intake concise:

- Work items pulled and what each owns.
- Effective requirement boundaries.
- Explicit implementation split between frontend entry and backend export endpoints.
- Attachments/comments/relations/testcases availability.
- Missing sample artifacts and which details remain unverified.
- Concrete next code-inspection targets for the worker.

## Pitfalls

- Do not assume child work item sample attachments were downloaded just because the parent has attachments. Check `currentWorkitem.attachments` on each child.
- Do not let truncated `context.md` hide structure: read `context.json` for attachment and relation evidence.
- Do not dispatch a coding worker with only the Yunxiao IDs. Convert the work items into a concrete execution card first, including missing evidence and acceptance criteria.
