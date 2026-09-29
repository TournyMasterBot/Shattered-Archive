# Built-in Plugins

Plugins are pre-built automation tools available from **Plugins → Manage Plugins** in the menu bar. Unlike scripts, you don't write any code — just enable the plugin and fill in the settings.

---

## Managing plugins

1. Open **Plugins → Manage Plugins…** from the menu bar.
2. Toggle a plugin on or off with the enable switch.
3. Click **Configure** to open the settings panel for that plugin.

Configuration is stored in `localStorage` and persists across sessions.

---

## Roller

**Purpose:** Automates character stat rolling at creation. Keeps rejecting rolls until all your configured minimums are met.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Stat minimums | Numbers | Set a minimum value for each stat (STR, DEX, CON, etc.) |

**Usage:** Enable the plugin, configure your minimums, then start rolling in-game. The plugin automatically presses "No" until a roll meets all your targets.

---

## Auto Standup

**Purpose:** Automatically issues a stand command whenever the server sends text matching one of your configured knockdown phrases. Replaces the manual trigger approach from `DSL_PNP_Character.standup`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Trigger phrases | Textarea | One phrase per line. Lines starting with `#` are comments. Matching is case-insensitive. |
| Stand command | String | The command sent when a phrase matches (default: `~st`) |
| Debug logging | Boolean | Logs match details to the script console |

**Example phrases:**
```
# Auto Standup trigger phrases
knocking you senseless
You fall to the ground
You are stunned
You are knocked down
You lose your balance and fall
You slip and fall
```

**Notes:**
- The plugin strips ANSI color codes from incoming text before matching.
- Each phrase is matched as a case-insensitive substring against the raw line.

---

## Auto Respell

**Purpose:** Watches for `game:affect-removed` events and automatically re-casts any spell you have listed. Replaces the manual scripting approach from `DSL_PNP_Affects`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Spells | Textarea | One entry per line: `affect name` or `affect name \| cast command`. Lines starting with `#` are comments. |
| Cooldown (ms) | Number | Delay in milliseconds before recasting (default: `500`) |
| Debug logging | Boolean | Logs spell matches to the script console |

**Format:** Each line is either:
- `affect name` — plugin defaults to `cast '<affect name>'`
- `affect name | cast command` — uses the exact command you specify

**Example:**
```
# Auto Respell spell list
sanctuary
bless | cast 'bless' self
armor | cast 'armor' self
haste | cast 'haste'
stone skin
```

**Notes:**
- Matching is case-insensitive substring match against the affect name from the server event.
- The cooldown delay prevents recasting the same spell multiple times in rapid succession if several affects drop at once.

---

## Brew Helper

**Purpose:** Automates potion brewing with a letter-map shorthand and named recipes. Intercepts the `brew`, `showbrews`, `showletters`, and `showsymbols` commands in the command bar.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Letter map | Textarea | One mapping per line: `LETTER = item name`. Lines starting with `#` are comments. |
| Recipes | Textarea | One recipe per line: `name = token token …`. Lines starting with `#` are comments. |
| Symbol map | Textarea | One mapping per line: `symbol = spell name`. Supported symbols: `! @ $ % ^ & *`. Lines starting with `#` are comments. |
| Storage container | String | Where items are fetched from (default: `shelf`) |
| Debug logging | Boolean | Logs recipe execution to the script console |

**Letter map format:**
```
# Map a single uppercase letter to an item name
C = cologne
S = ill shard
P = pinch of powder
V = vial of water
```

**Recipe format:**

Tokens can be:
- A single letter (`C`, `S`) → resolved via the letter map
- A quoted item name (`'ill shard'`)
- A quantity prefix + letter (`2xS`, `3xC`)
- A quantity prefix + quoted name (`2x'ill shard'`)
- Any token can have a **symbol suffix** (`K*`, `K%`, `K@`) — casts that symbol's mapped spell on the item between `get` and `put`

```
# Recipes
health  = 2xS C P V
light   = 2x'ill shard'* K     # cast * spell on each ill shard before putting in
cloak   = K K* S               # cast * spell on the second K only
special = K* K% S              # * spell on first K, % spell on second K
```

**Symbol map format:**

Symbols define spells cast on items mid-recipe (between `get` and `put`). The `#` character is reserved as the comment marker and cannot be used as a symbol.

```
* = continual light
! = invis
@ = curse
$ = bless
```

**Command bar commands:**

| Command | Description |
|---|---|
| `brew <name>` | Execute a saved recipe (fetches all ingredients to the cauldron) |
| `showbrews` | List all saved recipes |
| `showletters` | List all letter-to-item mappings |
| `showsymbols` | List all symbol → spell mappings |

**What the plugin does per ingredient:**
1. `get '<item>' <storage>` — retrieves the item from your storage container
2. `cast '<spell>' '<item>'` — cast the token's symbol spell on the item *(only if a symbol suffix is present and mapped)*
3. `put '<item>' cauldron` — places it in the cauldron

