# Scope: Editable pre-loaded autopilot mob targets, personal to the user and synced web and mobile

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ a565d53 (working tree has uncommitted changes) · Date: 2026-11-13
Data classification of this work: Personal (stored per account; see Data touched) (rules: docs/standards/data-classification.md, DRAFT — owner to confirm)

## What the work is

Let a player correct the pre-loaded (area) mob targets as their own personal preference, stored as an override layer on top of
the server's list, and carry those edits between web and mobile through the existing manual Save/Load-to-cloud buttons. The
mobile app has no autopilot today, so mobile is a port inside this item, started after the web side is finished. Added by the
owner on 2026-11-13 (recorded in item.md): the wizard must offer the complete class list, and the combat and buff abilities
should come pre-populated from the DSL data already imported.

## Affected areas

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| game-client autoleveling user data | Record store (`UserRecordKind`, `exportAll`, `importRecords`); an override record kind would live here | change | `apps/game-client/src/features/autoleveling/autoleveling-user-data.ts:21,125,131` |
| game-client wizard seeding | Area targets are seeded as `origin: 'area'`, custom ones as `origin: 'custom'` from `getCustomTargets` | change | `apps/game-client/src/components/AutoLevelingWizard.tsx:225-250` |
| game-client Targets step | Area targets can only be toggled; customs can be added or removed, none edited | change | `apps/game-client/src/components/wizard/TargetsStep.tsx:10-60`; `useWizardDraft.ts:12-19` |
| game-client Combat step | Class picker, buff picker, fight picker; today picks are manual | change | `apps/game-client/src/components/wizard/CombatStep.tsx:300-335,412-451` |
| game-client class fallback | Five-name fallback list used when the catalog is empty | change | `apps/game-client/src/components/wizard/dsl-classes.ts:12` |
| game-client cloud sync | Save/Load calls and the account-modal wiring | change | `features/auth/cloudSync.ts:82-91`; `hooks/useAccountModal.ts:154,292` |
| web-server | Serves the class and area catalogs; falls back to an offline snapshot when the upstream call fails | change / config | `apps/web-server/src/index.ts:536-552`; `src/offline/autoleveling/{areas,classes}.json` |
| DSL C# user-content | Server whitelist of autoleveling record kinds and per-record validation | change | `C:/Projects/DSL/Server/Server.Web.Public/Controllers/UserContentController.cs:47,181-215,795-810` |
| DSL C# class catalog | Builds the class list and each ability's `Groups` from the ability taxonomy | none or change | `C:/Projects/DSL/Server/Server.Dsl/Cache/AutoPilotClassCache.cs:67-130` |
| shatteredarchive-mobile (dsl-client) | No autopilot engine, wizard or autoleveling sync today; has scripts/plugin cloud sync and a feature folder list without autoleveling | new | `dsl-client/features/` (analytics, auth, combat, scripts, … none for autoleveling); `dsl-client/features/auth/cloud-sync.ts:33-34,212-215` |
| Copilot (autopilot link) | Sits beside autopilot and reads its signals | check only | `apps/game-client/src/features/copilot/autopilotLink.ts` |

## Stakeholders

