# Built-in Plugins

Plugins are pre-built automation tools available from **Plugins → Manage Plugins** in the menu bar. Unlike scripts, you don't write any code — just enable the plugin and fill in the settings.

---

## Managing plugins

1. Open **Plugins → Manage Plugins…** from the menu bar.
2. Toggle a plugin on or off with the enable switch.
3. Click **Configure** to open the settings panel for that plugin.

Configuration is stored per-connection in `localStorage` and persists across sessions.

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
