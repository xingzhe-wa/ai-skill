# Java/Spring Scenario-Backed EasyExcel Export Handoff

Use this reference when orchestrating workers for Java/Spring report exports backed by an existing scenario/calculation table.

## Request Contract Gate

For exports selected from an existing scenario, do not let the worker invent or keep frontend replay fields in the request DTO.

Default request shape:

- `allowanceScenarioId` or equivalent scenario id.
- `displayModel` or equivalent output/debug mode, only when the backend actually uses it to choose returned rows.

Avoid request fields that can be read from the scenario/calculation tables:

- `division` when `allowance_scenario.division` already determines the report division.
- fleet/base/date/period/pairing filters when the selected scenario already determines the calculated data set.

The service should read the scenario first, derive division/period/data scope from it, and then query persisted calculation results. This removes duplicate validation between frontend replay state and backend truth.

## Division Handling

If division comes from the scenario table:

1. Query the scenario by id before building list/export rows.
2. Normalize the stored division string, including pipe-delimited variants such as `|C|`, `C|P`, or `|C|P|`.
3. Keep feature-availability checks after scenario loading. For example, if Division P is not implemented yet, throw the existing business exception only after reading the scenario division.
4. Return the derived division in the response for debugging and traceability.

Do not keep `req.getDivision()` calls or URL hardcoding after this contract decision.

## EasyExcel XLS Export Gate

When a downloaded Excel file is 0 bytes or corrupt, compare the implementation against a known working export in the same repository before changing business data logic. In this project class, the stable pattern is:

- Use `.xls` suffix when the requirement asks for legacy Excel format.
- Set `response.setContentType("application/vnd.ms-excel")`.
- Set UTF-8 character encoding.
- URL-encode the full filename and set `Content-disposition`/`Content-Disposition` consistently with nearby working code.
- Pass `ExcelTypeEnum.XLS` explicitly to EasyExcel.
- Finish and flush the writer/output stream in the response path.

For multi-sheet exports, keep the `ExcelWriter` path if needed, but require `EasyExcel.write(response.getOutputStream()).excelType(ExcelTypeEnum.XLS).build()` and a `finally { writer.finish(); }` block. If the repository has a working single-sheet `doWrite` implementation, cite it in the execution card as the formatting/header reference.

## Worker Acceptance Checks

After the worker claims completion, verify the repository state, not the process output:

- `rg "getDivision|private String division"` on the request DTO and service implementation to ensure removed request fields are gone.
- `rg "ExcelTypeEnum|\.xls|application/vnd.ms-excel"` on the export service.
- UTF-8 without BOM and no `U+FFFD`/mojibake patterns for Chinese comments.
- `git -c core.whitespace=cr-at-eol diff --check -- <changed-java-files>`.

If Codex or Claude Code has edited files but the process does not exit, inspect the touched files and targeted invariants. When the diff is complete and verification passes, kill the stuck process and continue acceptance; do not wait indefinitely for final prose.