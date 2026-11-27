# Scope: Buff plugin with predefined per-class buff sets and buff<class> commands

Item: item.md · Type: proposal · Scoped against: performance/Allocation-hunt @ f02e9f9 (mobile repo @ f86ba6c, DSL repo @ 706913aa) · Date: 2026-11-26
Data classification of this work: personal (rules: docs/standards/data-classification.md, DRAFT)

## What the work is

A web and mobile plugin with a predefined buff list per class and a `buff<three-letter class code>` command that casts the
buffs not already active. The C# class definitions (and ideally race definitions) carry the who-list codes, so other
scripting can use them too, and the two new classes are added. Each buff can be turned on or off, and the player can add custom buffs on the plugin's
configuration screen. It replaces the hand-written global script, aliases and trigger a player needs today.

## Affected areas

Paths are under `apps/game-client/src/` unless they start with another root.

| Area | Role in the work | Kind | Evidence |
|---|---|---|---|
| Core plugins and registry | The new plugin and its registration | new | `features/plugins/core-plugins/`, `features/plugins/registry.ts` |
| Plugin command hook | A plugin can consume a typed command itself through `onAlias` | consumed as is | `types/types-client/src/plugins/plugin-base.ts:221`, `features/plugins/pluginHost.ts:415`, `features/userScripts/runtimeSingleton.ts:96` |
| Plugin event hook | A plugin can receive the affects list itself through `onEvent`, with no user trigger | consumed as is | `types/types-client/src/plugins/plugin-base.ts:141`, `features/plugins/core-plugins/respell.plugin.ts:187` |
| Plugin configuration screen | Per-class toggles and custom buffs. The screen renders a flat list of five field types: string, number, boolean, select, textarea | change (expected) | `types/types-client/src/plugins/plugin-base.ts:8`, `components/PluginConfigModal.tsx:179` |
| Plugin configuration storage | Holds toggles and custom buffs; stores only values that differ from defaults | consumed, shape matters | `docs/game/plugin-config.md:15`, `features/plugins/pluginConfigOverrides.ts` |
| Cloud sync of plugin configuration | Carries the new settings to the account | consumed as is | `features/auth/cloudSync.ts:102` |
| Buff and class data | Source candidates for the predefined lists | consumed or change | `features/autoleveling/autoleveling-buff-catalog.ts:42`, `features/autoleveling/autoleveling-class-defaults.ts:103`, `features/autoleveling/autoleveling-classes.ts:18`, `apps/web-server/src/offline/autoleveling/classes.json` |
| DSL class definitions and job | Source of the predefined lists and class codes; refreshed by `Server.Jobs -- --classes`; gains two classes | change and new | `DSL/Server/Server.Jobs/Program.cs:56`, `DSL/Server/Server.Dsl/Classes/IClass.cs:12`, `DSL/Server/Server.Dsl/Cache/AutoPilotClassCache.cs:61`, `DSL/Server/Server.Dsl/Models/Autopilot.cs:114` |
| DSL race definitions | Carry their who-list codes (owner: ideally) | change | `DSL/Server/Server.Dsl/Races/` |
| Documentation | Developer doc, player guide, in-app help | new and change | `docs/game/`, `docs/scripting/plugins.md:65`, `components/ScriptingHelpModal.tsx:1057` |
| Mobile app (`shatteredarchive-mobile`) | Has its own plugin host with `onAlias`, and syncs the same plugin configuration | new plugin | `dsl-client/features/scripts/plugin-host.ts`, `dsl-client/features/scripts/plugin-records.ts:100`, `dsl-client/features/auth/cloud-sync.ts` |

## Stakeholders

- **Players (web game client):** use the commands and the configuration screen; some already have their own
  `buff...` aliases.
