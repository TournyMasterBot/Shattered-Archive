# C# standards

Created 2026-11-06 by `/tech-plan` for work item `2026-11-05_copilot-ai-training-sibling-to-autopilot`. Only the categories that plan needed are
decided here (formatting, naming and layout, errors, testing, security-sensitive code); types and nullability and async are undecided and get
asked when a plan needs them. Repo-wide rules stay in `.github/copilot-instructions.md`. Applies to the `DSL` repository
(`C:\Projects\DSL\Server`: `Server.Web.Public`, `Server.Dsl`, `Server.Dsl.Tests`), net8.0, `Nullable` enabled.

## Formatting and lint
No formatter or analyzer config exists in the DSL repo (no `.editorconfig`). Match the surrounding file; do not add a tool or reformat code you
did not change. The gate is `dotnet build -c Release` with no new warnings in the files you touched.

## Naming and layout
- Thin controller in `Server.Web.Public/Controllers/`, logic in a static class under `Server.Dsl/AgentApi/` (`RoomHints.cs`, `AgentAgl.cs`),
  so it can be tested without ASP.NET.
- One feature per file; a file-top comment says what the class pins down, as the existing `*Tests.cs` files do.

## Errors
- A bad request is `BadRequest(new { error = "<what to fix>" })`; list endpoints page with the shared paging helper; a response that must not be
  cached sets `Cache-Control: no-store`; a query-parameter endpoint calls `VaryByQuery()` (the response cache keys on path only).
- An optional integration that is not configured answers 404, and a non-local target answers 403 (`room-hints/ai` is the precedent).

## Testing
- xunit in `Server.Dsl.Tests`, one `<Feature>Tests.cs` per feature, run with `dotnet test Server/Server.Dsl.Tests`.
- Tests assert concrete behaviour and every added branch and error path (`.github/copilot-instructions.md`, "Tests and coverage").

## Security-sensitive code
- **Local-only code never reaches production.** A feature that exists only for the local docker deployment (Copilot and its fixtures) is compiled
  and copied only when the MSBuild property is set (`-p:CopilotLocal=true`, passed by `Server/deploy-local.ps1` and by nothing else): its `.cs`
  files and its `wwwroot` data are removed from the project otherwise. A test inspects the Release output built WITHOUT the property and asserts
  that no local-only type, route or data file is in it. A runtime `if` alone does not satisfy this rule.
- No game text, character names or account data in logs or committed fixtures (`docs/standards/data-classification.md`).
