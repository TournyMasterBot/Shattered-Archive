# Plan: passive mermaid flow documenter (.flows)

Created: 2026-07-05T19:30:00 · Workspace: /workspace/shattered-ai · Status: COMPLETE
Task: Add an opt-in passive loop that writes human-oriented Mermaid interaction diagrams (.flows) for files complex enough to warrant one, keyed off the stale-refresh staleness logic.

## Goal
For files that interact with several components / storage providers / external systems, auto-document a human-readable Mermaid flow of the meaningful runtime interactions into a per-folder `.flows` file (sibling to `.annotated`/`.ai-context`). A deterministic complexity heuristic decides which files qualify (leaf utilities are skipped). Generation is a passive background loop gated by the same "indexed folder + staleness" logic as the stale refresh, GPU-serialized, opt-in (default OFF). Done when: enabling the toggle and running the one-shot tool on a component-wiring file writes a `## <file>` section with a ```mermaid``` block + caption + `@flow-hash` into that folder's `.flows`; running it on a trivial file skips it (reported, no GPU); and a re-run on unchanged content is a no-op while a content change regenerates only that file's section.

## Constraints
- Diagrams are FOR HUMANS: prompt the local model for a `sequenceDiagram`/`flowchart` of what the file does across components and storage/external systems — not a class diagram, not every function. One-sentence caption. Local model only (`withOllamaSlot`, free); never the Anthropic API.
- Complexity decision is DETERMINISTIC (keyword/import heuristic over tokenized code, no GPU) so the model is only spent on files that clearly warrant it.
- Staleness is per-file via an `@flow-hash` (sha256/8 of the file with AI-ANNOTATION/AI-METHOD lines stripped, so annotation churn doesn't retrigger flows). Only re-generate on real change. Reuse the indexed-folder (has `.annotated`) + staleness gating the refresh loop already uses.
- Opt-in `passiveFlows` flag in `.mcp-settings.json` (default OFF), control tool + Continue prompt, mirroring `passive_annotate`. Slow cadence (heavier per item). Scope: brace-delimited code exts (`.ts .tsx .js .jsx .mjs .cjs .cs .kt .kts .swift`).
- Non-destructive `.flows` upsert: replace only the target file's `## <file>` section; never disturb other sections or hand-written notes outside sections.
- Reuse existing infra: `tokenizeCodeLines`/`METHOD_ANNOTATE_EXTS`, `hashBody`, `withOllamaSlot`/`ollamaJson`, settings helpers, `ANNOTATE_TREE_SKIP_DIRS`/`annotateDirIgnored`/`loadAnnotateIgnoreChain`, `WORKSPACE_DIRS`, the passive-tick pattern.

## Context
- Server (single file): /workspace/shattered-ai/mcp-ollama/src/index.ts
  - Reuse: `tokenizeCodeLines` + `METHOD_ANNOTATE_EXTS` + `hashBody` (annotation engine, near annotate_block), challenge-gate core just above annotate_block, `commentStyleFor`, `ollamaJson`/`withOllamaSlot`, `readMcpSettings`/`writeMcpSettings`/`MCP_SETTINGS_PATH`.
  - Passive-loop pattern to mirror: `passiveAnnotateMethodsTick` + `findMethodTarget` + `fileNeedsMethodWork` (~1751-1895) and the `passive_annotate_methods` / `challenge_gate` control tools (~1900-1965). Folder-walk gating helpers: `ANNOTATE_TREE_SKIP_DIRS`, `annotateDirIgnored`, `loadAnnotateIgnoreChain`, `annotateIsSkippable`.
  - `.flows` format (per folder): `# Flows — <folder>` header + a `<!-- generated … -->` note, then one section per complex file:
    ```
    ## <filename>
    @flow-hash: <8hex>

    ```mermaid
    <sequenceDiagram/flowchart body>
    ```

    Caption: <one sentence>.
    ```
    A section runs from its `## <filename>` heading to the next `## ` or EOF; upsert replaces exactly that range.
- Continue prompts (ONE tool call each): /workspace/shattered-ai/.continue/prompts/passive-annotate.prompt (mirror the toggle), annotate-block.prompt (mirror the one-shot).
- Build/deploy: rebuild+recreate `shattered_mcp` via `docker compose -f docker-compose.cuda.yml build mcp && … up -d mcp`; verify `docker logs shattered_mcp`.
- Docs to true up after: doc/optional-toggles.md (add the toggle + diagram), doc/ai-context-conventions.md (add `.flows` to the file family), doc/README.md, doc/.annotated.

## Steps
### [x] 1. (CLAUDE) Flow engine + one-shot `document_flows` tool
- Do: Add `flowComplexity(filePath, content)` → `{score, categories:string[], internalModules:number, complex:boolean}` using regexes over `tokenizeCodeLines` output for categories {storage, network, process, messaging} + distinct relative/workspace import count; `complex` when categories≥3, or categories≥2 & internalModules≥2, or internalModules≥6 (thresholds via env). Add `flowContentHash(content)` (strip AI-ANNOTATION/AI-METHOD lines, hash), `readFlowSectionHash(dir, file)`, `upsertFlowSection(dir, file, mermaid, caption, hash)` (idempotent section replace/append in `.flows`), `generateFlow(filePath, content, model)` → `{mermaid, caption}` via one `withOllamaSlot` call (human-flow prompt; extract ```mermaid``` fence, require a diagram keyword else return null), and `documentFileFlow(resolved, {force?})` that ties them together (skip when not complex unless force; skip when hash fresh). Register `document_flows {file_path, force?}` one-shot tool.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts
- Verify: `pnpm build` clean; a GPU-free scratch harness shows a multi-component fixture classified complex and a leaf-util fixture classified simple, `upsertFlowSection` replaces a section in place (idempotent) and appends a new one without disturbing others, and the mermaid-fence extractor pulls the body from a fenced reply and rejects a keyword-less reply.
### [x] 2. (CLAUDE) Passive loop + toggle, keyed off staleness
- Do: Add `passiveFlows` flag (default OFF). Add `findFlowTarget(visitBudget)` (bounded walk of folders that HAVE `.annotated`, same skip/ignore gating as `findMethodTarget`, returning the first complex file whose `.flows` section is missing or hash-stale) and `passiveFlowsTick` (gated by flag, one file per tick, slow interval ~30 min, startup delay ~7 min). Register `passive_flows {enabled?}` control tool mirroring `passive_annotate` (status reports flag, cadence, `.flows` count/last file). No new queue — the hash-staleness walk IS the stale-refresh signal at flow granularity.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts
- Verify: `pnpm build` clean; grep confirms the tick is flag-gated and only descends indexed folders; `passive_flows` with no args reports status.
### [x] 3. (qwen) Continue prompts
- Do: Add /workspace/shattered-ai/.continue/prompts/passive-flows.prompt (toggle: on/off/status → `{enabled}`/`{}`, ONE `shattered_archive_passive_flows` call) and document-flows.prompt (one-shot: resolve path → ONE `shattered_archive_document_flows` call, print reply). Refresh /workspace/shattered-ai/.continue/prompts/.annotated.
- Files: /workspace/shattered-ai/.continue/prompts/passive-flows.prompt, /workspace/shattered-ai/.continue/prompts/document-flows.prompt, /workspace/shattered-ai/.continue/prompts/.annotated
- Verify: valid frontmatter; exact tool names `shattered_archive_passive_flows` / `shattered_archive_document_flows`; `.annotated` lists both.
### [x] 4. (CLAUDE) Deploy, verify, document
- Do: rebuild+recreate `shattered_mcp`; confirm startup + new symbols in deployed build. Live GPU-free proof via MCP client: `document_flows` on a TRIVIAL file → skipped with a complexity-score reason (no write); on a complex file confirm the tool is reachable (leave actual diagram generation — a GPU call — to the user, per no-silent-GPU). True up doc/optional-toggles.md (toggle #5 + diagram), doc/ai-context-conventions.md (`.flows` in the family), doc/README.md, doc/.annotated; update memory.
- Files: /workspace/shattered-ai/mcp-ollama/src/index.ts, /workspace/shattered-ai/doc/optional-toggles.md, /workspace/shattered-ai/doc/ai-context-conventions.md, /workspace/shattered-ai/doc/README.md
- Verify: deployed build contains `document_flows`/`passive_flows`/`flowComplexity`; container Up, logs clean; docs updated.

## Progress log

- 2026-07-05T19:30:00 plan created
- 2026-07-05T19:50:00 step 1 done: flow engine (stripCommentsKeepStrings + flowComplexity heuristic, flowContentHash, readFlowSectionHash, upsertFlowSection, generateFlow, documentFileFlow) + `document_flows` tool. Fixed a heuristic bug found in verify — detection ran over tokenized code, which blanked import paths/URLs and broke `fetch(`-style tokens; switched to comment-stripped-but-string-kept code and boundary-free call-tokens. GPU-free scratch: multi-component file → complex, leaf util → simple, comment-only mentions → simple, upsert idempotent + section-isolated, mermaid fence extraction + keyword-guard correct.
- 2026-07-05T20:00:00 step 2 done: `passiveFlows` flag + `findFlowTarget`/`fileNeedsFlow` (indexed-folder walk, hash-staleness) + `passiveFlowsTick` (30 min, off by default) + `passive_flows` control tool. Build clean.
- 2026-07-05T20:05:00 step 3 done: `passive-flows.prompt` + `document-flows.prompt`; prompts `.annotated` refreshed.
- 2026-07-05T20:20:00 step 4 done: rebuilt + recreated shattered_mcp (cuda compose), up on :3100 no errors, deployed build has document_flows/passive_flows/flowComplexity/stripCommentsKeepStrings/upsertFlowSection. LIVE MCP SSE proof (GPU-free): both tools registered; document_flows on a trivial file → "skipped — not complex enough (categories: none)", no `.flows` written; passive_flows status OFF/cadence/scope. Actual diagram generation on a complex file (GPU) left to the user (no-silent-GPU). Docs trued up: optional-toggles.md (§4 + overview diagram + table), ai-context-conventions.md (.flows family), mcp-tooling.md (2 tools), ai-assistant-architecture.md (worker node); memory updated.
- 2026-07-05T20:21:00 plan COMPLETE — all 4 steps verified.
