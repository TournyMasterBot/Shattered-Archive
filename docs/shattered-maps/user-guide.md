# Shattered Maps: user guide

Shattered Maps shows the map of the game as a set of places you can zoom into, and helps you decide which of the places a program found are
good enough to keep. It runs in your browser; nothing you do here changes the game.

Open it at **https://maps.shatteredarchive.dev/** (or http://127.0.0.1:22081/ on the machine that runs it). The older map editor is still there: choose
**Classic editor** at the top right.

## Opening a map

- **Open candidates…** opens a map file to look at and review: the places Copilot has walked, the community map imported from Azah, or a map
  made with the older editor. Files ending in `.json` and `.json.gz` both work. If a file is not a map, or is damaged, you are told why.
- **Open audited…** opens the file of places you have already accepted (the one you downloaded last time).
- **Showing** switches between the audited map and the candidates.

A map from the older editor is converted when you open it, and you are shown what the new format has no place for (for example doors, one-way
exits, room flags). Nothing is dropped without being listed.

## Zooming

The row under the title has four levels, from large to small: **Continent**, **Area**, **Subzone**, **Room**. Each button shows the name at that level.

- Press a level to go to it, or **Zoom out** to go up one.
- On a continent, pick an area from the list. Areas nobody has mapped yet are behind "Areas with no rooms yet".
- An area with several subzones asks which one you want; each subzone is drawn on its own.
- In a subzone, click a room in the picture, or pick it from the list below the picture. Double-click, or press the arrow button next to its name, to zoom
  in to it. A room is shown with the rooms its exits lead to.
- A subzone with several floors has a button for each floor.
- With the keyboard: Tab to the zoom row once, then the left and right arrow keys, Home and End move between levels, and Enter opens the one you are on.

## Reading the picture

| You see | It means |
|---|---|
| a solid line | the exit has been walked both ways |
| a dashed line | seen once, or taken from an imported map |
| a red dotted line | two sightings disagree about where the exit goes |
| a short line ending in **?** | the exit exists but where it goes is not known (a **gap**) |
| a short line ending in **→** | the exit leads to a room outside this picture (it **leaves the page**) |
| ▲ or ▼ on a tile | the room has an exit up or down |

Under the picture, the counts tell you how many gaps, conflicts and exits leaving the page there are, and "Gaps and conflicts" lists them: pick one
to see its room.

## A room

Select a room to see everything known about it:

- its name, number, terrain, position and description;
- its **exits**, each with how sure the map is, how often it was walked, and where it leads. Pick an exit to look at it or, in review, to decide on it;
- **What this room usually holds**: *Always here* is what has been seen on nearly every visit; *Seen, not part of the room* is what turned up
  once or twice (a wandering monster is not part of a room); *Used to be here* is what used to count and stopped being seen;
- **Where it comes from**: which map or walk the record came from, who made it (the Azah map is credited to Azah) and when.

## Reviewing candidates

Open a candidates file, zoom to an area, a subzone or a room, and the **Candidate review** panel lists what is waiting there. Rooms are listed
first, then exits.

1. Optionally write a short note: why, or what you checked in the game.
2. Pick an item from the list, or click it in the picture.
3. **Accept** puts it in the audited map. **Reject** removes it from the queue. **Accept with these changes** lets you correct the title, terrain
   and description of a room, or where an exit goes and whether you vouch for it, and then accepts it.
4. **Accept all N in this view** accepts everything waiting in what you are looking at. Items that cannot be accepted are skipped and the message says why.
5. A rejected item can be **put back in the queue** at any time.

Accepted rooms are outlined green on the picture, changed ones orange, rejected ones red and dashed. Accepting an exit also accepts the room it starts at.
An exit to a room you have not accepted yet is kept, and shown as leaving the page until that room is accepted too.

Everything you accept keeps where it came from and gets your review added with the date. Your notes are kept in the review log.

## Keeping your work

Your audited map and review log are kept in this browser automatically. To hand them on, use:

- **Download audited file**: the accepted map, ready for the next step;
- **Download review log**: each decision with your note and the date.

**Empty audited file** starts again (it asks first; download first if you want to keep it). If the browser ever cannot keep your work, a red message says so:
download the files then.

## Exporting to the Builder

Once places are in the audited map, you can turn an area or a subzone into a file for MUD Builder, the tool that edits the game's world files.

1. Show the **Audited** map and zoom to the area or subzone you want. (At the continent or room level the panel only asks you to zoom.)
2. In **Export to the Builder**, check the file name (it must end in `.are`) and give the **first** and **last room number** the area may use. Pick a
   range no area in the Builder already has: the Builder tells you when you import if it overlaps.
3. Press **Make the Builder file**. You see how many rooms and exits it has, and **What the file leaves out**: positions on the map, where records came
   from, what a room usually holds, exits whose target is not known or in dispute, and text the file cannot hold. Nothing is left out without being counted. If the
   range is too small, or the name is not accepted, the reason is shown and no file is made.
