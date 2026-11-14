---
name: copilot-teach
description: Run a Copilot teaching session. Reads the open escalation tickets as a scrubbed audit bundle, audits each case the local agent could not handle (was its decision right, what did it lack), fixes the cause as an artifact (an expert or MCP change, a sphere link, a prompt or skill change, a persona proposal, a map correction), writes a finding for each ticket, and tells the owner what to review and accept. Never accepts anything itself and never commits. Works only against the local Copilot server; with the server down the tickets simply wait. Triggers - /copilot-teach, teach copilot, teaching session, audit copilot tickets, copilot findings.
---

# copilot-teach: turn Copilot's open tickets into fixes the owner can accept

Copilot (docs/copilot/README.md) is a local, owner-only AI training companion. When its local agent cannot handle something (it did not
understand a correction, it was very unsure, the command was unknown, it routed to the wrong sphere) it files an escalation ticket and
carries on asking the owner. Those tickets wait. **This skill is the one place Claude is used**: it reads the tickets, works out what the
local agent lacked, writes the fix, and hands the owner a short list to accept. Full flow and states: `docs/copilot/teacher-loop.md`.

Argument: none, or a ticket id to look at only that one.

## Rules that never bend

- **Never accept.** `accept:ticket` is the owner's act and the only thing that lets a scenario graduate. You never run it and you never
  call `POST /tickets/<id>/accept`, even if the owner says "looks fine" in passing: tell them the command and let them run it.
- **Never commit or push**, in any repository. Artifacts are left in the working tree for the owner to review.
- **No personal data in any committed file.** Bundles use codenames (`Agate-F`) and short excerpts, and they live in the owner's private,
  git-ignored data folder. Do not look for, guess or write a real character name anywhere: not in an artifact, a finding, a commit
  message, a test or a doc. If something reads like a real name, it is `<name>`. `docs/standards/data-classification.md` applies.
- **Do not start, stop or restart any server or container, run a model, use the GPU, or deploy.** If the Copilot server is not up, say
  so and stop; that is the all-local mode and nothing is lost.
- Do not change `Shattered-AI/personas` or any `persona-core` folder (the Shattered Story copy is vendored too). A persona ticket becomes a
  *proposal* only, validated by the Shattered Story script and accepted by the owner (see "Persona tickets" below).
- Never read the raw game logs. What you may use about a character is the bundle and the stored description served by
  `GET /characters/<codename>/description` (names already replaced by codenames).
- A bundle is read-only evidence. Do not edit it, and do not copy its text into a committed file; describe the case in your own words.

## 1. Check the server and the queue

The API is `COPILOT_API` (default `https://copilot.shatteredarchive.dev`; only this machine, a private network or `*.shatteredarchive.dev`
are accepted by the scripts). From `C:/Projects/ShatteredArchive`:

```
curl -s -m 10 https://copilot.shatteredarchive.dev/health
pnpm --filter @shatteredarchive/copilot-server training:metrics
```

`health` unreachable: tell the owner the Copilot server is not running and stop. `training:metrics` prints the totals
(`open`, `resolved`, `findings`, `accepted`, `graduated`, `claudeNeeded`). No open tickets: say so and stop.

## 2. Export the bundle

```
pnpm --filter @shatteredarchive/copilot-server export:bundle                       # every open ticket, oldest first, at most 50
pnpm --filter @shatteredarchive/copilot-server export:bundle -- --ticket t-abc     # chosen tickets (any status), repeatable
```

