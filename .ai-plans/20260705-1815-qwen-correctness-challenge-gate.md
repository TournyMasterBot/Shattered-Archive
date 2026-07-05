# Plan: qwen correctness challenge gate (self-review before write)

Created: 2026-07-05T18:15:00 · Workspace: /workspace/shattered-ai · Status: COMPLETE
Task: Add a second-instance "soft challenge" correctness gate that reviews qwen's proposed code writes before they hit disk, blocking hard errors while letting justified/forward-ref code pass.

## Goal
Give the local qwen agent a correctness quality gate: when the implementer (instance A) writes code via the MCP mutation tools, a fresh small-context reviewer (instance B) checks ONLY the changed file for correctness — never style/design. Hard stops (syntax errors, unbalanced/truncated code, missing imports of existing symbols) block the write and are returned for correction; calls to not-yet-defined methods are ALLOWED but reported as missing items; anything the implementer can justify passes. Done when: writing a syntactically broken/truncated code file via edit_file/write_file is rejected with the specific error (not written); a write that only references a not-yet-implemented local method succeeds and lists it as a missing item; and re-submitting a reviewer-flagged (non-deterministic) concern with `justification` passes.

## Constraints
- Reviewer inference is the local model via `withOllamaSlot` (free, GPU-serialized) — NEVER the Anthropic API. Runs with a SMALL per-request `num_ctx` (one file of context) so it stays focused and cheap; does not touch the global `OLLAMA_CONTEXT_LENGTH=32768` (16 GB RTX 4060 Ti is already near ceiling for the 30B model — do not enlarge).
- CORRECTNESS ONLY. The reviewer must not raise style, naming, design, or nit findings; when in doubt it prefers ALLOW.
- Deterministic hard stops (parse/syntax, bracket-balance, unterminated string/comment) are NON-overridable. LLM-identified concerns ARE overridable via a `justification` arg on the write, so the implementer can pass by justifying — no infinite loops.
- Gate only qwen's MCP writes (write_file / edit_file / multi_edit) for supported code extensions (.ts .tsx .js .jsx .mjs .cjs .cs .kt .kts .swift). Non-code files and Claude's host-side edits are untouched.
- Opt-in: a persisted settings flag (default OFF) toggled by a control tool + Continue prompt, mirroring passive_annotate.
- Reuse existing infra: the annotation engine's `tokenizeCodeLines` (string/comment-aware) for balance checks, `withOllamaSlot`/`ollamaJson`, `commentStyleFor`, `readMcpSettings`/`writeMcpSettings`, the mutation tools' existing `confirmed`/preview flow and `snapshotForUndo`.

## Context
- Server (single file): /workspace/shattered-ai/mcp-ollama/src/index.ts
  - Mutation tools to gate: `write_file` ~line 2698 (writes after validation), `edit_file` ~2975 (computes `updated`, writes at ~3049 after snapshotForUndo+markDirty), `multi_edit` ~3059 (all-or-nothing batch). Each has a `confirmed` preview path — inject the gate on the real-write branch only.
  - Reuse: `tokenizeCodeLines`/`METHOD_ANNOTATE_EXTS` (annotation engine, added earlier this session, near the annotate_block section), `commentStyleFor` ~4360, `ollamaJson`/`withOllamaSlot`, `annotationField`, settings helpers `readMcpSettings`/`writeMcpSettings`/`MCP_SETTINGS_PATH` ~1551, `passive_annotate` control tool ~1714 (mirror for the toggle), `zBool` ~21.
  - `typescript` package is present in the container (runtime image runs full `pnpm install`); import it lazily (`await import("typescript")`) for real TS/JS syntax diagnostics, falling back to balance-check only if unavailable.
- Continue prompts (ONE tool call each, `/no_think`): /workspace/shattered-ai/.continue/prompts/passive-annotate.prompt — mirror for the toggle prompt.
- Build/deploy: rebuild image + recreate container `shattered_mcp` via `docker compose -f docker-compose.cuda.yml build mcp && ... up -d mcp`; verify `docker logs shattered_mcp`. Ollama at `ollama-code:11434`, model `qwen3-coder:30b`.