- **Players (mobile app):** receive synced plugin settings whether or not the app has the plugin.
- **Owner:** decides the scope questions below; supplies or checks class buff knowledge; commits and deploys.
- **DSL repository (C# service):** supplies the class lists and codes.
- **Documentation readers:** players (plugin guide, in-app help) and developers (feature doc).

## Data touched

| Data | Class | Read/Write/Store/Send/Log | Change in handling |
|---|---|---|---|
| Predefined class buff lists | Public | Read | New shipped or served game data |
| The character's active affects | Personal | Read, held in memory | None: the client already reads them for the affects panel |
| Which buffs are on or off | Internal | Write, Store, Send (account sync) | New setting in the existing plugin record |
| Custom buffs (name, command, affect name) | Personal: free text that can hold character names | Write, Store, Send (account sync) | New user-authored content in the existing plugin record |
| Commands sent to the game | Personal (gameplay) | Send | Same as typing them |

## Inputs for sizing

Not sized: that is for a human.

- Repositories: 3 (`ShatteredArchive`, `shatteredarchive-mobile`, `DSL`).
- Classes: 50 on the game site's class page, 48 in the offline class catalog. Missing: Gravebinder (13 arts per its
  preview change note) and Pugilist.
- Race definition files: 35 `.cs` files in `DSL/Server/Server.Dsl/Races/` (not all need be races).
- Abilities the Archive classifies as "Buff": 158 of 708 (`archive_abilities`, category `Buff`). Some newer abilities
  are classified "Unknown" (checked: Umbral Ward, Sanctify), so that category does not list every buff.
- The existing buff catalog has 25 entries. Of the 19 buffs in the hand-written Shadowknight list, 13 are in it and 6
  are not (self projection, dark essence, umbral ward, invisibility, sanctify, dark immunity).
- Per-class leveling defaults already exist: 9 buff labels, filtered by the class's abilities and character level.
- Plugin configuration field types available: 5. None is a group, a repeating row or a per-item toggle list.
- Class code to class name mapping found in the repos searched: none (see *Class codes*).
- Fields the served class data has per ability: name, type, level, groups, duration, lag. It has no buff flag, cast
  command or affect name, and a class has no who-list code.
- New server endpoints or storage keys identified: none; the existing class endpoint would carry new fields.
- Existing test files in the area: 7 (`pluginHost`, `registry`, `normalizePluginModule`, `pluginConfigOverrides`,
  `usePlugins`, `PluginConfigModal`, `autoleveling-class-defaults`). The Auto Respell plugin has none.
- Deploy artifacts: the game-client image; no Dockerfile, compose or nginx change identified.
- Developer doc and player documentation for this feature: neither exists.

## Dependencies and order

- Gravebinder and Pugilist have to be fetched (`Server.Jobs -- --classes --refresh`) and given C# class definitions
  (`DSL/Misc/class-ability-sync/` exists for the clan and special classes).
- The C# class definitions need a who-list code per class, and a way to mark which abilities are buffs with their cast
  command and affect name, before either client can build lists from them.
- The configuration shape must be settled before the screen and storage work, because stored settings are hard to
  reshape once synced.
- The mobile version follows the web version (the project finishes web features before porting).

## Risks and unknowns

- **Command shadowing:** `onAlias` is reached only when no user alias matches. A player's own `buffskn` alias, such as
  the hand-written ones, would run instead of the plugin.
- **Defaults that stop updating:** storage keeps a whole top-level value once it differs from the default. If all
  toggles or all buff lists sit under one key, a later correction to the predefined lists would not reach a player who
  changed anything (`docs/game/plugin-config.md:15`, `:42`).
- **Buffs with no affect** (Sanctify) cannot be detected, so they are cast every time unless handled otherwise.
- **Stale list:** the affects list took over 1 s in 14 of 293 sampled requests, so acting after a fixed delay can use
  old data. A plugin can act when the list event arrives.
- **Observed failure (2026-11-26):** a hand-written version that stored the list through a separate trigger and read it
  after a fixed delay recast 8 buffs the game had just listed as active. The plugin must decide from the list that
  answers its own request, and report which buffs it skipped.
