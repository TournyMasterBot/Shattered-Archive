# Docs lookup and the tool list

Moved out of the root CLAUDE.md on 2026-10-24 to keep that file short; the text below is unchanged except that references to other sections now name the page they live in. CLAUDE.md keeps the rules most tasks need and points here.

## Docs lookup (docs-hub MCP server)

`tools/docs-hub` (Shattered-AI) is one lookup tool for library docs and our own service docs, used by Claude Code and the qwen CLI.
`lookup_docs` answers from, in order: our `docs/agent/` pages and recorded corrections (they win and end the search), the installed
package's own docs (the exact version the lockfile pins), then Context7 pinned to that version's tag. It is a lookup, not an injection:
call it when you need it.

- **When:** BEFORE writing code against a library whose installed MAJOR version is newer than your training (`lib_versions` with
  `risky: true` lists them; today that includes jest 30, vite 8, nodemailer 9, dotenv 17, uuid 13), and when unsure how one of our
  own services behaves. The `docs-nudge` hook reminds you when an edit newly imports such a library with no lookup this session.
- **Report bad docs:** if a result was wrong, stale or about the wrong library, call `report_doc_issue` with the right answer. It is
  not served again for that query, and a supplied correction becomes a `docs/agent/corrections/<library>.md` page that outranks
  Context7 (review and commit it). Do not keep looking up a result you already know is bad.
- **Our docs:** pages live in each repo's `docs/agent/` (standard: `Shattered-AI/doc/docs-standard.md`); a page whose source files changed
  after `verified_date` is returned marked STALE. Re-verify it when you touch what it describes.
- **Setup:** the server is registered in the git-ignored, per-machine `.mcp.json`; Claude Code asks you to approve a new project MCP
  server once. The qwen CLI starts it from `servers.config.json`.

## Every tool in one place

`../Shattered-AI/doc/tooling.md` lists everything an agent can call, generated from the code that defines each tool (read it when you
do not know whether a tool exists): the `archive_*` MCP tools, the `shattered_mcp` container tools, the skills, and the public
`/api/agent` endpoints. For a question about the game itself (classes, races, abilities, items, creatures, areas, routes, prices,
change notes, the AGL league) call `archive_ask` with the player's words instead of reading C# or scraping pages; it answers from
the live server and says how fresh the data is. Someone else's agent gets only the public agent API: the paste-ready text is the last
section of that page (the site publishes the same in `llms.txt` and the agent skill).
