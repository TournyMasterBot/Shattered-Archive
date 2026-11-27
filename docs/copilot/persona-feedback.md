# Copilot persona feedback (Developer Notes)

When the owner says "this character does not act or sound like this person", the feedback becomes a **proposal**: a new, validated,
versioned Shattered Story persona file that the owner reviews and accepts. Nothing edits a persona in place, and Shattered-AI's debate
personas and the `persona-core` package are never touched. The proposal and the commands live in Shattered-Story
(`scripts/persona-proposal.mjs`); the ticket and the teaching session are Copilot's ([teacher-loop.md](teacher-loop.md)).

## The flow (diagram D8)

```mermaid
sequenceDiagram
  actor Owner
  participant Srv as copilot-server
  participant Skill as copilot-teach
  participant Priv as Private DSL docs folder
  participant Scr as persona-proposal script
  Owner->>Srv: persona:feedback (codename, field, why) files a ticket
  Skill->>Srv: export bundle (the ticket shows as a persona entry)
  Skill->>Priv: write persona-proposals/codename/vN.persona.md
  Skill->>Scr: validate against the current file
  Scr->>Scr: parse with persona-core, id and name unchanged, version plus 1, a field changed, no tells
  alt invalid
    Scr-->>Skill: the problems, one per line; the skill fixes the proposal
  else valid
    Scr-->>Skill: the changed fields
    Skill->>Srv: import a finding (verdict persona, artifact persona-proposal)
    Skill-->>Owner: the proposal path and the two commands
    Owner->>Scr: accept (timestamped backup, then the new version)
    Owner->>Srv: accept:ticket
  end
```

## The ticket

`pnpm --filter @shatteredarchive/copilot-server persona:feedback -- <codename> <field> <why...>` files a ticket with
`reason: persona-feedback`. Its **summary is the payload**, in one fixed form that `validateTicket` enforces:

```
Persona feedback for Agate-F; field: voice; why: She never sounds this polite.
```

- the codename is a reference (`Base-M|F|U`) and must be the ticket's own `character`;
- `field` is one of the persona file's keys (`role`, `stance`, `voice`, `expertise`, `blindspots`, `interests`, `pressures`, `sphere`,
  `concerns`, `redLines`, `concessions`, `secrets`, `goals`) or `unknown` when the owner cannot say;
- `why` is 1 to 400 characters, white space collapsed;
- the build and parse functions are `buildPersonaFeedbackSummary` and `parsePersonaFeedbackSummary` in `copilot-core/src/ledger/records.ts`.

A bundle shows such a ticket with a structured `persona` entry (`codename`, `field`, `why` with names replaced and cut like every text).
The `why` is typed by the owner and may hold a name. The bundle's replacement turns every **registered** name into its codename, but an
unregistered name in the middle of free text is left alone (the scrubber rewrites those only where the game prints a player name, such as
`<Name> tells you`), so say "the other player" rather than naming someone. The ticket store keeps what was typed (it is the private data
folder); the teaching session is told never to repeat a name it finds.

## The proposal and what makes it valid

The file is a Shattered Story persona (`packages/persona-core`: frontmatter with `id`, `name`, `version`, `domain`, `role`, `stance`, `voice`,
the lists, and for a narrative persona `secrets` and `goals`). `scripts/lib/persona-proposal.mjs` checks, with the vendored persona-core's
own parser, field rules and tell detector (so there is one definition of a valid persona):

| Rule | Why |
|---|---|
| it parses (every problem is reported with its line) | a persona file is hand-parsed and strict |
| `domain: narrative` | a research persona is a Shattered-AI debate persona, never Copilot's |
| with a current file: `id` and `name` unchanged, `version` = current + 1, at least one field changed | the identity does not drift, and a version bump means something |
| without one: `version: 1` | a character built from its description and the owner's feedback starts at 1 |
| no statement announces a change of position or names a motive or power aloud (`detectTells`: announced-shift, named-motive) | the persona shows, it never tells (E14) |

`accept <proposal> --to <target>` repeats all of it against the target (a new persona when the target does not exist), refuses a
proposal that is already the target's content (accepting twice), keeps a timestamped backup (`<target>.bak-<UTC stamp>`, never
overwritten), writes through a temp file, and **refuses before reading anything** a target that is not a `.persona.md` file, is inside
`Shattered-AI/personas`, or is inside any `persona-core` folder. Neither command commits anything.

## What the teaching session may and may not use

For a registered real character there is no current file. The session builds version 1 from the character's stored description (the
`/characters/<codename>/description` answer, names already replaced) and the owner's feedback. It never reads the raw game logs, and the
proposal holds the codename and what the character does in play, no real name and nothing about the real person. Proposals live in the
private DSL docs folder `docs/copilot/persona-proposals/<codename>/v<n>.persona.md`.

## Tests

`pnpm --filter @shatteredarchive/copilot-core test` (`records.test.ts`): the summary build and parse, every refused piece, the ticket rule.
`pnpm --filter @shatteredarchive/copilot-server test`: `cli.test.ts` (the `persona-feedback` command) and `bundle.test.ts` (the persona
entry). In Shattered-Story, `pnpm test:scripts` runs `scripts/lib/persona-proposal.test.mjs` (valid proposal; same, skipped or lower
version; changed id or name; announced shift; named motive; unparseable proposal or current file; research domain; accept writes a backup
and the new content; accepting twice; a Shattered-AI or persona-core target; the script run as a real process).