The sequence repeats for each token in the recipe, respecting quantity prefixes.

**Notes:**
- If a letter in a recipe has no entry in the letter map, that token is skipped and a warning is logged.
- If a symbol suffix is used but has no entry in the symbol map, a warning is logged and the cast step is skipped.
- These commands are intercepted before they reach the game server — they never appear in the terminal.

---

## Auto Re-wield

**Purpose:** When a `event:disarm` event fires (your weapon was knocked out of your hand), automatically retrieves and re-wields it. Replaces `DSL_PNP_Character.disarm`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Weapons | Textarea | One weapon per line: `full item name \| alias \| nodrop` (nodrop optional) |
| Debug logging | Boolean | Logs trigger matches to the script console |

**Format:**
```
# full item name | alias | nodrop (optional)
a shining longsword | sword
a heavy shield | shield | nodrop
```

- `full item name` — the exact name as shown in the disarm event payload
- `alias` — short name used in `get` and `wield` commands
- `nodrop` — if present, the weapon doesn't land on the floor; uses `~wield alias` directly instead of `~get alias` first

---

## Color Kit

**Purpose:** Colorizes matched lines in the terminal using DSL color codes. Each rule suppresses the original line and writes a colored replacement. Useful for highlighting tells, mob deaths, system messages, and any repeating text.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Rules | Textarea | One rule per line: `match text \| color [| event]`. Lines starting with `#` are comments. |
| Debug logging | Boolean | Logs matches to the script console |

**Rule format:**
```
# match text | color [| event name]
You are hungry | {Y
Your victim is DEAD | {R
You receive | {G
```

- `match text` — case-insensitive substring matched against each incoming line (after ANSI stripping)
- `color` — a DSL color code prefix applied to the whole line (e.g. `{R`, `{Y`, `{G`)
- `event` — optional event name dispatched when the rule matches

**DSL color codes:**

| Code | Color | Code | Color |
|---|---|---|---|
| `{r` | dark red | `{R` | bright red |
| `{g` | dark green | `{G` | bright green |
| `{y` | yellow | `{Y` | bright yellow |
| `{b` | dark blue | `{B` | bright blue |
| `{m` | dark magenta | `{M` | bright magenta |
| `{c` | dark cyan | `{C` | bright cyan |
| `{D` | dark gray | `{W` | bright white |
| `{p` | pink | `{o` | orange |
| `{x` | reset | | |

Use **Sync Colors** in the config panel to apply rule changes without restarting the plugin.

---

## Enchant Helper

**Purpose:** Automates the enchanting loop. Tracks the current level of your active item, watches for server responses, and continues casting until a target level is reached. Handles fades (resets level) and explosions (marks item destroyed). Replaces `DSL_PNP_Enchant`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Items to enchant | Textarea | One item per line: `item name \| weapon or armor` |
| Container | String | Bag to fetch items from (e.g. `bag`) |
| Storage | String | Where to store finished items before fetching the next (optional) |
| Auto-enchant target level | Number | Keep casting until this level (0–3). `0` = cast once per command |
| Debug logging | Boolean | Logs level tracking and outcomes |

**Example items:**
```
fancy longsword | weapon
dragon helm | armor
```

**Level display:** Weapons show as `+1/+1` through `+3/+3`. Armor shows as `-1` through `-3`. Destroyed items are marked `DESTROYED` and the loop halts.

**Command bar commands:**

| Command | Description |
|---|---|
| `enchant start [name]` | Set active item and begin enchanting |
| `enchant stop` | Halt the auto-enchant loop |
| `enchant get [name]` | Store current item, fetch named item from container |
| `enchant restore` | Cast restore on the active item |
| `enchant disenchant` | Cast disenchant on the active item |
| `enchant identify` | Cast identify on the active item |
| `enchant reset` | Reset the tracked level to 0 |
| `enchant set <n>` | Manually override the tracked level |
| `enchant show` | Print current item, level, and auto-enchant status |

---

## Gourd Helper

**Purpose:** Tracks your potion gourd inventory. Learns gourds from `lore` output, removes them when they evaporate or are used, and lets you quaff, apply, toss, or drop by spell name or list number. When enabled, a **Gourds** tab appears in the right sidebar alongside Affects Summary. Replaces `DSL_PNP_Gourd`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Debug logging | Boolean | Logs trigger matches and state transitions |

**Command bar commands:**

| Command | Description |
|---|---|
| `scan gourds` | Lore all gourds in inventory to rebuild the list |
| `remove gourd <n>` | Manually remove gourd #n |
| `gq <spell or #>` | Quaff a gourd. Removes it from the list. |
| `gd <spell or #>` | Drop a gourd. Removes it from the list. |
| `toss <spell or #>` | Toss a gourd. Falls through if not a tracked gourd. |
| `apply <spell or #> [target]` | Apply a gourd. Falls through if not a tracked gourd. |

