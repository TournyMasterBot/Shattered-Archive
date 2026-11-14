---
name: copilot-train
description: Run a Claude-owned Copilot training session against the Simulacrum. Claude stands in for the human trainer through a VISIBLE Playwright pilot, answering Copilot's suggestions (approve, correct, reject) with the literal merc-mud source as the only authority. Simulacrum only, dev stack only, never the production game. Starts only with the owner's go, because it needs the Copilot server, the Simulacrum and a local model running. Triggers - /copilot-train, train copilot, training session, claude training.
---

# copilot-train: Claude as Copilot's trainer, on the Simulacrum

Full description, gates and flow: `docs/copilot/claude-training.md`. This page is the procedure.

## Rules that never bend

- **Only with the owner's go.** The session needs three things the owner runs: the Copilot server, the Simulacrum, and a local model (the GPU). Do not start any of them, and do not begin a session on your own initiative. If something is not up, say which one and stop.
- **The pilot is always visible.** `scripts/pilot.mjs` opens a headed browser window on the owner's screen so every screen can be watched. Never pass `--headless`, never hide or move the window off screen; `lib/headed.mjs` refuses it anyway.
- **Simulacrum only.** The pilot dials only the Simulacrum's relay. Training turns itself off server-side when the connection is not the Simulacrum's or Copilot is off. Never use the production game, and never copy a lesson of this session into a DSL file.
- **The source of truth is the merc-mud source code**, `C:/Projects/merc-mud/2.4/src` (and, for what the original did, the first commit `8f36d5a`). A correction or rejection must cite it (`act_info.c do_consider`, `fight.c do_flee`, `merc.h`): the pilot refuses a `why` that names no source file. Never answer from memory or from the DSL.
- **Never commit or push, never accept findings for the owner's ledger.** Your answers and the lessons they make go to the trainer's own ledger (`.../copilot-server/training/`), stamped `trainer: claude`, world `sandbox`, kept apart from the owner's.
- Credentials are in git-ignored `*.local.json` files in the plan folder; never print them or put them in a file that is committed.

## Start

```
node .claude/skills/copilot-train/scripts/pilot.mjs \
  --account <plan folder>/test-account.local.json \
  --character <plan folder>/trainee.local.json \
  --dir <scratch folder>/rendezvous \
  --session C:/Projects/DSL/GameLogs/ShatteredArchive/Docker/copilot-server/training/sessions/<yyyy-mm-dd-hhmm>.jsonl
```

Run it in the background. It signs in, plays a throwaway character (`Zztrainee`, made on first use), opens the Copilot window, turns Copilot and Claude training on, and waits for suggestions.

## The loop

1. Read `<dir>/pending.json`: the suggestion (id, command, rationale, kind, sphere, situation) and the last 25 lines of the game screen.
2. Decide from the source. Find the rule with `Grep` in `C:/Projects/merc-mud/2.4/src` (the command's `do_*` function, the table it reads). Check the focus areas below.
3. Write `<dir>/answer.json`:
   - `{"id": "<id>", "action": "approve"}`
   - `{"id": "<id>", "action": "correct", "command": "consider goblin", "why": "act_info.c do_consider: consider before a fight"}`
   - `{"id": "<id>", "action": "reject", "why": "fight.c do_flee: ..."}`
   - `{"id": "<id>", "action": "wait"}` to look again later; `{"action": "stop"}` to end.
   A refused answer is explained in `error.json`; fix it and write again.
4. Every answer is appended to the session log with its focus area.

## What to teach (the focus areas)

Training is about how Copilot decides in the world: **navigating**, **interacting** (doors, shops, healers, objects), **fighting for levels** (look up, then `consider`, fight only up to four levels above, flee early, rest), **inventory** (misc items and equipment), **buffs and maladictions** (`affects`, cures), **healing** and **stats**. After a stretch, summarise the log (`lib/sessionLog.mjs` `summarize`) and steer toward the areas nothing has been asked about.

Rules Copilot must already follow (docs/copilot/fight-safety.md): never start a fight before the monster is looked up in the archive or `consider`ed; a fight in progress is followed by code and the `flee` is made without waiting for the model.

## End

Write `{"action": "stop"}`. Training turns itself off; the pilot closes the window. Tell the owner what the log shows: counts per area, the areas left untouched, the lessons made (in the trainer's ledger), and anything in the source that Copilot got wrong in a way a code fix (not a lesson) should address.
