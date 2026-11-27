---
name: scope-work
description: Scope a captured work item (bug, proposal or tech debt) at stakeholder level. Researches the codebase to identify the affected areas, data touched, stakeholders, dependencies, unknowns and open questions, and writes scope.md with the facts a human needs to size the work. Never estimates or sizes. Leaves the item in proposed, follows the data-classification rules, and ends by offering /tech-plan. Triggers - /scope-work, scope this, scope the work, what would this touch, who is affected.
---

# scope-work — what the work touches, for a human to size

Shared conventions (folders, front matter, data classification, finding the item): `docs/claude/work-item-workflow.md`. Read it if you have
not this session. Output: `scope.md` in the item folder. This is **not a tech plan**: no file-by-file edit lists, no phases, no code.
It identifies areas, stakeholders and unknowns at a high level so a person can judge size and decide whether to proceed.

Argument: an item slug (or fragment). With none, list `.ai-plans/proposed/*/item.md` titles and ask which. The item stays in
`proposed/` for the whole skill: only `/implement-plan` moves work to `active/`.

## Rules that never bend

- **No sizing.** Never write hours, days, points, T-shirt sizes, "small/medium/large", "trivial", "quick win", "low/high complexity" or
  "effort" ratings, anywhere, including in chat. Give countable facts and unknowns and leave the judgment to the human.
- **Read-only research.** No code or config edits. Output goes only in the item folder.
- **Data classification.** `docs/standards/data-classification.md` applies to the whole document (step 4).
- Every claim about the code has a `path` (and `:line` or an anchor) you looked at this session. A guess is listed under Unknowns.

## 1. Load

1. Find the item, read `item.md` fully. Read `docs/standards/data-classification.md` (if it still says DRAFT, say so in `scope.md`).
2. Do not move the folder and do not change `state:`. If `scope.md` already exists, ask: update it or start over.
3. Record the commit you are scoping against: `git -C C:/Projects/ShatteredArchive rev-parse --short HEAD` (and the branch).

## 2. Research (breadth first, bounded)

Find what the work reaches. Use `Grep`/`Glob` and ranged `Read`; for read-only orientation across 3+ files or a wide search, use an
Explore agent. Game-rule questions go through `archive_ask`, library behaviour through `lookup_docs`, per `CLAUDE.md`. Cover:

- **Areas:** packages/apps under `apps/`, `services/`, `sdks/`, `utils/`, `types/`, plus sibling repos (`Shattered-AI`, `DSL`,
  `shatteredarchive-mobile`, ...) when the item crosses them. For each: what role it plays in this work.
- **Entry points and consumers:** routes, events, exported APIs, storage keys, schemas, config keys, plugins, CLI commands that the
  work changes or that depend on what changes. Callers you did not look at are Unknowns, not silence.
- **Data:** what data is read, written, stored, sent or logged (step 4).
- **Existing tests and docs** in the area (names and counts only), and where there are none. Include, per feature touched, whether a
  developer doc (`docs/{service}/`) and end-user documentation exist, and the end-user audience (players, site users, admins), so the
  documentation stakeholders are visible.
- **Deploy surface:** Dockerfiles, compose, nginx, ports, migrations, secrets or env the work would touch.
- **Related items:** other `.ai-plans/**` items and `.ai-plans-completed/**` plans that touched the same area.

## 3. Write `scope.md`

```
# Scope: <title>

Item: item.md · Type: <type> · Scoped against: <branch> @ <sha> · Date: <yyyy-mm-dd>
Data classification of this work: <class> (rules: docs/standards/data-classification.md[, DRAFT])

## What the work is        (2-4 sentences, from item.md, no new requirements)
## Affected areas          table: Area | Role in the work | Kind (new / change / remove / config) | Evidence (path:line)
## Stakeholders            who is affected or must be involved, and why: players, owner, consuming services, ops/deploy, docs, other repos
## Data touched            table: Data | Class | Read/Write/Store/Send/Log | Change in handling
## Inputs for sizing       countable facts only; "Not sized: that is for a human"
## Dependencies and order  what must exist or happen first; blockers outside this repo
## Risks and unknowns      what could not be determined and why; what a wrong assumption would break
## Out of scope            what the item does not ask for, so nobody assumes it
## Decisions for the human questions that change the scope itself, each with the options and the consequence of each
```

*Inputs for sizing* examples: number of packages and repos touched; files found that reference the symbol/route/key being changed
(count and the command used); new or changed endpoints, screens, storage keys, schemas; whether a migration or data backfill is implied;
existing test files in the area vs none; deploy artifacts affected; cross-repo coordination; count of Unknowns. These are facts you
counted, with the search that produced them.

## 4. Data-classification check (before finishing)

1. Classify each row of *Data touched*. Flag in *Risks and unknowns* any change that moves data to a higher class, stores Personal data
   where it was not stored, widens who can read it, logs it, or involves Restricted data (secrets, keys, credentials, tokens).
2. Re-read what you wrote for values that must not be there (emails, IPs, tokens, cookie values, account/character names, log lines
   with names). Replace them with categories or placeholders. `Grep` `scope.md` for `@`, IPv4 patterns and `token|secret|key=` once as a
   backstop.
3. Set `data-classification:` in `item.md` to the class of the work's data (the highest class touched).

## 5. Hand over

- Summarise in chat: the affected areas, the stakeholders, the biggest unknowns, and any *Decisions for the human*. No size language.
- Decisions that change scope and have <= 4 clear options: ask them (AskUserQuestion) and record the answers in `scope.md`.
- Then ask (AskUserQuestion): "Create the technical plan with /tech-plan?" Options: "Yes, plan it now (Recommended)", "Not yet, I want to
  size it first". On yes, invoke the `tech-plan` skill with the slug. If not yet, say the item stays in `.ai-plans/proposed/<slug>/` with its `scope.md`.