**How references work:** Use the spell name (e.g. `gq sanctuary`) or the list number (e.g. `gq 3`). Duplicate gourds of the same type get indexed automatically — `1.healing`, `2.healing` — so the right one is targeted.

---

## People

**Purpose:** Passively tracks player information from who-list output — level, race, class, and organization. The database is stored locally and powers the Highlighter plugin. Nothing requires configuration; it builds itself as you browse who lists in-game. Replaces `DSL_PNP_People`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Debug logging | Boolean | Logs each player added or updated |

**Command bar commands:**

| Command | Description |
|---|---|
| `show info <name>` | Look up a player by name prefix |
| `show kinfo <kingdom>` | List all known players in a kingdom (e.g. `NT`) |
| `show cinfo <clan>` | List all known players in a clan. Use `conclave` for all Robe clans. |
| `show craft <craft>` | List known crafters sorted by rank |
| `set status <name>` | Toggle a player between enemy (`*` suffix) and neutral |
| `set status <name> enemy\|neutral\|ally` | Set status explicitly. Allies show a `+` suffix. |
| `set team <name> <tag>` | Assign a team label shown before the name by the Highlighter. Use `none` to clear. |

**Notes:**
- Detects both standard who-list format (`[25 H-Elf Mage] (NT) Name`) and who craft output.
- The scan only runs for a few seconds after you run a `who`/`whoc`/`whok`/`whocraft`/`whois` command (or any other command starting with "who") — it isn't reading every line that comes in.
- Player data persists in `localStorage` indefinitely — the database grows over time.
- Names with apostrophes (e.g. `Z'szytheis`) are supported directly — no quoting needed.

---

## Highlighter

**Purpose:** Colors player names by organization as they appear in who lists, farsight, scan, and gossip/clan-gossip lines. Clan members are colored by clan (e.g. Wargar → cyan, Slayers → yellow). Kingdom members show with a cyan org prefix. **Requires the People plugin to be enabled.** Replaces `DSL_PNP_Highlighter` and `DSL_PNP_Highlighter.custom`.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Rules | Textarea | One rule per line: `<regex> \| next` or `<regex> \| line`. Lines starting with `#` are comments. |
| Debug logging | Boolean | Logs rule matches and next-mode transitions |

**Rule format:**

- `next` — when the pattern matches a line, the plugin enters *next-mode* and colors all following who-list entries until a blank line or prompt is detected.
- `line` — colors names within only the specific matched line.

**Default rules (from `DSL_PNP_Highlighter.custom.lua`):**
```
^Players near you:$ | next
^You quest out with your magic in search of others\.$ | next
^Looking around you see:$ | next
```

Use **Sync Rules** in the config panel to apply edits without restarting the plugin.

**Note on gossip:** unlike the rules above, gossip and clan-gossip aren't a configurable rule — there's nothing to edit for them. They're detected off the same chat classifier that powers the Chat pane, since gossip is an unprompted message from another player rather than a reply to anything you typed. This also means plain gossip is colored now too, not just clan gossip.

**Clan color reference:**

| Clan | Color |
|---|---|
| Wargar | `{C` cyan |
| Slayers | `{Y` bright yellow |
| Knighthood | `{B` bright blue |
| Shalonesti | `{G` bright green |
| Justice | `{b` dark blue |
| Red Robes | `{R` bright red |
| White Robes / Loner / Renegade / Angel | `{W` white |
| Black Robes / Shadow / Chaos / Demon | `{D` dark gray |
| Bloodlust | `{r` dark red |
| Dragon | `{G` bright green |
| Balanx | `{B` bright blue |

---

## Warlock Alphabet

**Purpose:** Helps warlocks establish and use their brew alphabet. Tracks which item you use for each brew letter, looks up spell recipes by name, and sends the correct cauldron commands in the exact insertion order the game requires.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Items | Textarea | One item per line: `label = lore name`. Lines starting with `#` are comments. |
| Brewer cipher | String | 26-character substitution string (position 1 = what A maps to, … position 26 = what Z maps to). Leave as `ABCDEFGHIJKLMNOPQRSTUVWXYZ` for no transformation. |
| Storage container | String | Where items are fetched from (default: `shelf`). |

**Item format:**

```
# label = lore keyword (used in: get 'lore name' shelf)
apple        = apple
kale         = kale chips
avocado      = avocado toast
```

- `label` — short key used in `wa set`, `wa log`, etc.
- `lore name` — the in-game keyword used in `get` commands
- Brew letter is derived from the first letter of the lore name, run through the brewer cipher

---

**How the brewer's cipher works:**

Each item's first letter passes through a 26-character substitution cipher to produce its brew letter. For example, with `A → K`, an apple (starts with A) contributes brew letter K. Configure the cipher string in settings, or discover it experimentally with `wa cipher` commands.

**How UIDs work:**

