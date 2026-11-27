# C# standards

Created 2026-11-06 by `/tech-plan` for work item `2026-11-05_copilot-ai-training-sibling-to-autopilot`. Only the categories that plan needed are
decided here (formatting, naming and layout, errors, testing, async in tests, security-sensitive code); types and nullability are undecided and get
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

## Async in tests
Decided 2026-11-18 for `2026-11-18_finish-sitemaps-and-seo-plan` (owner's choice among three options). A test of an `async` method is `public async Task`
and awaits the method. A test that needs a scratch folder or other state creates it in `IAsyncLifetime.InitializeAsync` and removes it in
`DisposeAsync` (no existing test uses `IAsyncLifetime` yet, existing tests with a temp folder use `IDisposable`; `RoomHintsAiTests.cs` and
`LiveSiteRegressionTests.cs` show the `async Task` signature). Fakes are
hand-written classes inside the test file; the test project has no mocking library. Do not block on a task with `.GetAwaiter().GetResult()`.
Enforced by: the xunit runner (a test with an un-awaited task finishes before its assertions run); no analyzer is configured.

## Types and nullability
Decided 2026-11-18 for `2026-11-18_autopilot-live-test-findings` (owner's choice among two options). A value that is unknown for most records
(a duration, a lag) is a nullable `int?` and is left out of the JSON when null: `[JsonProperty("name", NullValueHandling = NullValueHandling.Ignore)]`,
as `AutoPilotTarget.Level` (`Server.Dsl/Models/Autopilot.cs:19-20`) and `IAbility.DurationTicks` (`Server.Dsl/Models/IAbility.cs:14`) do. A reader treats
a missing field as unknown. Never use `0` for "unknown" when `0` is a real value (`DurationTicks` 0 = "under a tick"). Enforced by: the compiler
(`Nullable` enabled); no analyzer is configured.
