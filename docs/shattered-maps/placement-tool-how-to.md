# How to start and use the placement tool

The placement tool is a web page where you drag every place of the world or of a continent to where it belongs on the realistic world picture. What you save is the ground
truth for the world and continent pictures of the Maps viewer. How the tool is built and what the saved file holds is in [placement-tool.md](placement-tool.md);
this page is the practical part.

You place the **world** (continents and seas) and the **continents** (their areas). Areas, subzones and rooms stay grids and are not placed here.

## 1. Start it

The pages already exist in the private map folder:

```
<private world-map folder>/training/
  placement-world.html        the continents and the named seas, on the whole world picture
  placement-arkane.html       Arkane's 88 areas, in rooms east and south of its port
  placement-althainia.html    Althainia's areas (world-picture pixels)
  placement-icewall.html      Icewall's areas
  placement-tropica.html      Tropica's areas
  placement-shokono.html      Shokono's areas
```

Double-click one to open it in **Chrome or Edge** (Firefox and Safari work too, but cannot save straight to a file: see step 4). Nothing has to be running: no server, no stack, no
internet. The picture is inside the file.

**To make fresh pages** (after the map is rebuilt, or after a change to the starting guesses), from the repository root:

```
pnpm --filter @shatteredarchive/shattered-maps-core build
node services/shattered-maps-core/scripts/make-placement-tool.mjs --in <audited-map.json> --image <world.webp> --all <private world-map folder>/training
```

`<audited-map.json>` is the current audited map (for example `audited-build/audited-map.relayout.json` in the private folder); `<world.webp>` is `Server/Server.Web.Public/wwwroot/img/world.webp`
in the DSL repository. For a single page add `--level world`, or `--level continent --continent az-c411`, and `--out <file.html>` in place of `--all`.
Making pages again does not delete your work: it is kept per level in the browser (step 4), and a saved file can always be loaded back.

## 2. What you see

| Part | What it is |
|---|---|
| The picture | The realistic world map (the whole world, or one continent cropped). The **grid** is over it: a line every 5 rooms on Arkane (heavier every 10), every 10 or 20 pixels elsewhere. |
| The origin | On Arkane, the blue square is **The Arkania Port, (0, 0)**. **x** is rooms east of it and **y** rooms south of it, so a place at (7, 0) is seven rooms due east. On the other pages the origin is the picture's top-left corner and the units are picture pixels. |
| A token | A coloured, labelled pill: one place. A **dashed outline** is a starting guess (taken from your descriptions and from your literal-compass walks); a **solid outline** is something you moved or confirmed. |
| The list (right) | The places that are not on the map yet, biggest first, with their room counts. The box above it filters it. |
| The status line (bottom left) | The coordinates under the pointer, in the page's units and in world-picture pixels. Use it to say exactly where something is. |

## 3. Place things

1. **Drag a place from the list onto the map.** Let go over the map, not over the right-hand panel (that cancels the drop).
2. **Drag a placed token to move it.** It turns solid and counts as confirmed.
3. **Double-click a placed token** to send it back to the list.
4. **Click a token** to see what it connects to. The yellow lines go to its neighbours with the direction you typed and how many exits there are (`E3 S2` means three exits east and two south);
   the panel under the list gives the same in words. This is a hint, not an answer: an exit can be a shortcut, a portal or a maze, so a long line is normal and a neighbour can lie anywhere.
   Click an empty part of the map to clear the selection. *all exits* draws every pair at once.
5. **Confirm what is already right.** *Confirm all* marks every place that is on the map as yours; use it after you have looked over the starting guesses and moved the wrong ones.
   An untouched guess is saved as `confirmed: false`, and anything that learns from your placements will ignore it.

Controls: *grid* shows or hides the grid, and the slider next to it fades the picture towards white so the labels stand out.

**A good order.** Start with the anchors, then fill in around them:

- World: the central ocean (Arsataw Yaa) and the other seas first, then the continents around them.
- A continent: the port or coast, then the big places, then the small ones. Use *click a token* to check a direction (if the exits from A into B are mostly east, B probably lies east of A).
- Do not worry about perfect: you are placing general locations, and the distances are the feel of the place, not a measurement.

## 4. Save, stop and come back

- **It autosaves** in the browser after every drag, one saved copy per level. Closing the tab and opening the same page in the same browser picks up where you left off.
- **Save to file...** (Chrome, Edge) asks where to put `placements-<level>-<name>.json` and writes it there. Do this when you finish a sitting: autosave is lost if the browser's site data is cleared.
- **Download** does the same through the browser's downloads (any browser). **Load...** reads a saved file back in, replacing what is on the map.
- **Reset** puts everything back to the starting guesses (it asks first). It does not touch a file you saved.

Keep the saved files in the private `training/` folder next to the pages. They are not committed to the repository.

## 5. If something is off

| Problem | What to do |
|---|---|
| Dragging from the list puts nothing on the map | Release over the picture, not over the panel. |
| A token is lost behind others | Filter and drag it again, or double-click one of the others to send it back to the list. |
| Everything disappeared | The browser's site data was cleared: *Load...* your last saved file. |
| "Save to file..." downloads instead | The browser has no file picker (Firefox, Safari): that is the *Download* path, the file is in the downloads folder. |
| A place is missing | Pages are made from the audited map of the day: make fresh pages (step 1). Unsorted areas are not placed here. |
| The grid or the origin looks wrong | Tell me which page; the frames (where a continent lies on the picture and in which units) are in `FRAMES` in `make-placement-tool.mjs`. |

## 6. What happens with what you place

Your confirmed placements are the target the continent and world layouts are measured against and seeded from (the next phase of
`.ai-plans/active/2026-11-19_realistic-world-and-continent-maps`). Until then the saved files simply wait in the training folder.