Each spell has a unique letter multiset (its UID). Items must be inserted into the cauldron in the exact order of the UID string — the cauldron reverses its display order, which reconstructs the spell name. For example, UID `SSELB` → insert S, S, E, L, B → cauldron displays B, L, E, S, S = BLESS.

**Gourd spell effects:**

- **Effect 1 (deterministic):** Fully controlled by the UID and insertion order — what `wa brew` automates.
- **Effect 2 (rule-governed):** Rules not yet fully defined; do not rely on this being predictable.
- **Effect 3 (always random):** Cannot be controlled regardless of ingredients.

---

**Command bar commands:**

*Alphabet management:*

| Command | Description |
|---|---|
| `wa solve` | Show assigned items per letter and gaps |
| `wa missing` | Show letters with no item assigned |
| `wa items` | List configured items and their brew letters |
| `wa auto` | Auto-assign items to letters based on the cipher |
| `wa set <letter> <label>` | Manually assign a letter to an item |
| `wa clear <letter>` | Remove a letter assignment |

*Spell lookup and brewing:*

| Command | Description |
|---|---|
| `wa lookup <spell name>` | Show the recipe and required items for a spell |
| `wa brew <spell name>` | Send brew commands in the correct cauldron order |
| `wa suggest [n]` | List brewable spells and spells missing 1–2 letters |
| `wa spells [brewable\|<letter>]` | List all spells in the database |
| `wa match <letters>` | Find spells matching a set of brew letters (e.g. `wa match KK`) |
| `wa spell-add <spell name> <UID>` | Add a spell not in the built-in database |
| `wa log <spell> using <items…>` | Record a brew result for reference |
| `wa experiments` | List recorded brew experiments |

*Cipher discovery:*

| Command | Description |
|---|---|
| `wa cipher` | Show all 26 letter mappings (`D`=confirmed, `C`=config, `~`=probable, `?`=unknown) |
| `wa cipher set a=o` | Confirm that items starting with A contribute brew letter O |
| `wa cipher maybe a=o,n` | Record that A is probably O or N (uncertain) |
| `wa cipher clear a` | Remove confirmed and/or probable mapping for A |
| `wa cipher export` | Get the full 26-char cipher string to paste into the config field |
| `wa deduce <spell> using <items…>` | Deduce cipher mappings from a known brew result |

*Named alphabets:*

| Command | Description |
|---|---|
| `wa use <alphabet>` | Switch to a named alphabet (creates it if new) |
| `wa reset confirm` | Wipe all assignments and experiments for the active alphabet |

**Notes:**
- Spell names and item labels with spaces can be quoted or unquoted: `wa lookup bark skin` or `wa lookup "Bark Skin"`.
- `wa deduce` supports an inline UID for unknown spells: `wa deduce spook KOOP using apple apple` — this auto-registers the spell.
- Item labels not found in the Items config are auto-created (lore = label) with a warning; add them to the config if the `get` keyword differs from the label.
- `wa brew` sends the raw cauldron commands — start with a fresh cauldron before running it.
- Browse brew-usable items at `https://shatteredarchive.com/items/all-items` or search by name, type, and level via `https://shatteredarchive.com/internal/brew-items?name=&type=&level=`.

---

## World Time & Identity

**Purpose:** Derives a Dawn/Day Time/Dusk/Night Time period from the game's tick clock, and reads your race, class, level, and XP off the score sheet — powers the compact HUD's time-of-day icon and character glyph, and feeds the Level Progress plugin a free exp-per-level reading every time you check your score. Auto-enabled by the Slate & Amber theme; independently toggleable for the default theme.

**Configuration:** None — nothing to set. Enable it from Plugins → Manage Plugins if you're on the default theme and want the same badges without switching themes.

**Notes:**
- The score-sheet scan only runs for a short window after you type `sc` or `score` — it's not reading every line that comes in, so it won't react to `score`-shaped text from anywhere else.
- Race and class have no GMCP equivalent, so they're only known after you've run `sc`/`score` at least once since your last login.
- If the game ever fails to tell the client you've logged in as a different character (e.g. your GMCP got disabled during a character switch), running `sc`/`score` fixes it on its own — the score sheet's own name line is enough to notice the mismatch and refresh everything, name included.
- Time-of-day derivation uses the GMCP tick clock directly — no text matching involved for that half.

---

## Level Progress

**Purpose:** Learns how much exp one level costs for your character, so the compact HUD's EXP bar shows an exact percentage from the first packet instead of an estimate. Re-learns automatically after a retrain or reclass, since those change the exp cost.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Fetch automatically | Boolean | When no trusted value is saved for your character — including right after a retrain/reclass invalidates one — send `worth` once to learn it. Default: on. |

**Actions:**

