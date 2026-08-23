# DSL Color Preview

A VS Code extension that live-previews Shattered Archive DSL color codes
(`{R`, `{G`, `{x`, ...) side-by-side with the file you're editing — the same
rendering the game-client Library modal's "Color Preview" tab uses, just
running against whatever file is open in the editor instead of a Library item.

## Use

1. Open any text file containing DSL color codes (room descriptions, socials,
   help text, ...).
2. Run **DSL Color Preview: Open Preview to the Side** from the Command
   Palette, click the preview icon in the editor title bar, or (for `.txt`
   files) right-click the file — in the Explorer or inside the editor — and
   pick it from the context menu.
3. Keep typing — the preview re-renders on every edit (debounced ~120ms).

Once open, the preview auto-follows: switching the active editor to another
`.txt` file rebinds it there. Switching to a non-`.txt` file (or a non-file
editor, like the preview panel itself) leaves it showing the last `.txt` file.

## Develop

```sh
pnpm --filter dsl-color-preview watch
```

Then press **F5** (Run Extension) to launch an Extension Development Host.

## Package for local install

```sh
pnpm --filter dsl-color-preview package
```

Produces a `.vsix` you can install via *Extensions: Install from VSIX...*.

## Keeping the color table in sync

`src/renderDslToHtml.ts` is a deliberate copy of
[apps/game-client/src/features/library/renderDslColorPreviewHtml.ts](../game-client/src/features/library/renderDslColorPreviewHtml.ts)
(a VSIX bundles its own code, so it can't import across the workspace at
runtime). If the DSL color table changes there, port the change here too.
