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

**Purpose:** Automates potion brewing with a letter-map shorthand and named recipes. Intercepts the `brew`, `showbrews`, and `showletters` commands in the command bar.

**Configuration:**

| Field | Type | Description |
|---|---|---|
| Letter map | Textarea | One mapping per line: `LETTER = item name`. Lines starting with `#` are comments. |
| Recipes | Textarea | One recipe per line: `name = token token …`. Lines starting with `#` are comments. |
| Storage container | String | Where items are fetched from (default: `shelf`) |
| Debug logging | Boolean | Logs recipe execution to the script console |

**Letter map format:**
```
# Map a single uppercase letter to an item name
C = cologne
S = ill shard
K = continual light
P = pinch of powder
V = vial of water
```

**Recipe format:**

Tokens can be:
- A single letter (`C`, `S`) → resolved via the letter map
- A quoted item name (`'ill shard'`)
- A quantity prefix + letter (`2xS`, `3xC`)
- A quantity prefix + quoted name (`2x'ill shard'`)

```
# Recipes
health = 2xS C P V
light  = 2x'ill shard' K
buff   = C S P
```

**Command bar commands:**

| Command | Description |
|---|---|
| `brew <name>` | Execute a saved recipe (fetches all ingredients to the cauldron) |
| `showbrews` | List all saved recipes |
| `showletters` | List all letter-to-item mappings |

**What the plugin does per ingredient:**
1. `get '<item>' <storage>` — retrieves the item from your storage container
2. `put '<item>' cauldron` — places it in the cauldron

The sequence repeats for each token in the recipe, respecting quantity prefixes.

**Notes:**
- If a letter in a recipe has no entry in the letter map, that token is skipped and a warning is logged.
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

**Notes:**
- Detects both standard who-list format (`[25 H-Elf Mage] (NT) Name`) and who craft output.
- Player data persists in `localStorage` indefinitely — the database grows over time.

---

## Highlighter

**Purpose:** Colors player names by organization as they appear in who lists, farsight, scan, and gossip lines. Clan members are colored by clan (e.g. Wargar → cyan, Slayers → yellow). Kingdom members show with a cyan org prefix. **Requires the People plugin to be enabled.** Replaces `DSL_PNP_Highlighter` and `DSL_PNP_Highlighter.custom`.

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
^[\w']+ clan gossips '.*'$ | line
```

Use **Sync Rules** in the config panel to apply edits without restarting the plugin.

**Status and team aliases:**

| Command | Description |
|---|---|
| `set status <name>` | Toggle a player between enemy (`*` suffix) and neutral |
| `set status <name> enemy\|neutral\|ally` | Set status explicitly. Allies show a `+` suffix. |
| `set team <name> <tag>` | Assign a team label shown before the name. Use `none` to clear. |

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