| Action | Description |
|---|---|
| Re-fetch now (worth) | Sends `worth` once and replaces the saved value — e.g. right after a reclass. Always sends, even before your level/identity is known — pressing this yourself is treated as a deliberate try, not something to second-guess. |
| Check score | Sends `score`. Unlike `worth`, a `score` reply carries your name/level/class/race too — with **World Time & Identity** also enabled, this can fully re-establish who the client thinks you are, not just the exp figure. |

**Notes:**
- `worth` isn't the only way this plugin learns the value: if the **World Time & Identity** plugin is also enabled, every `score`/`sc` you run gives it a free, independent reading — no `worth` command needed.
- The learned value is saved per character and reused across sessions. It's automatically dropped and re-learned if your level ever comes back lower than where it was learned (a retrain), or if your class changes (a reclass) — whichever the plugin notices first.
- Without this plugin enabled, the EXP bar still shows, but as a rougher estimate that only catches up gradually as you level.
- Automatic fetching (the config toggle) still won't fire before max level and your level are known — that restriction is only lifted for the manual **Re-fetch now** button above.
- If the game ever fails to tell the client you've logged in as a different character, the EXP bar would otherwise stay invisible forever — running `sc`/`score` yourself (via **Check score** above, or just typing it, with **World Time & Identity** enabled) fixes that on its own too, same as it does for your race/class/name.

---

## Weapon Flag Squelch

**Purpose:** Suppresses weapon-flag proc echo lines (Frost, Flaming, Shocking, Vampiric, Stunning, Mana Drain, Holy, Unholy) from the terminal. Each distinct proc line has its own toggle, since a flag can produce more than one distinct message. Poison lines are left visible by default.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Per-line toggles | Boolean (one per line) | Suppress that specific proc echo. See the line list below for the full set and defaults. |
| Debug logging | Boolean | Logs the active rule count to the script console |

**Actions:**

| Action | Description |
|---|---|
| Sync squelch rules | Re-registers suppression rules from the current saved config. Use this after toggling lines. |

**Lines (default squelched unless noted):**

| Flag | Line | Default |
|---|---|---|
| Frost (C) | "X freezes Y." | Squelched |
| Frost (C) | "The cold touch of X surrounds you with ice…" | Squelched |
| Flaming (F) | "X is burned by Y." | Squelched |
| Flaming (F) | "X sears your flesh…" | Squelched |
| Shocking (L) | "X is struck by lightning from Y." | Squelched |
| Shocking (L) | "X is shocked by a…" (other-target) | Squelched |
| Shocking (L) | "You are shocked by…" (self) | Squelched |
| Vampiric (H) | "X draws life from Y." | Squelched |
| Vampiric (H) | "You feel X drawing your life away…" (self) | Squelched |
| Stunning (S) | "X is knocked to the ground by Y." | Squelched |
| Mana Drain (M) | "You feel something drawing your energy away…" (self) | Squelched |
| Mana Drain (M) | "X draws energy from Y." | Squelched |
| Holy (O) | "You feel a surge of X's holy wrath…" (self) | Squelched |
| Holy (O) | "A flash of holy power erupts from X and hits Y!" | Squelched |
| Unholy (U) | "You feel a surge of X's unholy wrath…" (self) | Squelched |
| Poison (P) | "X coats Y with deadly lifebane poison." | Visible |
| Poison (P) | "X is poisoned by the venom on Y." | Visible |
| Poison (P) | "X shivers and suffers." | Visible |

**Notes:**
- Poison lines are visible by default — DSL2's own addition with no PNP equivalent, so it's treated as opt-in rather than noise to hide.
- Sharp and Vorpal produce no echo at all in-game, so there's nothing to squelch for them.
- Rules match against the full raw-data chunk, not per rendered line — if a needle matches anywhere in a multi-line chunk, the whole chunk is hidden.

---

## Combat Compression

**Purpose:** Suppresses selected classes of combat-log lines — Damage, Avoidance, Condition, Death, Flee/Rescue, Disarm, Ambient, Item Use, Status, Incapacitation, Attack Flavor, and UI Noise — to reduce scroll volume during fights. Every line is individually toggleable, not just per-category.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Per-line toggles | Boolean (one per line, grouped into the 12 categories below) | Suppress that specific combat-log line. |
| Debug logging | Boolean | Logs the active rule count to the script console |

**Actions:**

| Action | Description |
|---|---|
| Sync squelch rules | Re-registers suppression rules from the current saved config. Use this after toggling lines. |

**Categories:**

| Category | Covers |
|---|---|
| Damage | The unified miss/hit/kill-tier damage-verb line (self and other) |
| Avoidance | Dodge, parry, block, bard deflect, sense-attack, "seems unaffected", elemental/spell resist |
| Condition | HP and mana condition-tier lines |
| Death | "is DEAD!!", "hits the ground… DEAD.", "You hear something's death cry." |
| Flee/Rescue | Flee, escape-fail, panic-escape-fail, rescue, has-fled |
| Disarm | Fail, weapon knocked loose, shield knocked loose, third-person "X disarms Y!" success |
| Ambient | Room arrival/movement traffic, mounted arrival/departure, look/scan flavor, spell-cast precursor |
| Item Use | Quaff, get-from-container, drink from decanter, wield, wear, stop-using |
| Status | Buffs/debuffs landing (white aura, pink outline, stoneskin, haste, slow onset/wear-off) |
| Incapacitation | Third-person stun/blind/knockdown lines, plus your own stun-recovery and knockdown lines |
| Attack Flavor | Named special-attack cast/impact flavor text with no damage/debuff info of its own |
| UI Noise | Command echoes/errors, scan/group/affects listings, syntax help, the AFK tag |