4. **Download the .are file** (or **Download as an import request**, for tools).
5. In MUD Builder, use **Import .are file**, then **Validate**. The Builder checks the file again and shows its own report. **Commit is a separate step you take
   there**; a new area is loaded by the game at the next copyover. This page never sends anything to the Builder or changes the game.

A room that already has a room number keeps it when it fits your range; the others are given the lowest free numbers.

## Changing something already accepted

Switch to **Audited**, select a room or one of its exits, and use the form: it changes the title, terrain or description of a room, or where an exit goes. Each
change is dated and noted in the room's history.

## The map on the Shattered Archive site

The map you have accepted is also shown to everyone on the Shattered Archive site, at **/maps/world-v2**, linked as **World Map** under **Tools** in the menu. It replaced the
older beta map: the old address (/maps/world-map) now sends you to the new page.
Until you publish an accepted map there, the page says that the new map has not been published yet.

- Choose a **continent** to see its areas, then an **area** (from the list or by clicking it on the picture) to see its rooms. On a continent, each area is a box sized by how
  many rooms it has (small to start with, in proportion), none on top of another, placed beside the areas its exits join it to, in the direction the exits point. A **line with an arrow** joins
  two areas an exit leads between, arrowheads at the end the exits go in at (both ends when you can go both ways); hover a line to read which way and how many exits, faint lines run a long way.
  The whole continent opens inside the window; zoom in to read the names. An area's name is written in the box when it fits; hover for the name and the room count.
- **Floor** has **Up** and **Down** buttons with the name of the floor between them (for example *Up 2 (3 of 5)*); Page Up and Page Down do the same.
- **Move the map** by dragging it, **zoom** with the mouse wheel (it zooms where the pointer is) or the **-**, **Fit** and **+** buttons. With the map selected (click it, or Tab to it) the arrow
  keys move it, **+** and **-** zoom, **0** fits, and **Esc** clears the selected room.
- Click a **room** for its description, terrain, exits, what is usually there and where the record came from. The room stays **ringed in blue** for as long as its details are shown.
- **Stairs.** A green **▲** on the left half of a room is a way up, an orange **▼** on the right half is a way down. Hover it to read the name of the room it leads to; click it to go there
  (the floor changes and the room it reaches is selected).
- **Exits that leave the area** are a small circle with an arrow on the edge of the room, on the side the exit points. Hover it to read the name of the area it leads to; click it to open
  that area with the room you arrive in selected.
- **Terrain.** A room is coloured by its terrain (the key above the legend lists the terrains on the floor). Grey means the terrain is not known yet: the map's source did not record it, and
  it is filled in from the game's own room messages (see [terrain.md](terrain.md)).
- **Mazes and tangled exits.** An exit that does not lead to the room next to it is not drawn as a line across the other rooms. It is a small **chip on the edge of the room, on the side the exit
  points**: round when the exit does not lead straight on, square and orange when it lands far away. Hover a chip to read where it goes, click it to jump there. **Click a room** in a maze and a
  line is drawn out of each of its exits, leaving square to the edge and swooping to the room it lands in. Each line has its own colour and the room it reaches is tinted and ringed in the same
  colour (a dashed line is a teleport), with an arrow half way along it and one where it meets the room, and it is routed round the other rooms where there is a way, so the many tangled exits stay out of the way until you ask where one goes, and the real path through the maze (the plain lines) stays easy to follow.
  A **small arrow on a plain line** marks a one-way join: you can go that way but not back. Maze rooms are amber octagons (every room is an octagon: the game has eight compass directions, N NE E SE S SW W NW, plus up and down). Small labels under a maze room's name: **IN** a way in from
  outside, **OUT** an exit to another area, **END** a dead end, **1-WAY** a room you can land in but not leave back the way you came.
- **Every room is an octagon.** The game's exits are the eight compass directions (N, NE, E, SE, S, SW, W, NW) plus up and down, so a room is drawn with eight sides: a chip on a side is the exit that way, and up and down are the two halves inside the tile. There is no hexagon (six-way) layout: it would not match how you move in the game.
- The legend explains the lines: a solid line is an exit someone walked, a dashed one is recorded but not yet walked, a red dotted one is where
  sources disagree. A **?** is a gap, an exit nobody has followed.
- The line under the title credits the people whose map data is shown (for example the community map by Azah).

Publishing is a step you take: turn the audited file into the site's files with `publish-audited.mjs` (see [world-map-api.md](world-map-api.md)), commit them, and deploy.
Room history and any record of a player are never published.

## The map in the game client