It prints the bundle id and the summary. The files are `bundles/<id>/bundle.json` and `summary.md` in the data folder
(`C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/copilot-server/`, private). If the summary says "more are open", answer these first
and export again. Each ticket carries: the reason, sphere, kind and situation (together the *scenario*), a short summary, the decision it
came from (the command, the owner's why) when it has one, and the lessons the agent proposed for the situation. A proposed lesson steers
nothing until the owner accepts a finding.

## 3. Audit each ticket

For each one, decide:

1. **Was the local agent right?** Compare what it did or proposed with what the owner wanted. Use the game facts, not a guess:
   `archive_ask` for classes, items, areas, routes; read the relevant expert in `Shattered-AI/tools/archive-mcp/experts/`.
2. **If it was wrong, what did it lack?** One cause, the smallest that explains it.
3. Pick the verdict:

| Verdict | Meaning | Usual artifact |
|---|---|---|
| `local-correct` | the agent was right; the correction or the ticket was a misunderstanding | usually none; a doc or prompt note if the owner's correction exposed a confusing rule |
| `local-wrong` | the agent had what it needed and reasoned badly | a prompt or skill change (`copilot-server/src/suggest/prompt.ts` and its tests) |
| `data-gap` | the archive/expert has no answer, or a wrong one | an expert or MCP change: use the `create-expert` skill; lookups are in `Shattered-AI/tools/archive-mcp` |
| `routing-gap` | the situation went to the wrong sphere, or no sphere | a sphere or neighbour link (`spheres.json` once phase 17 exists), or the router's rules |
| `persona` | the feedback is about a persona's voice or facts (a `persona-feedback` ticket) | a persona proposal in the private DSL folder, never a direct edit: see "Persona tickets" |

Fix the cause where it belongs, in that repository's own conventions (its tests, its `.annotated` index, its docs). Keep each artifact
small and separate so the owner can accept or decline one without the others. A map correction waits for the Shattered-Maps phases:
write the finding with verdict `data-gap` and no artifact, and say what is missing.

### Hint tickets (situation key `hint:<room>`)

A ticket whose situation key starts with `hint:` means no hint tier (what the owner taught, the word list, the local model) knew what to try in that room,
so it is the third, frontier tier: you. Work out what works there from the evidence (the room text and exits in the ticket's situation, the DSL logs through
the archive tools, the room-hints evaluation in `docs/userscripts/room-hints/`), never by playing the game. Then **teach the room**: `POST /hints/rules` on
the Copilot server with `{ "title": "<the room name as the game prints it>", "commands": ["...", "..."], "source": "claude", "note": "<why, one sentence>" }` (1 to 8 commands).
The next hint in that room is answered at once from the learned tier, and the owner can overrule it by teaching the same room (an owner rule wins over a Claude one).
Write the finding with verdict `data-gap` and the artifact kind `doc` pointing at the rule you posted; a room you cannot answer stays unanswered, with the reason
in the finding. Details: `docs/copilot/hints.md`.

### Persona tickets (reason `persona-feedback`)

The owner files one with `pnpm --filter @shatteredarchive/copilot-server persona:feedback -- <codename> <field> <why...>` (for example
`Agate-F voice "She never sounds this polite"`). The bundle shows it as a `persona` entry: the character's codename, the persona field
(`role`, `stance`, `voice`, `expertise`, `blindspots`, `interests`, `pressures`, `sphere`, `concerns`, `redLines`, `concessions`, `secrets`,
`goals` or `unknown`) and the why. The result is a **proposal**, a new version of a Shattered Story narrative persona file, never an edit:

1. **Find the current persona.** For a test character the persona blocks are in the private
   `C:/Projects/DSL/docs/copilot/test-character-personas.md` (find the block by the codename in the roster, never by guessing a real name). If a
   saved `<id>.persona.md` exists for it, that is the current file. A registered real character has **no** current file: the proposal is
   **version 1**, built from the stored description (`GET /characters/<codename>/description`) and the owner's feedback; never from raw logs.
2. **Write the proposal** to `C:/Projects/DSL/docs/copilot/persona-proposals/<codename>/v<n>.persona.md` (`n` = the new version). `id` and
   `name` stay as they are (a new persona: `id` the lower-case codename, `name` the codename). `domain: narrative`. Change only what the
   feedback is about, one or two fields. The persona framework's rules apply (`Shattered-AI/doc/story-program/03-persona-framework.md`): every
   field after `stance` is a **fact about the person**, never a line for them to say; a concrete pressure, not villainy; **show, never tell**: no
   statement may announce a change of mind or name a motive or power aloud. A real character's proposal holds the codename and what the
   character does in play, no real name and nothing about the real person.
3. **Validate it** until it passes (it checks the parse, `id` and `name` unchanged, version + 1, a changed field, and the tells):

   ```
   node C:/Projects/Shattered-Story/scripts/persona-proposal.mjs validate <proposal> --current <current file>   # omit --current for a new persona
   ```

4. **Write the finding** with verdict `persona` and the proposal as an artifact of kind `persona-proposal`
   (`DSL/docs/copilot/persona-proposals/<codename>/v<n>.persona.md`), then import it as in step 4.
5. **Tell the owner the two things they do, and that you do neither:** accept the persona itself
   (`node scripts/persona-proposal.mjs accept <proposal> --to <target.persona.md>` in Shattered-Story, which keeps a timestamped backup and
   refuses a target inside Shattered-AI's personas or any persona-core folder) and accept the ticket (`accept:ticket`). They are separate:
   the first changes the persona file, the second counts the scenario.

## 4. Write one finding per ticket and import it

Write the JSON to a scratch file outside any repository (not under the data folder, not committed):

```json
{
  "id": "f-<short unique>",
  "ticketId": "<the ticket id>",
  "createdAt": 1731000000000,
  "verdict": "data-gap",
  "why": "In your own words, one or two sentences, codenames only: what the agent lacked and what you changed.",
  "artifacts": [{ "path": "Shattered-AI/tools/archive-mcp/experts/rooms.json", "kind": "expert" }],
  "acceptedBy": null
}
```

- `verdict`: `local-correct`, `local-wrong`, `data-gap`, `routing-gap`, `persona`.
- `artifacts`: at most 10; `kind` is one of `expert`, `mcp`, `sphere-link`, `skill`, `prompt`, `persona-proposal`, `map-correction`, `doc`;
  `path` is a plain repository-relative path (no `..`, no URL). Empty is fine for `local-correct`.
- `acceptedBy` must be `null` (a finding cannot arrive accepted). `createdAt` is epoch milliseconds (`Date.now()`).

```
pnpm --filter @shatteredarchive/copilot-server import:finding -- <file>
```

The server replaces any registered name in `why` with its codename, stores the finding, and marks the ticket `resolved`. Answers you may
see: 400 (the file's problems are listed; fix and retry), 404 (unknown ticket), 409 (the ticket is not open, or the finding id belongs to
another ticket). Importing the same file again is harmless.

## 5. Hand over to the owner

Finish with a short list the owner can act on:

- per ticket: id, verdict, one line on what was wrong, and the artifact paths to review (uncommitted, for them to read and commit);
- anything you could not fix and why (a map correction, a persona change, a missing fact);
- the exact acceptance commands, for the owner to run when satisfied:

```
pnpm --filter @shatteredarchive/copilot-server accept:ticket -- <ticket id>
```

Accepting settles the lessons the agent proposed for that situation (accepted when the owner's correction was right, rejected when the
agent was) and starts the clean count: the scenario graduates after 10 later occurrences handled without a ticket, and a new ticket for
the same situation takes the acceptance back. `training:metrics` shows the movement.

## If something goes wrong

- The export says "No open tickets": nothing was written; there is nothing to do.
- A request fails with "cannot be reached": the server went away; tickets wait and nothing is lost. Say so and stop.
- You find a real name in a bundle: that is a scrubber defect. Do not repeat the name anywhere (not in your reply either); tell the owner
  which ticket and field, and stop using that bundle.