**Notes:**
- Squelched by default: all Avoidance lines, the Disarm "tries to disarm… but fails" line, the "PANIC! You couldn't escape!" line, all Item Use lines, all Attack Flavor lines, and all UI Noise lines — these carry no information beyond "nothing happened," or duplicate a state-change line that follows.
- Everything else (Damage, Condition, Death, the rest of Flee/Rescue, the Disarm weapon/shield/other-success lines, Ambient, Status, Incapacitation) is visible by default, since it's a real state change most players want mid-fight.
- Text to Speech's Battle Focus / Arena caster options reuse this plugin's verified pattern list directly, regardless of this plugin's own toggles.

---

## Stun Highlight

**Purpose:** Squelches the original text of selected stun/knockdown lines and re-emits them recolored, so they stand out from normal combat scroll — red for a stun that actually landed on you, yellow for the attacker tripping over their own missed bash. Each line is independently toggleable.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Per-line toggles | Boolean (one per line) | Squelch the original and re-emit it recolored. See the line list below. |
| Debug logging | Boolean | Logs the active rule count to the script console |

**Actions:**

| Action | Description |
|---|---|
| Sync highlight rules | Re-registers suppression rules from the current saved config. Use this after toggling lines. |

**Lines (all default on):**

| Category | Line | Color |
|---|---|---|
| Red — Bash | "You are sent flying by the impact!" (self) | Red |
| Red — Bash | "X is sent flying by the impact!" (other-target) | Red |
| Red — Trip | "X trips you and you go down!" | Red |
| Yellow — Bash (evaded) | "…bash, causing him to fall flat on his face." | Yellow |
| Yellow — Bash (evaded) | "…bash, causing her to fall flat on her face." | Yellow |

**Notes:**
- Red lines mean a stun actually landed on you. Yellow lines mean the attacker's own bash missed and tripped them up instead — comedic/minor, not a stun on you.
- Matching is a literal substring match against each line, not a regex.
- Several requested lines are deliberately not included because they don't appear anywhere in the verified server log corpus: the Gore "…into the air!" line, the it-gendered Bash-evade variant, the self "You fall flat on your face!" Trip line, and the whole "Jest and charm" line group. Supply exact wording from a fresh capture if these turn out to be real but rare.

---

## Affect Echo

**Purpose:** Echoes affect gains and losses to the terminal with configurable colors, including per-affect color overrides.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Up color | String | DSL color code applied when an affect is gained (default `{C` cyan) |
| Down color | String | DSL color code applied when an affect is lost (default `{Y` yellow) |
| Per-affect color overrides | Textarea | One override per line: `affect name \| up color \| down color`. A matched affect name overrides the global Up/Down colors above. Lines starting with `#` are comments. |
| Debug logging | Boolean | Logs affect events and color lookups to the script console |

**Example overrides:**
```
# affect name | up color | down color
sanctuary | {G | {R
haste | {B | {Y
```

**Notes:**
- Output format: `<color>affect name{x up` when gained, `<color>affect name{x down` when lost.
- Matching against overrides is case-insensitive on the affect name from the `game:affect-added`/`game:affect-removed` event payload.

---

## Quest Bot

**Purpose:** Automates the full quest cycle: runs an optional start alias, walks to the quest master, requests a quest, parses the assignment, navigates to the area, collects the item, turns it in, optionally buys a gem (and, above a QP threshold, an egg), rests, and repeats. Stops automatically on combat and can auto-resume once it clears. Per-quest and per-area stats are tracked in IndexedDB. Adapted from QuestBot.lua.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Home location | Select | Your clan hall (Wargar, Thaxanos, Shadow/New Thalos, Darkonin, or Verminasia). Determines which navigation paths are used to reach the quest master. |
| Beeswax earplugs container | String | Container holding your beeswax earplugs (e.g. `shelf`). If set, retrieved before each cycle and returned after resting. |
| Gem pouch | String | Where to put the blue gem after buying. Leave blank to skip the put command. |
| Gem buy gold threshold | String | Minimum gold to trigger the post-turn-in gem merchant step. `0` always visits (when a gem-merchant path exists for your home location). Default `600`. |
| Start alias | String | Alias to run before each quest cycle (e.g. `buff`). Leave blank to skip. |
| Auto-restart | Boolean | Automatically request the next quest when `You can now quest again.` appears. |
| Refresh command | String | Command to restore movement after recalling, sent twice when moves are at or below one third of max. Default `cast refresh`. |
| Egg buy QP threshold | String | Auto-runs `pq buy egg` at the quest master once quest points reach this value. `0` or blank disables it. |
| Egg container | String | Where to put the egg after buying. Falls back to the gem pouch if left blank. |
| Custom areas (JSON) | Textarea | JSON array of additional quest areas — see below. Custom entries override built-ins with the same name. |
| Debug logging | Boolean | Prints each navigation step and state transition to the terminal. |

