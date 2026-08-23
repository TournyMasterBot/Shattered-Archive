# DSL Log Preview

A VS Code extension that renders Shattered Archive game-server `.jsonl` logs
as a plain, ANSI-colorized transcript side-by-side with the file you're
looking at — a lightweight sibling to the full
[DslLogViewer](../../../DslLogViewer) web app, with none of its damage
parsing, playback controls, or other analysis. Just the game text, colored,
in a panel you can search with the browser's own Find (`Ctrl+F` while the
preview has focus).

## What it renders

Each line in a `*.jsonl` log is one JSON record. Only `game:remote-server:raw`
records carry actual game text (`payload.data`, ANSI-laden); everything else
(GMCP telemetry, the player's own keystroke-level input events, server
lifecycle lines) is dropped — this is meant to read like a plain session
transcript, not reconstruct the wire protocol.

Raw payloads are **not line-aligned** — a word, or even an ANSI escape
sequence, can be split across consecutive records — so they're concatenated
in file order into one continuous string before any ANSI parsing happens.
Parsing per-record would risk splitting a `\x1b[...m` code mid-sequence.

## Use

1. Open a `.jsonl` game-server log file.
2. Run **DSL Log Preview: Open Preview to the Side** from the Command
   Palette, click the preview icon in the editor title bar, or right-click
   the file (Explorer or editor) and pick it from the context menu.
3. Once open, the preview auto-follows: switching the active editor to
   another `.jsonl` file rebinds it there.

## Develop

```sh
pnpm --filter dsl-log-preview watch
```

Then press **F5** (Run Extension) to launch an Extension Development Host.

## Package for local install

```sh
pnpm --filter dsl-log-preview package
```

Produces a `.vsix` you can install via *Extensions: Install from VSIX...*.

## Color palette

`src/ansiToHtml.ts` renders real ANSI SGR codes (`\x1b[31m`, `\x1b[38;5;130m`,
...), not DSL's `{X` markup — but it's the same 16(+extended)-color palette,
copied from `dsl-color-preview`'s DSL color table and cross-checked against
game-client's `dsl-to-ansi.ts` (which maps that table onto these same SGR
codes). True black gets the same treatment as `dsl-color-preview`: rendered
as a visible gray instead of literal `#000000`, since pure black is invisible
against this preview's near-black background. If the DSL color table changes,
port the change to both preview extensions.
