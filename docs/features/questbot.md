# Quest Bot

Automates the full DSL quest cycle for characters based in Wargar, Thaxanos, Shadow, Darkonin, or Verminasia.

## Main quest flow

```mermaid
flowchart TD
    START([pq start]) --> ATTEMPT{"Quest retries exhausted?<br/>(3 consecutive failures)"}
    ATTEMPT -- Yes --> GIVEUP["recall + to_resting_room<br/>stop — use pq start to retry"]
    ATTEMPT -- No --> ALIAS["Run startAlias (if set)"]
    ALIAS --> BEES_GET{"beeContainer set?"}
    BEES_GET -- Yes --> GET_BEES["get bees [container]"]
    BEES_GET -- No --> PQ_CLEAR
    GET_BEES --> PQ_CLEAR[pq clear]
    PQ_CLEAR --> WALK_QM[Walk to_quest_master path]
    WALK_QM --> PQ_REQ[pq request find]
    PQ_REQ --> ITEM["Capture: Vile thieves have stolen..."]
    ITEM --> AREA["Capture: Look in vicinity of area for room"]
    AREA --> GO["May the gods go with you!"]
    GO --> NAV_START[Walk to start_point]
    NAV_START --> NAV_AREA[Walk start_to_area]
    NAV_AREA --> COMB["Comb: get all.keyword + move"]
    COMB --> PICKUP{Item picked up?}
    PICKUP -- No --> COMB
    PICKUP -- Yes --> TILDE["~ + recall"]

    TILDE --> WALK_QM2[Walk quest_master path]
    WALK_QM2 --> PQ_COMP[pq complete]
    PQ_COMP --> GEM_CHECK{"gold ≥ 600 and<br/>gem_merchant set?"}

    GEM_CHECK -- Yes --> GEM_WALK[Walk gem_merchant path]
    GEM_WALK --> GEM_POUCH{"gemPouch set?"}
    GEM_POUCH -- Yes --> PUT_GEM["put blue 'gem pouch'"]
    GEM_POUCH -- No --> RECALL2
    PUT_GEM --> RECALL2[recall]
    GEM_CHECK -- No --> RECALL2

    RECALL2 --> REST_WALK[Walk to_resting_room]
    REST_WALK --> REST_CMD[rest_command]

    REST_CMD --> BEES_PUT{"beeContainer set?"}
    BEES_PUT -- Yes --> PUT_BEES["put bees [container]"]
    BEES_PUT -- No --> AUTO
    PUT_BEES --> AUTO

    AUTO{Auto-restart?}
    AUTO -- No --> IDLE([Idle])
    AUTO -- Yes --> COOLDOWN["You can now quest again."]
    COOLDOWN --> ATTEMPT
```

## Combat break and auto-resume

```mermaid
flowchart TD
    RUNNING([Bot running]) --> GMCP_F{"game:char-data<br/>is_fighting = true?"}
    GMCP_F -- No --> RUNNING
    GMCP_F -- Yes --> STOP["Stop bot<br/>combatBreakPending = true<br/>cancel doAfter timers"]

    STOP --> FLEE{"flee typed<br/>while in combat?"}
    FLEE -- Yes --> CANCELLED(["Stopped — use pq start<br/>combatBreakPending = false"])

    FLEE -- "No — combat ends naturally" --> TIMER[Start 30-second timer]
    TIMER --> RESUME["running = true<br/>Run startAlias<br/>Walk to quest master"]
    RESUME --> RUNNING
```

## AFK timer guard

```mermaid
flowchart TD
    TICK([tickTimers every 250ms]) --> AFK_CHECK{is_afk = true?}
    AFK_CHECK -- Yes --> SKIP[Skip — return early]
    SKIP --> TICK
    AFK_CHECK -- No --> FIRE[Fire due timers]
    FIRE --> TICK

    GMCP_A(["game:char-data"]) --> TRANSITION{is_afk changed?}
    TRANSITION -- "true, was false" --> SUSPEND["setAfkMode true<br/>Write: Timers suspended"]
    TRANSITION -- "false, was true" --> RESUME["setAfkMode false<br/>Write: Timers resumed"]
    TRANSITION -- No change --> NOP([no-op])
```

## Configuration reference

| Field | Default | Purpose |
|-------|---------|---------|
| `homeLocation` | `wargar` | Determines all navigation path arrays used |
| `startAlias` | _(empty)_ | Alias name executed before each quest cycle |
| `beeContainer` | _(empty)_ | Container holding beeswax earplugs (e.g. `shelf`). Picks up at cycle start, returns after resting |
| `gemPouch` | `gem pouch` | Gem pouch to put blue gems into after buying. Leave blank to skip the put step |
| `autoRestart` | `true` | Auto-loop on `You can now quest again.` |
| `debug` | `false` | Log each navigation step and state transition |
| `customAreas` | `[]` | JSON array of additional quest areas |

## Home path keys

| Key | Description |
|-----|-------------|
| `quest_master` | Walk from recall point to the quest master |
| `to_quest_master` | Walk from resting room to quest master (includes `pq request find`) |
| `to_resting_room` | Walk from recall point back to the resting room |
| `rest_command` | Commands to enter rest state (e.g. `rest pew`) |
| `gem_merchant` | Walk from quest master to gem merchant + buy command. Empty = skip step |
| `justice_bind` | Walk to Arkane justice bind point |
| `icewall_port` | Walk to Icewall ship portal |
| `alth_port` | Walk to Althainia ship portal |
| `alth_arena` | Walk to Althainia via gaming portal |
| `tropica_port` | Walk to Tropica ship portal |
| `succubus` | `c gate bloody nose` gate path |