**Command bar commands:**

| Command | Description |
|---|---|
| `pq start` | Enable the bot. Runs the start alias, then walks to the quest master. |
| `pq stop` | Stop the bot and reset all state, cancelling any pending combat-resume timer. |
| `pq status` | Print current state: running flag, phase, captured item, area, and room. |
| `pq debug` | Toggle step-by-step navigation and state-change logging to the terminal. |
| `pq areas` | List all known areas (built-in and custom) with their start point and room names. |
| `pq stats` | Print current session, all-time, and per-area stats. |
| `pq stats reset` | Wipe all stored stats and start fresh. |

**Combat break and resume:** GMCP `is_fighting: true` stops the bot immediately. Once fighting clears, a 30-second resume timer starts; typing `flee` during combat cancels it and leaves the bot stopped. Otherwise the bot resumes based on what it was doing when combat began — resuming a turn-in, re-sending remaining comb steps, or recalling and re-navigating to the quest area.

**Supported built-in areas:** Gahboom Hill, Elemental Planes, Hell, Silversand Garrison, Ghost Lake, A Lost Catacomb, Forbidden Forest, A Blazing Aurora, Jovar. Add more via the Custom Areas config field:

```
[
  {
    "name": "my new area",
    "startPoint": "icewall_port",
    "startToArea": ["n", "n", "e"],
    "rooms": {
      "a dark cave": ["w", "w", "s"]
    }
  }
]
```

Valid `startPoint` values: `justice_bind` (Arkane justice bind point), `icewall_port` (Icewall ship portal), `alth_port` (Althainia ship portal), `alth_arena` (Althainia via gaming portal), `tropica_port` (Tropica ship portal), `succubus` (`c gate bloody nose` gate).

---

## Voice Dictation

**Purpose:** Speech-to-text dictation into the play/command input and/or any other focused page text field. Choose the browser's built-in Web Speech API, or an optional downloadable advanced engine (wav2vec2 — a literal, non-generative acoustic model: no translation, no invented punctuation/wording, runs entirely in-browser and works offline once downloaded), plus language, custom vocabulary correction, and which of the two dictation targets are active.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Recognition engine | Select | Browser (built-in) or Advanced (downloaded wav2vec2 model) |
| Language | Select | Used by the Browser engine; the Advanced engine only supports English models |
| Custom language code (BCP-47) | String | Only used when Language is set to "Other" (e.g. `pt-BR`) |
| Advanced engine model | Select | wav2vec2 Base (faster, smaller) or Large (more accurate) — used when engine is Advanced |
| Custom vocabulary | Textarea | One MUD-specific word per line, applied as a fuzzy correction pass on transcribed text (single-word matching only) |
| Dictate into the play area | Boolean | Restores the mic button in the command bar; only the play/command input |
| Dictate into page items | Boolean | Adds a floating mic button that dictates into whatever text field is focused; everything except the command input |
| Debug logging | Boolean | Logs engine load/download/update progress and recognition start/stop/errors |

**Actions:**

| Action | Description |
|---|---|
| Apply engine settings | Click after changing engine, language, or model — not applied live otherwise |
| Download advanced model | Downloads (or reuses) the selected advanced model |
| Check for engine update | Checks for and redownloads a newer version of the advanced model if known |
| Apply target settings | Click after toggling the two dictation targets above — not applied live otherwise |

**Notes:**
- Text dictated into the command input has trailing sentence punctuation stripped (periods, commas, etc.) so it doesn't corrupt exact MUD command syntax; page-item dictation keeps natural punctuation.
- Click a mic button to start, click it again to stop and transcribe.

---

## Text to Speech

