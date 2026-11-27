# Coding standards

One file per language: `docs/standards/<language>.md` (`typescript.md`, `scss.md`, `csharp.md`, ...). Repo-wide rules that apply to
every language stay in `.github/copilot-instructions.md` ("Coding standards", "Tests and coverage", "Security and privacy"); a
language file adds only what that language needs and never repeats those.

## What a language file holds

Only the categories that decide real review comments for that language, a few lines each. Pick from:

| Category | Typical content |
|---|---|
| Formatting and lint | Which tool is the source of truth (`eslint.config.mjs`, prettier, `dotnet format`); the command; do not restate rules the tool enforces |
| Naming and layout | File, symbol and folder naming; where a new module goes |
| Types and nullability | `any`/`unknown` policy, explicit return types, null handling |
| Errors | Throw vs return, what gets logged, what reaches the user |
| Async and state | Promise handling, cancellation, React state/effect rules |
| Testing | Test file placement, naming, what a test asserts, mocking boundaries |
| Security-sensitive code | Input validation, secrets, data-classification handling (`data-classification.md`) |

A file with three decided categories beats one that tries to answer everything.

## Who creates and checks them

- `/tech-plan` lists the languages of the files a plan will touch. A missing file, or one that does not cover the categories the
  plan needs, stops the plan until the user has decided those categories (it asks; it does not invent standards). The skill then
  writes or extends the file.
- `/pr-review` checks the changed files against these files plus the lint/format tool output.

## Edge-case classifiers

`edge-cases/` is a catalog of edge cases per feature or technology (a dark form whose scrollbar stayed light, for example), applied by
`/tech-plan`, proven by `/implement-plan` and checked by `/pr-review`. Format and index: `edge-cases/README.md`.

## Data classification

`data-classification.md` defines what may appear in work-item documents, PR bodies and screenshots. `/scope-work` applies it.