- Players who use autopilot on web, and later on mobile: they gain editable targets and a full class list.
- The owner: decides the data class, the server change in the DSL repo, and the mobile hosting approach.
- The DSL C# service (separate repo): its autoleveling endpoint rejects unknown record kinds, so it is involved.
- Mobile app: the existing proposed item `2026-09-12_autoleveling-mobile-port` (never scoped) covers the same port.
- Copilot work (active item `2026-11-05_copilot-ai-training-sibling-to-autopilot`): reads autopilot signals; override data should not break it.
- Docs: no autopilot-named page found under `docs/` by filename (`ls docs | grep -i -E "level|autop|wizard"` returned nothing); end-user audience is players.

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Per-user target overrides (mob room name, kill keyword, hidden flag, keyed to an area target) | Personal (per-account preference; treated as the higher class while unsure) | Write, Store (browser IndexedDB; the account's cloud blob), Send (to and from the user-content endpoint) | New record content in a blob that already stores custom targets; no new storage location on the web side |
| Existing custom targets, buff and fight overlays, prefs, learned cooldowns | Personal | Read, Store, Send | Unchanged in kind |
| Session cookie sent with the sync request | Restricted | Send | Unchanged; not read or stored by this work |
| Class and ability catalog (names, levels, groups) | Public | Read | Fix to source; no handling change |

No new logging of any of the above is implied.

## Inputs for sizing

Not sized: that is for a human.

- Repos touched: 3 (ShatteredArchive, DSL, shatteredarchive-mobile).
- Server whitelist kinds today: 5 (`target, buff, fight, path, pref`) at `UserContentController.cs:47`; client kinds: 6 (adds `abilityTiming`, `autoleveling-user-data.ts:21`).
- Class counts compared on 2026-11-13: C# service direct 48 (43 reclass), none without abilities, includes Avenger and Chaos Weaver (`curl localhost:5000/maps/autoleveling/classes`); what the web client was served 31 (26 reclass), 3 with zero abilities (Enchantor, Jongleur, Mentalist), no Avenger or Chaos Weaver (`curl` of the game-client route; response header `X-Maps-Source: offline`).
- Areas are served from the same offline snapshot (`X-Maps-Source: offline` for `/maps/autoleveling/areas`); snapshot files dated 2026-09-19.
- Existing test files in the touched client paths: 10 (`ls features/autoleveling/*.test.ts components/wizard/*.test.* hooks/useAccountModal*.test.*`); mobile: none for autopilot.
- Mobile feature folders that exist: 12; autopilot-related: 0.
- Unknowns: 7 (below).

## Dependencies and order

1. Class list fix is independent of the override layer and could land first (it is a serving and snapshot problem; see Risks).
2. The override record kind needs a matching change in the DSL C# whitelist before the web client can save it to the cloud.
3. Web phases (overrides, editor, class list, pre-population, sync round trip) are finished and verified before the mobile port starts (owner rule in item.md).
4. The mobile port depends on how mobile hosts the engine, which is undecided; the existing port plan is the starting point.

## Risks and unknowns

- **Why the class list is a subset (code and live checks, 2026-11-13):** the web-server container's `SHATTEREDARCHIVE_BASE` is `http://localhost:5000`; from inside that container "localhost" is the container itself, so the upstream call to the C# service appears not to succeed and the stale 2026-09-19 snapshot is served (`X-Maps-Source: offline`). The wizard's five-name list is a separate fallback for an empty catalog. Whether production is configured the same way was not checked. Response header `Cache-Control: public, max-age=2592000` (30 days) and the client's 7-day IndexedDB cache mean a fix may not show for existing users until caches age out.
- **Existing sync defect (read, not run):** `exportAll()` returns every record including `abilityTiming` (`useAccountModal.ts:154`), and the server rejects any `kind` outside its five (`UserContentController.cs:799-803`). A player with a learned cooldown would likely get a 400 on Save to cloud. Needs confirming with a real call.
- **Sync model:** the server PUT replaces the whole blob (`UserContentController.cs:188-208`); last-writer-wins happens only on the client at import. A device that saves without loading first can overwrite another device's edits.
- **Pre-population source is undecided:** `AutoPilotAbility.Groups` comes from the ability taxonomy and is described by the code as semantic but incomplete for offense (`autoleveling-classes.ts` annotation, `AutoPilotClassCache.cs:12-17`). The ability-classification admin plan (DSL repo, `.ai-plans/20260913-0230-ability-classification-admin.md`, one step left per its header) is meant to replace the client-side guessing. The verified buff list is `BUFF_CATALOG` (`autoleveling-buff-catalog.ts:28`). Not determined: how much of the imported site data covers each class's best combat commands and cooldowns, and whether pre-population may overwrite the player's saved picks (it must not, per the existing per-area, per-class overlays — to be confirmed).
- **Override matching:** how an override stays attached when the server renames or removes an area target is not determined; a wrong choice leaves orphan overrides or silently drops edits.
- **Mobile hosting:** the engine depends on the game client's event bus and plugin system; whether mobile reuses that code or reimplements it was not determined.
- **Copilot link:** whether Copilot reads the target list directly was not traced; only `autopilotLink.ts` was found.
- Data class of overrides is a judgment: they hold game mob names and keywords but are tied to an account; kept at Personal until the owner confirms.

## Out of scope

- Automatic sync (owner chose the manual buttons).
- Editing the server's pre-loaded list itself; changes are per user only.
- Rewriting the ability classification admin system.
- Production deployment of the DSL server change (owner's call).

## Decisions for the human

1. **Class list source.** Options: (a) fix the web-server so it reaches the C# service and also refresh the offline snapshot; (b) refresh the offline snapshot only; (c) fix the web-server only. Consequence: (b) leaves the list stale again at the next game update; (c) leaves the offline fallback old when the C# service is down.
2. **Pre-population source.** Options: (a) seed from the C# ability groups plus the verified `BUFF_CATALOG`, player edits always win; (b) wait for the ability-classification admin to finish and seed from that; (c) seed buffs only, leave combat manual. Consequence: (a) ships sooner but inherits the grouping gaps; (b) depends on the unfinished DSL plan.

## Decisions recorded (owner, 2026-11-13)

1. **Class list source:** fix the web-server upstream so the catalog is live AND regenerate the offline snapshot (classes and areas). Pre-loaded area targets come from the same snapshot, so they are refreshed by the same change.
2. **Pre-population source:** seed buffs and fight commands from the C# ability groups plus the log-verified `BUFF_CATALOG`; anything the player has saved always wins. Not waiting on the ability-classification admin.