**Purpose:** Reads text aloud using the browser's built-in speech synthesis. Two independent targets: auto-reading incoming play-area lines as they arrive, and an on-demand floating button that reads whatever text is currently selected or focused elsewhere on the page.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Read the play area aloud | Boolean | Auto-reads incoming game lines as they arrive |
| Read page items aloud | Boolean | Floating button reads selected text (or the focused field) on click |
| Announce your health changes | Boolean | Speaks an alert when your HP crosses into a new condition tier (numeric estimate) |
| Announce enemy health changes | Boolean | Speaks an alert when the current opponent's condition tier changes |
| Announce game ticks | Boolean | Speaks "Tick." on each server tick event |
| Include the time in tick alerts | Boolean | Adds the in-game time to the tick alert |
| Speak exploration lines | Boolean | Room names, descriptions, and contents |
| Speak battle lines | Boolean | Combat via a "game caster" pipeline — afflictions, status effects, stuns, disarms, deaths, flees; drops plain damage/avoidance/movement/item-use/cast-flavor/weapon-flag-procs as noise |
| Speak communication lines | Boolean | Chat channels — say, tell, gtell, whisper, pray, yell, gossip, OOC, clan, king, etc. |
| Speak incidental lines | Boolean | Catch-all: ambient flavor, skill improvements, level-ups, quest text, and anything matching none of the three categories above |
| Arena caster (overrides the switches above) | Boolean | Exclusive Coliseum/Bloodbath spectator-or-participant mode that replaces the four switches above entirely while on |
| Announce afflictions on others | Boolean | Short callout when a fight-changing debuff/knockdown lands on someone else |
| Announce buffs on others | Boolean | Short callout when a fight-changing buff lands on someone else |
| Announce when you're stunned | Boolean | Speaks "Alert: You are stunned!" on a confirmed self-stun (bash, trip) |
| Voice | Select | Installed system voice, labeled by language |
| Rate | Number | Speaking speed, 0.5–2 |
| Pitch | Number | 0–2 |
| Volume | Number | 0–1 |
| Include patterns (play area) | Textarea | Only read lines matching at least one pattern (plain text or regex, case-insensitive) |
| Exclude patterns (play area) | Textarea | Never read lines matching any pattern; exclusions always win over includes |
| Skip prompt/status lines | Boolean | Detects and skips your PROMPT/status line regardless of its exact token format |
| Max queued lines | Number | Drops the oldest queued (not currently speaking) line once this cap is exceeded |
| Line grouping window (ms) | Number | Lines arriving within this window of each other are combined into one utterance |
| Utterance start delay (ms) | Number | Small delay before each utterance starts, working around a Chrome/Edge bug that clips the first word |
| Long-utterance keepalive | Boolean | Keeps long utterances (e.g. room descriptions) from being cut off around 15 seconds |
| Silence after unspeakable commands | Boolean | Briefly stops reading after a command whose output is layout, not words (a map, a table) |
| Commands that silence speech | Textarea | One command per line (plain text or regex, matched against your whole input) that triggers the silence above |
| Silence duration (ms) | Number | How long speech stays off after a matching command |
| Debug logging | Boolean | Logs which lines get queued/skipped |

**Actions:**

| Action | Description |
|---|---|
| Apply target settings | Click after toggling the play-area/page-item targets — not applied live otherwise |
| List voices | Forces the browser to report installed voices; close and reopen the config dialog afterward to refresh the Voice dropdown |
| Stop speaking | Cancels current speech and clears the queue |

**Notes:**
- The Arena caster mode is exclusive, not additive — while it's on, the four Speak … category switches above do nothing (Arena bypasses that filtering chain entirely).
- Combat-related filtering (Speak battle lines, Announce afflictions/buffs on others) reuses Combat Compression's and Weapon Flag Squelch's verified line patterns.
- Skip prompt/status lines works without knowing your exact `PROMPT` format — it looks for the vitals cluster (hp packed with mana and/or moves) every prompt shares, rather than matching one literal string.
- The plugin observes outgoing commands (for the command-silence feature) but never consumes them, and only sees a command if no user-script alias claimed it first.

---

## Tick Warning

**Purpose:** Writes a colored warning into the terminal a few seconds before the next game tick. Defaults to "Tick in 5 seconds!" in light red; threshold, message, and color are all configurable.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Warn at (seconds before tick) | Number | Whole seconds remaining when the warning appears (1–40). Takes effect from the next tick. |
| Warning message | String | Text to show. `{seconds}` is replaced with the threshold. DSL color codes are allowed; a blank message uses the default. |
| Warning color | Select | DSL color applied to the whole message. |

**Notes:**
- The tick length is fixed at 41 seconds (matching the HUD countdown badge), so the maximum threshold is 40.
- The plugin keeps its own one-shot timer, re-armed on every `game:tick` event, rather than reading the HUD's tick store — so it fires whether or not any HUD component showing the countdown is mounted.
- The timer fires at the same instant the HUD countdown badge would show the same number of seconds remaining, so the two stay in sync.
- Disarmed on `game:remote-server:close`.

---

## Comparison: plugins vs. scripts

| | Scripts | Plugins |
|---|---|---|
| **Who writes the code?** | You | Pre-built |
| **Where to manage** | Game → Script Sandbox | Plugins → Manage Plugins |
| **Flexibility** | Unlimited | Limited to plugin options |
| **Setup effort** | Higher | Low (configure and enable) |

---

## See also

- [Scripting Summary](scripting-summary.md)
- [Script Samples](script-samples/)
- [JavaScript Scripting Reference](javascript.md)