- **Overlap with other casting:** Auto Respell and auto-leveling also cast buffs; running with them could cast twice.
- **Level and learned spells:** GMCP character and login data carry no class, and the plugin would not know which
  buffs the character has learned. World Time & Identity reads class and level from the score sheet.
- **Class definitions are not enough today:** being powered by them depends on the new data above. Whether the pages
  the job reads state any of it was not checked.
- **Offline copy:** `apps/web-server/src/offline/autoleveling/classes.json` is a snapshot and would need refreshing.
- **Predefined list accuracy:** command abbreviations, affect names and class availability for 50 classes are not all
  verified. A wrong affect name means that buff is recast every time.
- **Class codes:** see below. All 50 have a code; 17 are confirmed from logs, the rest rest on the owner's word or a
  name match.
- **Race codes:** who-lines print race tokens of varying length; no race code list was collected.
- **New classes:** Gravebinder is a preview open for testing (change note dated 2026-11-17), so its arts may change.
- **Forms in who-lines** (`Dra`, `Gia`, `Ang`, `Dem`) are not among the 50 classes.
- **Data:** custom buffs are user-authored text that syncs to the account. No change of class compared with other
  plugin settings; nothing new should be logged.
- **Not looked at:** whether plugin-bundled scripts (`features/plugins/pluginScriptRunner.ts:54`) can appear in the
  player's script editor; how the mobile configuration screen renders fields.

## Out of scope

- Casting automatically when a buff drops (Auto Respell does that).
- Group buffs or casting on other characters.
- Potions, scrolls, wands or other item-based buffs, except as a custom command the player enters.
- Hiding the affects list output.
- Changing auto-leveling's own buff handling.

## Decisions for the human

Answered by the owner on 2026-11-26:

1. **How the command works:** the plugin handles `buff<code>` itself; nothing is generated. This replaces the item's
   "generate the appropriate alias/scripts" wording.
2. **Platforms:** web and mobile.
3. **Source of the predefined lists:** the class definitions, refreshed when the C# race/class job is run. The code
   must match the who list, lowercased. Unknown codes are to be raised with the owner now.
4. **Enabled by default:** every buff on.
5. **Codes in the definitions:** the class definitions carry their three-letter codes, and ideally the races carry
   theirs.
6. **New classes:** `Gbd` and `Pug` are brand-new classes that need fetching.

## Class codes

Command = `buff` + the code in lower case.

**Confirmed** (score sheet matched to who-line for the same character and day):
Armsman Arm · Cleric Cle · Crusader Cru · Druid Dru · Enchantor Enc · Illusionist Ill · Mage Mag · Nightshade Nsh ·
Pirate Pir · Ranger Ran · Samurai Sam · Shadowknight Skn · Shaman Sha · Shukenja Shu · Thief Thi · Warlock Wlk ·
Warrior War

**Confirmed by the owner** (2026-11-26):
Assassin Asn · Avenger Avg · Bandit Bnd · Barbarian Bar · Bard Brd · Battlemage Bmg · Battlerager Bat ·
Bladesinger Bla · Brewmaster Brw · Chaos Weaver CWv · Charlatan Cha · Confessor Cfr · Eldritch Eld · Invoker Inv ·
Jongleur Jng · Mentalist Mtl · Monk Mon · Necromancer Nec · Ninja Nin · Ovate Ovt · Paladin Pal · Priest Pri ·
Runesmith Run · Shadowmage Smg · Skald Skd · Swashbuckler Swb · Transmuter Tra · Witch Wit · Wu Jen WuJ ·
Dragonslayer Slr · Anti-Paladin Ant

**New classes, matched by name** (code seen in who-lines, class name on the game site's class page):
Gravebinder Gbd (Bloodlust) · Pugilist Pug (Warrior reclass)