## Steps
### [x] 1. (CLAUDE) Challenge-gate core: deterministic checks + reviewer + decision
- Do: In index.ts add `runChallengeGate(resolved, newContent, { hunk?, justification? })` returning `{ decision:"allow"|"block", report, missing:string[] }`. (a) Deterministic BLOCKERS (non-overridable): bracket/paren/brace balance and unterminated string/template/block-comment using `tokenizeCodeLines` end-state; for .ts/.tsx/.js/.jsx/.mjs/.cjs, lazily `import("typescript")` and collect `createSourceFile(...true).parseDiagnostics` (syntax only, no typecheck). (b) LLM reviewer: one `withOllamaSlot`/`ollamaJson` `/api/generate` call with a SMALL `num_ctx`, strict rubric, returning JSON `{blockers:[],missing:[],notes:[]}` — blockers = definite correctness breakage (missing import of an existing/std symbol, undefined var, wrong arity to a defined local), missing = forward refs to not-yet-defined methods (ALLOW+report), notes ignored; instruct: no style/design/nits, prefer allow when unsure; parse JSON defensively (extract first `{...}`, tolerate junk, treat parse failure as allow). (c) Decision: deterministic blockers → block; else LLM blockers AND no justification → block; else allow (log justification if given). Add a `CHALLENGE_*` reviewer prompt + a helper to build the small num_ctx.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts
- Verify: `cd /workspace/shattered-ai/mcp-ollama && pnpm build` clean; a scratch harness driving the DETERMINISTIC path (no GPU) shows a truncated/unbalanced TS snippet → block with a balance/parse message, a well-formed snippet → no deterministic blocker, and JSON-parse helper tolerates `"prose {\"blockers\":[]} more"`.
### [x] 2. (CLAUDE) Wire gate into write_file/edit_file/multi_edit + toggle tool
- Do: Add optional `justification: z.string().optional()` to the three mutation tools. On the real-write branch (flag `readMcpSettings().challengeGate === true`, supported ext), call `runChallengeGate` on the final content BEFORE `fs.writeFileSync`; on `block`, return the report (no write, no snapshot) with guidance ("fix and resend, or re-call with justification=… to justify"); on `allow`, proceed and append any `missing` items to the success text. For multi_edit, gate each file's final combined content; any block rejects the whole batch (all-or-nothing). Register `challenge_gate` control tool ({enabled?}) mirroring `passive_annotate`, persisting `challengeGate` via `writeMcpSettings`.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts
- Verify: `pnpm build` clean; grep confirms the gate call guarded by the flag on all three write paths and the deterministic branch cannot be bypassed by `justification`.
### [x] 3. (qwen) Continue prompt for the toggle
- Do: Add /workspace/shattered-ai/.continue/prompts/challenge-gate.prompt (map on/off/status → `{enabled}`/`{}`, ONE `shattered_archive_challenge_gate` call, print reply — mirror passive-annotate.prompt). Refresh /workspace/shattered-ai/.continue/prompts/.annotated.
- Files: /workspace/shattered-ai/.continue/prompts/challenge-gate.prompt, /workspace/shattered-ai/.continue/prompts/.annotated
- Verify: frontmatter valid, references exact tool name `shattered_archive_challenge_gate`; `.annotated` lists it.
### [x] 4. (CLAUDE) Build, deploy, verify end-to-end, document
- Do: rebuild+recreate `shattered_mcp`; confirm startup + `challenge_gate`/`runChallengeGate` present in deployed build/index.js. Document the gate + the context-window finding (keep 32k; reviewer uses small num_ctx) in doc/ai-context-conventions.md (or a short doc) and update memory. Leave live qwen-review quality for the user (per "no silent GPU verification"); verify mechanics deterministically.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts, /workspace/shattered-ai/doc/ai-context-conventions.md, /workspace/shattered-ai/mcp-ollama/src/.annotated
- Verify: `docker logs shattered_mcp` clean; deployed build contains the new symbols; container Up.

## Progress log

- 2026-07-05T18:15:00 plan created
- 2026-07-05T18:35:00 step 1 done: gate core in index.ts (deterministicStructuralBlockers, lazy typeScriptSyntaxBlockers via `import("typescript")`, extractFirstJsonObject, challengeReview with small num_ctx + JSON format, runChallengeGate decision logic). Verified GPU-free: truncated/unbalanced/unterminated snippets each blocked, well-formed clean, string-content ignored, TS parser catches balanced-but-invalid syntax, JSON extractor tolerates prose/fences/garbage/brace-in-string.
- 2026-07-05T18:45:00 step 2 done: `justification` param + gate wired into write_file/edit_file/multi_edit (multi_edit gates every changed file before any write, all-or-nothing) + `challenge_gate` control tool (flag `challengeGate`, default OFF). Verified: all 3 paths flag-guarded; deterministic tier returns before the justification check (hard errors non-overridable). `pnpm build` clean.
- 2026-07-05T18:50:00 step 3 done: `challenge-gate.prompt` added, `.continue/prompts/.annotated` refreshed.
- 2026-07-05T19:05:00 step 4 done: rebuilt image + recreated shattered_mcp (cuda compose), server up on :3100 no errors, deployed build/index.js contains all gate symbols. LIVE end-to-end via an MCP SSE client (GPU-free deterministic path): enabling the gate then writing a truncated .ts returned a 4-error block (3 structural + TS parser) and the file was NOT created; a non-code .md with unbalanced brackets wrote fine; cleanup restored gate OFF. Docs: doc/challenge-gate.md + doc/.annotated + src/.annotated; memory updated (gate + 16GB context ceiling). LLM-reviewer quality left to the user (per no-silent-GPU).
- 2026-07-05T19:06:00 plan COMPLETE — all 4 steps verified.
