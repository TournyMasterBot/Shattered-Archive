# Autopilot (auto-leveling): targets, overrides and cloud sync

Developer notes for the autopilot wizard's data layer in `apps/game-client/src/features/autoleveling/`. The engine
(`autoleveling-engine.ts`) is documented in its own folder index (`.annotated`); this page covers what a player
can change and where it is stored. It grows with the editable-targets work item
(`2026-11-13_editable-autopilot-targets-synced`); sections for phases not yet built are marked.

## Where the data comes from

| Data | Source | Cached in |
|---|---|---|
| Areas (route, level range, `recommendedTargets`) | `GET /api/web/maps/autoleveling/areas[/slug]` (web-server proxy of the C# service) | IndexedDB `shatteredarchive-maps`, keys `autolevelingAreaIndex.v2`, `autolevelingArea.v2:<slug>`, 7-day soft TTL |
| Classes and their abilities (all 48 playable classes) | `GET /api/web/maps/autoleveling/classes` | IndexedDB key `autolevelingClasses.v2` |
| The player's own additions and edits | the browser only, plus the account cloud when saved | IndexedDB `shatteredarchive-autoleveling` / `userData` |

The web-server answers from the C# service and falls back to a bundled snapshot only when that call fails. The
fallback is never cached by browsers (`Cache-Control: no-store`), is announced once per process in the log, and is
visible in the `X-Maps-Source` header (`upstream` is the healthy value). Details: `docs/web-server.md`.

## Records the player owns

One `UserRecord` per item (`autoleveling-user-data.ts`): `id`, `kind`, optional `areaSlug` / `className`, `data`,
`updatedAt` (last writer wins). Seven kinds, listed in `SYNCED_RECORD_KINDS`:

| Kind | Holds |
|---|---|
| `target` | a custom kill target the player added for an area (`lookName`, `engageName`) |
| `targetOverride` | the player's personal edit of a PRE-LOADED area target (below) |
| `buff`, `fight` | the buff checklist per area, the fight commands per area and class |
| `path`, `pref`, `abilityTiming` | custom paths, remembered class/alignment, learned per-ability cooldowns |

`SYNCED_RECORD_KINDS` is a contract with the server's validator (`Server.Dsl/AgentApi/AutolevelUserRecords.cs`,
DSL repo): a kind the server does not list makes the whole Save to cloud fail with a 400. Add a kind in both.

## Overriding a pre-loaded target

The server's list is never modified. A player's correction is a `targetOverride` record:

- id `targetOverride:<areaSlug>:<key>`, so two devices editing the same target write the same record;
- `data` = `{ key, lookName?, engageName?, hidden? }` holding ONLY what differs from the server value;
- `key` is the normalized ORIGINAL room line (lowercase, whitespace collapsed): the match survives a re-ordered list but
  not a renamed room line.

Rules (all in the pure module `autoleveling-target-overrides.ts`, tested in its `.test.ts`):

- An edit that equals the server value is not stored; editing every field back to the default deletes the record
  (`setTargetOverride`). A server fix therefore still reaches every field the player left alone.
- An override whose key is no longer in the area's served list is kept, not applied, and reported as `unmatched`
  by `applyTargetOverrides`; it re-attaches if the key returns. Only the player deletes it
  (`deleteTargetOverride`).
- Reset to default (`resetTargetOverride`) removes the whole record: edit and hidden flag.
- Room line and keyword must be 1-200 characters with no `;`, line break or control character, because they end up in
  `kill {name}` and in the encounter match. `normalizeRecord` enforces this for records arriving from the cloud, the
  server enforces it for `targetOverride`, and the setters enforce it for the editor.

Custom targets: `updateCustomTarget` edits in place (same id); `removeCustomTarget` deletes the record. Before
2026-11-13 the wizard only dropped a removed custom target from its draft, so it reappeared the next time the area was
opened.

### The Targets step (editor)

`components/wizard/TargetsStep.tsx`, driven by `AutoLevelingWizard.tsx` and the draft in `useWizardDraft.ts`.

- On area selection the wizard fetches the served targets, the player's custom targets and the player's overrides, and
  seeds the draft with `applyTargetOverrides` (edited values, `overridden`, `hidden`, the server values kept as
  `defaultLookName` / `defaultEngageName`, `unmatchedOverrides`).
- A row is identified by `targetRowId`: `a:<key>` for a pre-loaded target, `c:<record id>` for the player's own. The room
  line is not an identity because an edit changes it.