Choose **Game > Map…** to open the map window. It floats over the game (you can still play), opens in the empty black space beside the terminal, and you can **drag its
title bar to move it** and **drag its bottom-right corner to resize it**; it remembers where you put it. Close it with the × or the Esc key.

- It shows the area you are standing in, with your room outlined in gold, and follows you as you walk. **You are here** means the title and the exits match one room;
  **You are probably here** means only the title matched; **One of N rooms that look alike** marks every room that fits.
- **Move the map** by dragging it; **zoom** with the mouse wheel (it zooms where the pointer is) or the **+** and **−** buttons. **⤢** fits the whole floor and **⌖** centres on you again. The button under it, with a red dot, shows or hides the **red "you are here" dot** on your room (on by default, and only drawn when the map knows where you are; fainter when it is only probably the room, or one of several that look alike). The choice is kept.
  The arrow keys also move the map, **+** and **−** zoom, and **Home** goes back to you.
- **Floors.** The strip at the left lists the floors of the area (the top floor first, **G** is the ground floor). Click one to look at it. The floors just above and below are drawn faintly
  behind it, a little to the side, and fainter the further away they are; click a faint room to go to its floor. PageUp and PageDown also change floor.
- **Other areas.** An arrow at the edge of the map is an exit into another area. Click it to look at that area (the header says **Looking at …**). Click **Reset view** to come back to where you are.
- **Settings** (the gear): show *this floor only*, the *nearby floors* (the default) or *all floors*; room names on or off.
- **Fog of war** (the gear, off by default). Turn it on to see only the places you have actually been, as your own map of your own exploration: choose **Rooms my account has visited**
  (every character of your account) or **Rooms this character has visited**. Rooms you have not entered, their names, and where an exit out of a room you have seen would lead are hidden; an exit
  you have not followed shows as a small **?**. Your own room is always shown. A small eye in the title bar tells you fog is on and opens the settings; choose **Off** to see everything again.
  The window keeps count of the rooms you enter whether fog is on or not, so switching it on shows what you have already explored. It is kept in this browser only.
- **Rooms the map does not have.** When the line says **"… is not on the map yet"**, click **Add this room…** at the bottom. The window fills in what your own play knows about the room
  (the exits, the sector and where each exit led, from your Copilot history when that is on, otherwise from the rooms this browser has seen) and you choose the continent, the area and the subzone
  it belongs to, or give a new one a name. For each exit you can pick the room it leads to, search for one, or leave it as "I don't know". **Save room** keeps it in this browser (for the game
  you are connected to) and puts you on the map at once. It is only yours: it is not added to the published map. **Add a room by hand…** in the gear does the same with nothing filled in, and
  **Rooms I added** at the bottom of the panel lists your rooms with a **Remove** button for each.
- **Cloud backup** (the gear, last section). Your explored rooms and the rooms you added are kept in this browser. To carry them to another browser or device, sign in to your Shattered
  Archive account and press **Sync now**: the ids of the rooms you explored (for each of your characters) and the ids of the rooms you added are saved on your account, and whatever your
  other devices saved comes back in. Nothing is sent until you press it: there is no automatic sync. Only you can read your backup, and it holds ids only, never room names or descriptions.
  A room you added keeps its details in the browser that added it, so another device only learns that it exists (the line says how many are on other devices). The backup is the same list
  for each world the client knows, and syncing never removes anything: if a device is behind, it only adds. **Erase my backup…** (it asks first) removes your account's copy and leaves
  the rooms in your browsers alone. Without a sign-in the window says so and sends nothing. The Android app's map screen does not have the sync command yet.
- **Mazes and tangled exits.** Where an exit does not lead to the room next to it (a maze, a teleport, a one-way trick) the map does not draw a long line across the other rooms. It marks the exit with a **small chip on the edge of the room, on the side the exit points** (round: it does not lead straight on; square: it lands far away), and selecting the room draws a line from each chip to where it lands. Maze rooms are **amber octagons** (blue for a loop, a smaller purple one for a teleport run) and a room in an ordinary area that has such an exit is a **purple octagon**. Small labels under a maze room: IN, OUT, END and 1-WAY. The help (the **(i)**) lists them.
- **The continent picture** shows each area as a box, none on top of another, with an arrow line between areas an exit joins. The boxes are sized by how many rooms the area has, and sit where the map's author put them as far as that allows, the rest placed by the direction of the exits between areas (on Arkane: the city in the middle, Verminasia to the north, the port to the west, the Arkania Roadway to the east, the Marauders to the south).
- Click a room to see its name and exits at the bottom. The line at the bottom also says **"… is not on the map yet"**, **The map is offline** or **No map has been published yet** when that is so;
  it never stops the game. The credit line names the people whose map data it is.

The map window also has a small blue **(i)** in its title bar: it opens a short help for the map (where you are, moving around, the settings, fog of war and your own rooms) over the picture; **← Back to the map**, the (i) again or Escape closes it.