- **Edit** (pre-loaded or own): inline room line and kill keyword. The step refuses empty text, over 200 characters,
  `;` or line breaks, and a room line another row (or a hidden row's original line) already uses, before asking the wizard
  to save. The wizard stores an override (`setTargetOverride`) or updates the custom record (`updateCustomTarget`) and
  returns a message if that fails; the editor stays open with it.
- **Hide / Restore** (pre-loaded only): persisted (`hidden: true` in the override). A hidden row is listed under "Hidden by
  you", is never enabled for the engine, and keeps any edit it had.
- **Reset to default**: `resetTargetOverride`, then the row is rebuilt from the server values (not merged).
- The checkbox is the per-run on/off and is not stored. `draftToConfig` hands the engine only enabled rows, with their
  current (possibly edited) room line and keyword (`autoleveling-wizard-config.ts`).
- **Edits that no longer match this area** lists `unmatchedOverrides`; the player deletes them (`deleteTargetOverride`).
- The blue (i) opens `TargetsHelp.tsx`, the end-user text for all of the above.

Tests: `TargetsStep.test.tsx` (the step alone), `useWizardDraft.test.ts`, `AutoLevelingWizard.targets.test.tsx` (the real
wizard on in-memory storage: edit/hide/reset/unmatched/re-attach/own targets/storage failure, closing and reopening), and
the override rules in `autoleveling-target-overrides.test.ts`.

## The Combat step: class list and pre-fill

`components/wizard/CombatStep.tsx`.

- The class picker lists every class in the served catalog (48 playable classes: 5 base, 43 reclasses, base first). If the
  catalog cannot be loaded the step says so and offers only the five-name `DSL_CLASSES_FALLBACK`; it never shows five
  classes silently.
- **Pre-fill** (`autoleveling-class-defaults.ts`): choosing a class fills the buffs and fight commands from the DSL data
  when the player has no saved set. Buffs are the `DEFAULT_BUFF_LABELS` entries (protection and damage: Sanctuary, Armor,
  Shield, Stone Skin, Bless, Frenzy, Haste, Giant Strength, Berserk) that the class has at the character's level, built from
  the log-verified `BUFF_CATALOG` so the command and the GMCP affect are exact. Fight commands are up to three offensive
  abilities at or below the level: the strongest spells and songs first (two, so a hybrid keeps room), then known combat
  skills in `COMBAT_SKILL_NAMES` order; a cooldown the engine already learned for that command is used, else 0. No known level
  means no cap.
- **A saved set always wins.** Buffs are saved per area, fight commands per area and class. The `*OrNull` readers
  (`getBuffOverlayOrNull`, `getFightOverlayOrNull`) tell "never saved" (`null`) from "saved empty" (`[]`); only `null` is
  pre-filled, so a list the player emptied stays empty. Rows already in the draft are never replaced. Pre-filled rows live
  in the draft and are written only when the player first edits one.
- One decision per area and class (`seededFor` ref): on mount for the remembered class, and in `onChangeClass` for a new
  pick (the newest pick wins; buffs follow the new class while none are saved). Unmounting or a newer pick discards a seed
  that is still loading.
- Known limit: about a quarter of the catalog's abilities carry no semantic group, so fighter skill picks lean on the
  known-skill list. The pre-fill is a starting point the player edits.
- **Buffs the class only gets later** are listed too, PAUSED (`BuffRow.disabled`) and with a warning in the buff card: the
  player can apply them another way (a potion, wand or staff) by changing the command and resuming. A buff the class never
  gets is not listed. The warning (`buffAbilityNote` in `CombatStep.tsx`) is computed at render from the catalog and the
  character's level, and only while the row's command is still the verified `cast` command; an unknown level or a command the
  player changed shows none. Paused buffs reach neither `steps.start.pre` nor `criticalBuffs` (`draftToConfig`).
- **Pause a fight command** (`FightRow.disabled`): the row stays in the list and in storage with its cooldown, gates and
  order, but `draftToConfig` leaves it out of `steps.fight.exec`, so the engine never sends it. Resume deletes the key, so a
  resumed row is stored exactly like one never paused. The flag lives in the `fight` record, so it syncs with Save to cloud
  (the server does not look inside a fight record's data). The Review step shows it as paused. Buffs have no pause yet.
- The blue (i) opens `CombatHelp.tsx`, the end-user text.

Tests: `autoleveling-class-defaults.test.ts` (rules), `CombatStep.prefill.test.tsx` (seeding, saved-wins, class pick and
race, list, notice, help), `autoleveling-user-data.test.ts` (the `OrNull` readers).

## Cloud sync

Manual, through the account modal's Save to cloud / Load from cloud (`useAccountModal.ts`, `cloudSync.ts`,
`/api/user-content/autoleveling`, whole-collection PUT, 1000 records at most). See `docs/game/user-account.md`.

- **Save** first reads the cloud copy and merges it into this device with `importRecords` (newest `updatedAt` per
  record wins), then uploads the union (`exportAll`). The server replaces the whole collection, so without that merge a
  device that never loaded (the phone, say) would wipe what another device saved (CLOUDSYNC-02). The merge adds and
  updates records; it never deletes: removing a record on one device does not remove it from the cloud.
- A failed or unauthenticated look-ahead stops the save, uploading nothing.
- If the union is over `AUTOLEVEL_MAX_RECORDS` (1000, the server's cap; learned cooldowns, buff and fight lists, custom
  targets and target edits all count) the save stops before any upload, saying so.
- **Load** merges the cloud records into this device the same way and reports how many were target edits.
- `importRecords` skips malformed records (`normalizeRecord`), so one bad record never blocks a load.
- Two devices editing the same target write the same record id; the newer edit wins as a whole record (not field by field).
