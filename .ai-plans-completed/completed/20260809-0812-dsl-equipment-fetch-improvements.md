# Plan: DSL equipment web-fetch — full item coverage + structured flags

Created: 2026-08-09T08:12-05:00 · Workspace: C:\Projects\DSL (equipment fetch/export lives here;
C:\Projects\ShatteredArchive is plan-doc-only for this task)
Status: COMPLETE — all 7 steps done and live-verified 2026-08-09 (see step 6 for the real
before/after numbers from running the job against production).
Task: `FetchDslEquipmentFromWebAdhoc.cs` (via `Server.Dsl.WebProcessor.FetchEquipmentPage`) and
`ExportItemsAdhoc.cs` need to capture ALL items from https://www.dsl-mud.org/algoron/equipment.asp
— including item types and extra-flag data the site has added since the scraper was written — and
fix the aa–zz keyword-search sweep's memory/dedup behavior. Downstream consumer:
`Server.Web.Public/wwwroot/data/items.json` via `ItemsController.cs` / `AllItems.cshtml` /
`_Filters.cshtml`.

## Goal

Every item on the live equipment site ends up in the DB with **correct** classification
(item_type/slot_type/weapon_type/armor_type), and every extra-flag/affect string the site prints
is captured losslessly — including the parts the current parser has always thrown into one opaque
string. The aa–zz search sweep no longer balloons memory before it can dedupe. All of this is
proven against the **real, live site** (fetched HTML saved as fixtures + a real end-to-end run),
not assumed from reading the C# alone.

## What I verified against the live site (not guessed)

I fetched real pages with `curl` (raw HTML, not summarized) rather than the Shattered-AI
browser-test tool — see "Tooling note" below for why. Saved under
`.../scratchpad/dsl-pages/*.html` this session (throwaway; will be re-fetched into a permanent
fixtures folder as part of implementation).

1. **A genuinely new, unscraped category exists: "All Types" (non-material-specific) armor.**
   `equipment.asp` now links `Equipment/all_head.asp`, `all_legs.asp`, `all_arms.asp`,
   `all_hands.asp`, `all_feet.asp`, `all_body.asp` (same 6-slot matrix as
   cloth/leather/studded/chain/plate) **plus** a flat `Equipment/allarmor.asp` ("Non-Material
   Specific Armor"). None of this exists in code today:
   - `FetchEquipmentPage.armorTypeLookup` = `{cloth, leather, studded, chain, plate}` — no `all`.
   - `Constants.DslArmorType` / `DslArmorTypeLessStrict` — no `all` member either.
   - `allarmor.asp`'s table has a column layout the per-slot pages don't: **Name, Level, Armor
     p/b/s/e, Area Found, Worn, Extra Flags** — a `Worn` column (values seen so far: `About`,
     `Neck`, `Hands`; full vocabulary needs enumerating during implementation) that must drive
     per-row `slot_type` instead of one static injected tag, since this one page spans every
     armor slot.
   - Practical effect today: these items are **not necessarily missing** from the DB (the aa–zz
     keyword sweep likely already nets most of them by name/keyword), but they get **no
     armor_type/slot_type backfill** because `FetchItemsFromEquipmentList`'s
     `fetchedItemsFromEquipmentList` lookup table never enumerates the "all" category — so they
     land with `ArmorType=null`, `SlotType=null`, and group under a generic bucket in
     `ItemsController.ResolveGroupHeader` instead of their real slot. This is my best read of the
     user's "new item types we are not tracking."

2. **Nothing else changed shape.** I diffed column headers on a known-good page (`cloth_head.asp`)
   against `all_head.asp` (identical: Name/Level/PBSE/AreaFound/ExtraFlags) and on `daggers.asp`
   against the aa–zz search endpoint (`keyword_items.asp`, live POST) — both match exactly what
   `FetchEquipmentPage.cs` already parses (`Name, Level, Armorp/b/s/e, Avg Dam, Area Found, Item
   Type, Extra Flags, Spell Level, Spell 1, Spell 2, Spell 3` for search;
   `Name, Level, Avg Dam, Area Found, Extra Flags, Dam Type` for weapon-type pages). Also
   confirmed `Constants.DslDamageType` (38 values) and `DslWeaponType` (11) already match the
   site's full damage-type and weapon-type vocabulary 1:1 — **no new weapon types or damage types
   exist**, despite the site also exposing `dtypeweapons.asp?dtype=X` / `weaponflags.asp?flag=X`
   cross-cut index pages (see open decision B).

3. **The "Extra Flags" column has always been two things glued into one string — for every item,
   not just new ones.** Real cells look like:
   `Magic, Nodrop | -16 Dexterity`, `Noremove, Vis_death, Nolocate, Melt_drop | 1 Damroll`,
   `Glow, Burn_proof | 30 Mana, -1 Saves, 4 Wisdom`. I found this pipe-delimited
   `<keyword flags> | <stat affects>` format on **every page type checked**, including
   `cloth_head.asp` (already scraped today) and the standard aa–zz search results — it is not
   confined to the new categories. `FetchEquipmentPage.cs` stores the whole string verbatim into
   `DslItem.ExtraFlags` with no split, for the entire existing dataset. This is almost certainly
   the core of "additional extra flags and information the job is not fully fetching properly" —
   the affects have always been present in the raw HTML, just never structured. Note the separate
   "Shattered Archive Web Client" identify-import path (`ShatteredArchiveItemImport` in
   `ExportItemsAdhoc.cs`) already models `Affects[]`/`WeaponFlags[]`/`OtherFlags[]` as distinct
   arrays — the web scraper is the one source still flattening them.

4. **Memory/dedup complaint confirmed at the code level.**
   `FetchEquipmentPage.FetchSearchItems` (`FetchEquipmentPage.cs:107-154`) loops all 676 `aa`–`zz`
   pairs and does `items.AddRange(results)` into one unbounded in-memory `List<ExpandoObject>` for
   the *entire* sweep, serializing/writing only once at the end. The per-row `Key` hash (SHA-256
   of the serialized row) is deterministic for identical row content, so `DeduplicateSearchItems`'
   final `purgeDupes` dictionary dedupes correctly by the time it runs — but nothing dedupes
   **during** the sweep, so peak memory holds up to 676 result sets (with heavy overlap, since a
   popular substring like "an" alone returned 2MB/~thousands of rows) before the one true-up pass.
   Fix: dedupe incrementally as each keyword's page comes back.

## Tooling note — why not the Shattered-AI browser-test tool

`Shattered-AI/tools/browser-test/lib/browser.mjs:31-42` hard-allowlists navigation to
`localhost`/`127.0.0.1` and `*.shatteredarchive.{com,dev}` only, and explicitly throws on anything
else ("this driver only allows ... the user's own deployed environments. No other host is ever
allowed.") — `dsl-mud.org` is a third-party site, so that tool refuses it by design. That's a
shared security boundary other work relies on; I didn't loosen it for this task. It also wouldn't
help here: the live pages are classic server-rendered ASP — `curl` alone returns fully-populated
tables with no JS involved, which is exactly what `FetchEquipmentPage.cs` already assumes
(`HttpClient` + `HtmlAgilityPack`, no headless browser). Verification and the new automated tests
should follow that same shape: real HTTP fetch + HTML parse, not Playwright.

There is currently **no xunit test project** for `Server.Jobs`/`Server.Dsl` (only a `DamageTester`
console tool). `FetchEquipmentPage.cs` even has a dead commented-out line pointing at
`MockData/TestDaggers.html`, which doesn't exist on disk today — a fixture-based test was
apparently planned once and never landed. See open decision D.

## Open decisions — RESOLVED 2026-08-09

**A. Where do parsed stat affects live on `DslItem`? → Additive.** New `Affects` field parsed from
the text after ` | `; `ExtraFlags` keeps holding the full original string unchanged. Rationale
(user): finding an item is less risky than narrowing an existing filter's meaning for everything
already in production.

**B. Do the redundant cross-cut pages get scraped? → Yes, permanently.** Scrape all of
`dtypeweapons.asp?dtype=X` (38), `weaponflags.asp?flag=X` (9), and the 13 stat-bonus pages
(`hitroll`/`ac`/`damroll`/`str`/`saves`/`dex`/`hitdam`/`wis`/`hitdamsaves`/`int`/`const`/`hp`/
`mana`) as real, ongoing sources — not just a one-off audit. User's framing: "we are looking for
anything that might be surfaced only on those pages or any additional information possible to be
found... as accurate in our categorization of items as possible for what they are, and what slot
they go in, how they exist." So these feed BOTH (i) classification accuracy — e.g. `weaponflags`/
`dtypeweapons` carry real `Weapon Type`/`Dam Type` columns directly, usable to cross-check/backfill
instead of only trusting the per-category injected tag — and (ii) a genuine supplementary
item-discovery pass, in case the aa–zz keyword sweep misses something these catch.

**C. Confirm the dedup fix target. → Incremental dedup is fine, scoped precisely.** The fix targets
ONLY the in-memory blow-up from re-scanning the same items across many 2-letter keyword hits — it
must NOT collapse items that happen to share a name (even within the same area). User's example:
some creatures spawn with a strictly better version of a same-named weapon, and those stat
differences are real data, not noise — every such variant must survive as its own item, listed
under whichever area(s) it's actually found in. Concretely: the incremental merge keys on the
**exact same full-row hash** already used for `Key` today (identical Name+Level+PBSE+AvgDam+
AreaFound+ItemType+ExtraFlags+spell fields) — the same notion of "duplicate" the code already
applies at the end, just applied incrementally as each keyword's page comes back instead of after
accumulating all 676 result sets. The later `SortHash`-based pass (which intentionally merges the
same item found across *different* areas into one entry with multiple `AreaFound` values) is
untouched by this — it doesn't include `AreaFound` in its hash by design, and already separates
items whose stats genuinely differ. One related latent issue surfaced while tracing this: that
`SortHash` pass backfills `DamageType` by taking the *first* matching category-page item for a
given Name+AreaFound (`FirstOrDefault`) — if two same-name-same-area variants ever end up in the
same `SortHash` group (identical level/pbse/avgDam/extraFlags/spells but different Dam Type), one
variant's true damage type could get silently overwritten by the other's. Worth a defensive check
while this code is open, secondary to the main fix.

**D. Testing approach. → Build it, lowest priority.** Confirmed: small `Server.Dsl.Tests` (xunit),
fixture tests against saved real HTML snapshots plus an opt-in (not CI-default) live integration
check. Keep it lean — this is the least important of the five decisions, not the first thing to
polish.

**E. Front-end exposure of the new structured data. → In scope, not dropped.** Sequenced after the
data pipeline is solid, but `_Filters.cshtml`/`AllItems.cshtml`/`ItemsController.cs` MUST actually
get the new `Affects` data surfaced as part of this plan — user's point: the UI is how a user
actually interacts with this data, so it can't be left as an untracked "someday."

## Open decision — historical DB accumulation (found 2026-08-09, not yet resolved)

Every run of `FetchDslEquipmentFromWebAdhoc` this project has ever done is still sitting in
`Server.Database/DSL.sqlite`'s `items` table (`Key = Hash.SortHash`, upsert-only) — nothing has
ever pruned a superseded row, and `ExportItemsAdhoc` exports all of them unfiltered. Since
`Hash`/`SortHash` inputs have drifted across code revisions over the project's life, the same
physical item can have 2+ permanent rows differing only in some now-irrelevant formatting detail
from whatever code wrote each one. Options, not yet chosen:

- **A. Non-destructive, export-time "latest wins among true near-duplicates" (recommended).**
  In `ExportItemsAdhoc`, group by (Name, AreaFound); within a group, if entries share the same
  *meaningful* stats (level/PBSE/avgDam/damageType/extraFlags after normalizing whitespace) — i.e.
  they're the same item, just scraped by different code over time — keep only the one with the
  newest DB `Timestamp`. Entries that genuinely differ in stats (the "creature spawns a better
  weapon variant" case from decision C) are left alone, both survive. The DB itself is untouched —
  lowest risk, reversible, but doesn't shrink the DB or fix the root accumulation.
- **B. DB pruning.** After a successful run, delete rows whose `Timestamp` predates it. Keeps the
  DB itself clean long-term (smaller, faster `ScanItems`), but is destructive and risks losing real
  data if a run partially fails to re-discover something a prior run found (e.g. a transient site
  hiccup, or an item that only surfaces via a page not hit within that run).
- **C. Defer.** Leave it as a known, documented issue for later — the concrete symptom the user
  first flagged (the nbsp-caused "weaponaxe" duplicate) is already fixed; this second cause is
  older and pre-dates this session.

**Decision: A, implemented and verified 2026-08-09.** `ExportItemsAdhoc.cs` now groups scanned DB
items by `(Name, AreaFound)`, then within a group collapses entries sharing a `NearDuplicateFingerprint`
(every scrape-identity field EXCEPT Hash/SortHash/DisplayHash/InternalType — the drift-prone
identity fields — and EXCEPT Weight/Material/Size/Condition, which are "manually appended"
enrichment reapplied after this step regardless of which row wins) down to the newest by DB
`Timestamp`; genuinely different fingerprints (real stat/flag differences) both survive untouched.
The fingerprint's `ItemType` normalization also collapses `"weapon axe"`/`"weaponaxe"` (both the
fixed and the still-present-in-the-DB pre-fix forms — confirmed live for all 9 weapon subtypes:
axe/dagger/exotic/flail/mace/polearm/staff/sword/whip) back to `"weapon"`, so it retroactively
cleans up the OLD tainted rows too, without needing a fresh live fetch. **Result, run against the
existing DB (export-only, no live re-fetch needed): 23,808 → 23,275 (-533).** Spot-checked
"Iceforge" (4→2) and confirmed via the DB's own payloads that the 2 remaining pairs (Iceforge,
"a traveler's pack") differ in `extra_flags` *content*, not formatting — e.g. traveler's pack's
old row has `extra_flags:""`, today's has `extra_flags:"Buried"` — a real difference the design
is meant to preserve, not a bug. `"Travelers pack"` (missing "a"/apostrophe) is a separate,
out-of-scope name-variant issue that Option A's exact-name grouping doesn't touch. Live-verified
in browser: 23,275 rows render, "Iceforge" shows exactly 2. `Server.Dsl.Tests` 18/18 throughout.

- 2026-08-09 (same session, later still) — User follow-up: "/// and 0/0/0 are equivalent as well".
  Verified against the data first (not assumed): 11,174 items with all-null PBSE (from the site's
  "///" placeholder) and 5,008 with all-zero PBSE (from "0/0/0/0") — both mean "no defense," parsed
  to different DslItem representations (null vs `0`) by `FetchEquipmentPage.cs`'s `int.TryParse`
  behavior. Searched the raw DB directly for (Name, AreaFound) groups containing both a null- and a
  zero-PBSE variant: 260 such groups exist. Added `NormPbse(v) => v ?? 0` to
  `NearDuplicateFingerprint`, fingerprint-local only (the stored fields themselves stay null vs 0 —
  other logic like the original `IsEnchantable` formula still depends on that distinction elsewhere
  in the codebase). Investigating the 260 candidate groups surfaced two more real, confirmed
  normalization gaps in the same fingerprint, fixed in the same pass:
  - `IsEnchantable` is itself DERIVED from the pre-normalization null-vs-0 PBSE distinction (see
    `FetchEquipmentPage`'s formula), so comparing it directly silently reintroduced the exact
    mismatch NormPbse was meant to fix (real example: "a small emerald scarab," identical on every
    other field, `is_enchantable` false vs true purely from null-vs-0 PBSE). Removed it from the
    fingerprint entirely — it's fully determined by fields already compared, so it added no
    independent signal.
  - `ExtraFlags` text itself differs by which pipeline touched it: the raw web scrape keeps the
    site's own text ("Rot_death, Melt_drop") while the identify-import merge path runs flags
    through `NormalizeFlag` (strips underscores, capitalizes → "RotDeath, MeltDrop") — same flags,
    different convention, confirmed via a real duplicate ("a small baby"). Added a
    strip-non-alphanumeric-and-lowercase `NormFlags` specifically for the fingerprint's ExtraFlags
    comparison (stored `ExtraFlags` itself is untouched).
  **Result, re-run against the same DB: 23,275 → 23,052 (-223 more).** Spot-verified "a small
  emerald scarab" and "a small baby" both now collapse to a single entry each. `Server.Dsl.Tests`
  18/18 throughout; full solution build 0 errors; `Program.cs` restored both times (twice hit a
  stale IDE-diagnostics false alarm on the restore edit — confirmed spurious via a real
  `dotnet build`, not a real regression, both times).

- 2026-08-09 (same session, later still) — User screenshot flagged two more things: "a blackened
  opal" showing 2 rows, and "Sea Devil Foray" / "Gruntz" appearing self-duplicated inside a single
  row's Area Found ("Sea Devil Foray, Sea Devil Foray"). Checked both against the actual current
  data before touching anything:
  - **"a blackened opal"**: already fixed by the prior fingerprint work — the currently-served
    `items.json` had exactly 1 entry. The screenshot was a stale browser/page-cache view from
    before that fix landed, not a live bug.
  - **The self-duplicated area name was real.** Root cause: `FetchEquipmentPage.cs`'s SortHash
    cross-area merge (`recreateItem.AreaFound = string.Join(", ", locations)`) adds one
    `AreaFound` per grouped row without deduplicating — when 2+ rows in the same SortHash group
    report the *same* area (e.g. the same item found via both the aa-zz sweep and a cross-cut
    page — a direct side effect of this session's cross-cut-page addition), the area got joined
    with itself. Fixed at the source (`locations.Distinct()`) for future live fetches. Since that
    alone doesn't retroactively clean already-corrupted DB rows, also added a normalization pass
    in `ExportItemsAdhoc.cs` (split on comma, trim, distinct, rejoin) applied to every scanned
    item BEFORE the (Name, AreaFound) grouping — fixes the display immediately without needing
    another live fetch, and prevents the corrupted vs. clean text of the same area from splitting
    what should be one grouping key into two.
  **Result: 23,052 → 23,016 (-36).** Verified "a conch shell"/"a jeweled Ankh" now show clean
  `"Sea Devil Foray"`/`"Gruntz"` (not self-joined) — both still correctly show 2 entries each
  since they differ in real `extra_flags` content (`""` vs `"Sell_extract"`), not formatting.
  `Server.Dsl.Tests` 18/18, full solution build 0 errors, `Program.cs` restored (hit the same
  stale-IDE-diagnostics false alarm a third time — confirmed spurious via `dotnet build` again).

- 2026-08-10 — User follow-up, new session: "Constitution and Con are the same thing" (also
  Str/Dex/Wis/Int) causing duplication in the same near-duplicate export path. Verified first:
  `items.json` had e.g. "a Telkec-tegaar razor whip" twice — `"Sharp, -2 Int, 1 Hit, 2 Dam"` vs
  `"Sharp | 2 Damroll, 1 Hitroll, -2 Intelligence"`. Implemented the user's 5 pairs in
  `NearDuplicateFingerprint`'s `NormFlags` (word-boundary label substitution, applied before the
  alphanumeric strip, never touching the signed number in front of a label). Re-ran export against
  the existing DB (no live fetch needed, same as the 2026-08-09 dedup work): 23,016 → 22,951 (-65).
  Spot-checked the razor whip and two more real examples — **2 of 3 still didn't merge**: the
  underlying flags ALSO differ in wording the user didn't list (`Hit`/`Hitroll`, `Dam`/`Damroll`)
  and, independently, in *token order* between source pages (confirmed live:
  `"Glow, Hum, Invis, Nolocate, Burn_proof | Anti-Evil | 2 Hitroll, -1 Saves"` vs
  `"Invisible... 2 Hit, -1 Saves, Glow, Hum, Invis, BurnProof"` — same terms, different
  order/grouping entirely apart from naming). Extended the fix rather than declare it done on an
  incomplete result: added `Hit`/`Hitroll`, `Dam`/`Damroll`, `HP`/`Hit points`, `AC`/`Armor class`,
  `Move`/`Moves` (same root cause, empirically confirmed via real duplicates for each), and
  rewrote `NormFlags` to split into individual tokens, normalize each, and SORT before rejoining —
  making segment order/grouping irrelevant to the fingerprint, comparing only the token *set*.
  Deliberately did NOT add `Invisible`/`Invis` at this point: one real item's flags contained BOTH
  spellings together, so it wasn't a confirmed synonym pair. User then confirmed live it is one
  (plus `Glowing`/`Glow`, verified present in the data — 1 occurrence, "a Bloodshackle satchel").
  Added both, which also required adding `.Distinct()` to the token list (that one item having
  BOTH "Invisible" and "Invis" meant two identical tokens post-normalization, still mismatching
  its counterpart's single "Invis" on token *count* without dedup). User also asked to be told
  about any other similarly-ambiguous pairs found — ran a systematic scan of every remaining
  2-entry near-duplicate group's token-set symmetric difference (findable via a size-1-each-side
  diff): confirmed no other pair recurs 3+ times beyond what's now handled; the handful of 1-2×
  "candidates" left (`magic`/`rot_death`, `bless`/`magic`, `buried`/`magic`, `anti-evil`/`move`,
  `nolocate`/`wisdom`) are coincidental token-count matches between genuinely different flags, not
  label variants — correctly left unmerged. Final re-run: 22,951 → **22,234** (-717 more, -782
  total for this fix). Spot-verified all 3 original examples now collapse to exactly 1 entry each;
  remaining (name, area) groups with >1 entry dropped 2,700 → 2,016 (real content differences,
  matching decision C). `Server.Dsl.Tests` 18/18 throughout; full solution build 0 errors;
  `Program.cs` isolated/restored the same way as 2026-08-09 (confirmed via `dotnet build Server.sln`
  after restore, not just visual inspection).

- 2026-08-10 (same session) — User UI follow-up: "make the filters a bit less noisy at the top...
  include searches inline, under the header... typing it in one box effectively types it in all
  boxes" plus "review filters for grouping into more sensible displays... equipment, with sub
  categories for weapons and armor... similar for consumables and misc." Read the two requests as
  one coherent design (not asked to confirm first, given how concretely both were specified;
  screenshot-verified afterward so it was cheap to redirect if misread): reorganized
  `_Filters.cshtml`'s 21 flat fields into an accordion — **Equipment** (Weapons / Armor
  subsections), **Consumables**, **Misc** — collapsed by default, plus one prominent canonical
  `ItemName` search box at the top and a small synced mirror copy under every
  category/subcategory header; typing in any copy updates `#ItemName` and every other copy via a
  plain input-event listener (no framework). Nothing hidden — same 21 fields, just organized and
  collapsed rather than always-expanded. Live-verified with the browser tool and caught a real bug
  before calling it done: the category bodies used this page's shared `.hide` CSS class (which also
  sets `visibility:hidden`, for the unrelated browse-view group containers) for their default-
  collapsed state, but were toggled open/closed via jQuery `slideToggle()` — which only ever
  animates `display`, never touches `visibility`. Result: every category opened to the correct
  height with genuinely invisible content (confirmed via `getComputedStyle`: `display:block`,
  `visibility:hidden`). Fixed by giving `.filter-category-body` its own default `display:none`
  instead of relying on the shared class, so jQuery's inline `display` toggling is the only thing
  controlling it. Re-verified: Equipment expands showing populated Weapons/Armor fields, typing
  "sigil" in the Weapons mirror correctly syncs to `#ItemName`, the Armor mirror, AND the
  still-collapsed Misc category's mirror, Enter-to-submit from a mirror box returns "Showing 8
  items" (matching the known sigil count), Clear resets everything. Screenshots confirmed the
  collapsed default view is visually uncluttered (3 category buttons + one search box, vs. the
  previous always-expanded 21-field grid).

## Steps

- [x] 1. **Constants + lookup coverage for "All Types" armor.** DONE. Added `All` to
      `Constants.DslArmorType`; added `"all"` to `FetchEquipmentPage.armorTypeLookup` (feeds
      `all_head/legs/arms/hands/feet/body.asp` through the existing generic material×slot loop with
      zero other changes needed — same column shape as the material-specific pages). Added
      `allarmor.asp` to `flatRequest` with a new `wornSlotLookup` mapping its per-row `Worn` column
      (About/Head/Legs/.../Finger) onto the same slot_type strings the rest of the file already
      uses ("About"→"body", matching the existing about.asp convention). Correction from the
      original plan text above: `ExportItemsAdhoc`'s armor-type switch/case turned out to belong to
      a DIFFERENT, unrelated ingestion path (the "Shattered Archive Web Client" identify-import,
      not the equipment.asp web scrape) — left untouched, not in scope here.
- [x] 2. **Cross-cut page coverage (decision B).** DONE. `dtypeweapons.asp?dtype=X` (38, derived
      live from `Constants.DslDamageType` so the two can't drift) and `weaponflags.asp?flag=X` (9)
      feed `FetchItemsFromEquipmentList`'s pool, reading their real per-row `Weapon Type`/`Dam Type`
      columns (added as a fallback alongside the existing injected-tag lookup). The 13 stat-bonus
      pages (hitroll/ac/.../mana) share the aa-zz search table's exact shape, so they feed
      `FetchSearchItems`' pool instead, benefiting from the same dedup as the keyword sweep.
- [x] 3. **Structured affects parsing (decision A).** DONE, but the design changed from the plan:
      real data showed pipe segments aren't reliably "flags | affects" — some rows have 3 segments
      (`"...flags... | Norestring | Vampiric, Stun"`) with ZERO stat affects. Implemented as a
      computed `DslItem.Affects` property (derives from `ExtraFlags` at read time via per-token
      classification — leading signed number = affect, else a flag — rather than position/pipe-
      index), so it's automatically correct for every existing DB record too, not just newly
      fetched ones, and needed no changes at any of the `new DslItem()` call sites.
- [x] 4. **Incremental dedup for the aa–zz sweep (decision C).** DONE. `FetchSearchItems` now
      merges into a `Dictionary<string, ExpandoObject>` keyed by each row's own content hash as
      each keyword/stat page returns, instead of `List.AddRange`-ing all 676+13 result sets first.
      Added the decision-C defensive check: the `DamageType` `FirstOrDefault` backfill (now with
      more candidates thanks to step 2) logs when candidates disagree instead of silently picking
      one. Also fixed two related bugs found while in this code: `internal_type` vs `item_type` key
      mismatch (every flatRequest-sourced item's `ItemType`/`InternalType` in this specific pool was
      silently "unknown"/unset — only mattered for the "item found on a category page but missed by
      search" fallback, but load-bearing now that pool has more entries) and a header-whitespace bug
      (`"Weapon \n\t\tType"` wrapped across source lines didn't match a clean lookup) that would
      have silently broken the new cross-cut pages' native column reads.
- [x] 5. **Fixtures + tests (decision D).** DONE. Extracted the HTML→row parsing out of
      `FetchPage`/`FetchPostPage` into `internal static ParseEquipmentTable` (testable via
      `InternalsVisibleTo`, and de-duplicates what was near-identical copy-pasted logic). New
      `Server.Dsl.Tests` xunit project: 16 tests, all passing — fixture tests against real trimmed
      HTML snapshots (cloth_head/all_head/allarmor/daggers/dtypeweapons_magic/search_sample, each
      with provenance comments) covering the new `all`/`allarmor`/Worn/cross-cut/header-wrap paths,
      plus pure-function `DslItem.Affects` tests, plus one opt-in (`DSL_RUN_LIVE_TESTS=1`, not
      CI-default) live regression test against the real site's category links.
- [x] 6. **Live end-to-end run.** DONE 2026-08-09, user confirmed go-ahead first. Temporarily
      isolated `FetchDslEquipmentFromWebAdhoc.Run()` + `ExportItemsAdhoc.Run()` in
      `Server.Jobs/Program.cs` (commented out the other ~13 unrelated jobs sharing that `Main`,
      restored exactly afterward) and ran it for real against production dsl-mud.org in the
      background (~18 min). Cache files were 9 months stale (Nov 2025) so this was a genuine full
      live fetch, not a cache hit. Results, diffed against the pre-run `items.json` (18,317 items):
      - **23,808 items** written (+5,491, +30%).
      - **The 13 stat-bonus pages alone found 2,128 items the aa-zz keyword sweep never caught**
        (8,633 → 10,761 unique items after adding them) — strong empirical validation of decision
        B; this was not a redundant cross-check, it was real missing coverage.
      - **6,274 items now carry non-empty structured `affects`** — e.g. `"the signet ring of Baaren
        Gaer"`: `extra_flags: "Magic, -1 Saves, 1 Hit, -30 Mana"` → `affects: ["-1 Saves", "1 Hit",
        "-30 Mana"]` (correctly excludes "Magic"). This real row has NO pipe separator at all,
        further confirming the per-token classification design (not a pipe-position split) was the
        right call.
      - **216 items now classified `armor_type: "all"`.**
      - The run's own logging caught a real bug my design hadn't anticipated: 3 items
        (allarmor.asp) have a compound `Worn` cell — `"Shield, No_sac"`, `"Wrist, Hold"`,
        `"Waist, No_sac"` — a qualifier appended after the actual slot with a comma, which
        `wornSlotLookup`'s exact-match missed (logged as "Unmapped 'Worn' value", not silently
        dropped — the defensive logging did its job). Fixed same-day: `FetchItemsFromEquipmentList`
        now takes `Worn.Split(',')[0]` before the lookup. Added a fixture regression test for it
        (`AllArmorPage_WornValueWithQualifier_...`, `Server.Dsl.Tests` now 17/17). Not re-run against
        production again just for this — the fix is committed and will apply on the next real run;
        forcing another 15-20 min live hit to reclassify 3 items wasn't worth it.
      - Full solution (`dotnet build Server.sln`) confirmed 0 errors after the fix + restoring
        `Program.cs`.

- 2026-08-09 (same session, later still) — **Actual browser verification of the UI**, per explicit
  follow-up request ("ensure all items are surfaced"). Launched `Server.Web.Public` locally
  (port 5000 turned out to be occupied by an unrelated WSL relay process, not this project — used
  5050 instead) and drove `/items/all-items` with the Shattered-AI browser-test tool (allowed for
  localhost). Findings:
  - All 23,808 items genuinely render in the DOM — nothing silently dropped between DB → items.json
    → page.
  - **Real bug caught**: the 216 `armor_type="all"` items were grouping under a page header
    literally titled **"all"** (`ItemsController.ResolveGroupHeader` prioritized `armor_type` over
    `slot_type`, and treated "all" like any other real material). Fixed by excluding "all"
    specifically from that priority check, so those items now fall through to their real
    `slot_type` instead — confirmed live: the group list gained `head`/`hands`/`arms`/`legs`/`feet`
    (84 items alone landed in `head`) and lost the "all" bucket, with the total item count
    unchanged (23,808) — a re-group, not a data change.
  - Affects filter re-confirmed interactively (both real keyboard typing and a second `.fill()`
    run): "mana" correctly narrows 23,808 → 1,178, with the "Showing N items" notice and real
    per-row affects data (e.g. "a bar of soap" → "5 mana, 4 wis, 4 int") all rendering correctly.
    (One early `.fill()`-driven attempt showed 0 items filtered — isolated to a same-request
    timing/event artifact on the very first request to a cold server, not a real defect: a direct
    `Filters.Apply()` call and a fresh full run both filtered correctly.)
  - `Server.Dsl.Tests` re-confirmed 17/17 after the fix. Test dev server instance stopped afterward
    (this was a throwaway instance I launched for verification, separate from the original locked
    process from earlier in the session).

- 2026-08-09 (same session, later still) — User spotted real duplication in the rendered UI
  ("Iceforge" x3 in the axe group, "a traveler's pack"/"Travelers pack" x2 in body) and flagged it.
  Traced both to root cause via the live DB (`Server.Database/DSL.sqlite`, a SQLite-backed store
  behind the DynamoDB-shaped API — `items` table keyed by `Hash.SortHash`, upsert-only, nothing
  ever prunes a row once written) rather than guessing:
  - **Root cause 1 (fixed)**: `hitroll.asp`/`damroll.asp` (and presumably the other stat pages)
    print a weapon's Item Type as literally `"weapon&nbsp;axe"`, confirmed against the real site —
    different from the plain `"weapon"` the keyword search table uses for the same item. The
    pre-existing `.Replace("&nbsp;", "")` (used for every scraped cell, not something added this
    session) deletes the entity outright instead of treating it as a separator, producing the
    nonsense `"weaponaxe"` — a different `item_type` than the same item's search-table variant, so
    `SortHash` treated them as different items and both survived. Fixed: `&nbsp;` now becomes a
    real space (still safely trimmed at cell edges), plus a targeted normalization in
    `DeduplicateSearchItems` collapsing any `"weapon <subtype>"` Item Type back to bare `"weapon"`
    (the subtype is already captured separately via `weapon_type`). Added a regression test
    (`NbspAsWordSeparator_...`); `Server.Dsl.Tests` now 18/18.
  - **Root cause 2 (NOT fixed — needs a decision, see below)**: the OTHER duplicates
    (`"a traveler's pack"` x2, `"Travelers pack"`, and the *other* two "Iceforge" variants) are
    NOT from today's run at all — confirmed via the DB's own `Timestamp` column: one row from
    2026-07-14, one from 2026-08-07, one from today. `ExportItemsAdhoc.Run()` does an unfiltered
    `DBManager.ScanItems<ItemModel>()` — every record any historical run ever wrote is still in the
    DB and gets exported, forever, because nothing supersedes or prunes a row once its `Hash.
    SortHash` key stops matching what the current code would compute for "the same" item (which
    has evidently drifted across code revisions over the project's life, well before this session).
    This is very likely the dominant source of visible duplication, more so than root cause 1.
    Needs a scope decision before touching it (destructive DB pruning vs. non-destructive
    latest-wins export filtering vs. something else) — see the open decision below.
- [x] 7. **UI exposure (decision E).** DONE. New `ItemCache.GetItemsByAffects` (mirrors
      `GetItemsByExtraFlags`); `FilterViewModel.Affects` + `ItemsController.cs` filter block (the
      server-side `/items/filter` POST path — note `filters.js`'s `FilterResult` comment says this
      path is "kept for compatibility" and isn't actually what the live UI calls, but kept in sync
      regardless). The REAL UI path is 100% client-side: `_Filters.cshtml` gained an Affects
      textarea, `AllItems.cshtml` gained a `data-affects` row attribute, and `filters.js` gained
      matching Apply()/`_updateUrl()`/`_loadFromUrl()` handling — same semicolon-separated
      "all must be present" convention as the existing Extra Flags field.

## Progress log

- 2026-08-09T08:12 — Plan created from live-site research (real `curl` fetches of
  `equipment.asp`, `mana.asp`, `daggers.asp`, `cloth_head.asp`, `all_head.asp`, `allarmor.asp`,
  `weaponflags.asp?flag=vorpal`, `dtypeweapons.asp?dtype=magic`, and a live `keyword_items.asp`
  POST search) plus full read of `FetchEquipmentPage.cs`, `FetchDslEquipmentFromWebAdhoc.cs`,
  `ExportItemsAdhoc.cs`, `DslItem.cs`, `Constants.cs` enums, `ItemsController.cs`,
  `AllItems.cshtml`, `_Filters.cshtml`, and the Shattered-AI browser-test tool's allowlist. No
  code changed yet — awaiting answers to the open decisions above.
- 2026-08-09 (same session, later) — Decisions A-E resolved by the user; steps 1-5 and 7 implemented
  and verified: full solution (`dotnet build Server.sln`) is 0 errors, `Server.Dsl.Tests` is 16/16
  passing. Files touched: `Server.Core/Constants.cs` (DslArmorType.All), `Server.Dsl/Models/
  DslItem.cs` (computed Affects), `Server.Dsl/WebProcessor/FetchEquipmentPage.cs` (armorTypeLookup,
  wornSlotLookup, DamageTypeLookup/weaponFlagLookup/statBonusLookup, cross-cut fetch loops,
  ParseEquipmentTable extraction, incremental dedup, internal_type/header-whitespace fixes,
  DamageType-ambiguity logging), `Server.Dsl/Cache/ItemCache.cs` (GetItemsByAffects),
  `Server.Web.Public` (`FilterViewModel.cs`, `ItemsController.cs`, `_Filters.cshtml`,
  `AllItems.cshtml`, `wwwroot/js/items/filters.js`), new `Server.Dsl.Tests` project (added to
  `Server.sln`). One environment snag: `Server.Web.Public`'s own build was locked by a running dev
  server (PID 27116) — stopped with the user's explicit go-ahead to complete verification; not
  restarted automatically. Step 6 (the real live run against production dsl-mud.org, which writes
  to the DB) is intentionally not yet executed — needs a explicit go/no-go from the user given its
  size (~850 requests, ~15-20 min) and that it's a write against real data, not just a read.

- 2026-08-10 (new session) — User: "I see jewelry marked as enchantable... trash as enchantable
  too... default to false, only mark confirmed types enchantable." Verified against real data first:
  713/945 jewelry and 1126/1131 trash rows had `is_enchantable: true`. Root cause:
  `FetchEquipmentPage.cs`'s `IsEnchantable` formula (both sites) was `(all 4 PBSE non-null) OR
  (real damage stats)` — a proxy for "this row's source page happened to print PBSE as literal
  zeros," not an enchantability signal; jewelry/trash rows scraped via a path that also defaults
  PBSE to `0/0/0/0` tripped it identically to real armor. Researched what the game ACTUALLY allows
  (not guessed): `Server.Dsl/Spells/EnchantWeapon.cs`/`EnchantArmor.cs` are the real spells (help
  text: "Cloth, leather, and studded leather can be enchanted to 12, chainmail and platemail to
  14"); `EnchantGem.cs` is a SEPARATE, mechanically distinct spell for jewelry (gem→warp-stone),
  confirming jewelry does NOT belong in this flag. `ExportItemsAdhoc.cs`'s separate "bonus items"
  identify-import path already gated `IsEnchantable` on `IsArmor`/`IsWeapon` correctly — independent
  corroboration of the same allowlist. Replaced both formula sites with a `EnchantableItemTypes`
  allowlist (`weapon, armor, cloth, leather, studded, chain, plate` — NOT `jewelry`/`clothing`/
  `"all"`), and added a matching recompute in `ExportItemsAdhoc.cs` (keyed on the already-reliable
  stored `ItemType`) so the fix applies to the existing DB without needing a fresh live fetch.
  Verified: jewelry 0/945, trash 0/1131, weapon 3635/3635, armor-family 3596/3596 enchantable;
  4 stale rows with un-normalized raw `ItemType` ("cloth_armor" etc., pre-dating the 2026-08-09 nbsp
  fix) still correctly enchantable via the separate bonus-items path. `Server.Dsl.Tests` 18/18.

  Same message, second complaint: "a lot of items marked as armor... should prefer relevant
  categories, e.g. a black belt is probably a waist item, an ice bracer is probably a wrist...
  these used to be categorized better... regressed on some of our updates." Verified: 449 armor +
  310 clothing items (759 total) had no `slot_type` at all. **First attempt was wrong** — built a
  ~90-keyword item-name → slot_type matcher in `ExportItemsAdhoc.cs` (e.g. "belt"→waist,
  "bracer"→wrist), taking the user's own examples too literally as an implementation instruction.
  User corrected firmly: *"Don't individually classify each specific item, there are categories
  that come from the DSL site itself, don't be ridiculous."* Fully reverted (deleted
  `WearableItemTypesForSlotInference`/`SlotNameKeywords`/`InferSlotTypeFromName` and their call
  site) and re-investigated from the site's actual structure instead of item text. Confirmed live:
  `equipment.asp`'s nav already links dedicated per-slot pages — `waist.asp`, `wrist.asp`,
  `neck.asp`, `ring.asp`, `shield.asp`, `light.asp`, `held.asp`, `float.asp`, `quivers.asp`,
  `jewelry.asp` — and `FetchEquipmentPage.cs`'s `flatRequest` already fetches ALL of them with a
  directly-injected `slot_type` tag (lines 159-169; my initial grep for the literal filename
  `"waist.asp"` found nothing because the URL is built by string interpolation, which is why I
  briefly misdiagnosed this as missing coverage before finding the real bug). Confirmed live via
  curl that `wrist.asp` genuinely lists "a silver bracer" — in fact **twice**: level 10 in Haven,
  level 44 in Druid Stones and Faerie Rings, two different real items sharing a name across areas.
  That was the actual bug: the aa-zz search-sweep's backfill lookup
  (`fetchedItemsFromEquipmentList[name].First()`, then only applying the backfill if THAT entry's
  area happened to match the current search row) silently dropped slot_type/weapon_type/armor_type/
  consumable_type for every same-named item whose search-row area wasn't whichever variant
  happened to be first in the list — a real regression from when cross-cut/stat-bonus pages started
  adding more same-name-different-area entries to the same lookup pool (2026-08-09 step 2), making
  the "just take index 0" assumption wrong far more often than before. Fixed by searching every
  candidate for one whose area actually matches (`FirstOrDefault(x => x.AreaFound == areaFound)`),
  extracted into a new testable `internal static FindEquipmentListMatch` (mirroring the existing
  `ParseEquipmentTable` extraction pattern) rather than tested via a live-HTTP integration path.
  Added `Server.Dsl.Tests/FindEquipmentListMatchTests.cs` (4 tests, using the real silver-bracer
  scenario as data) — all pass, including the specific "returns the area-matching entry, not just
  the first" case. `Server.Dsl.Tests` 22/22 overall.

  This fix lives in the live-fetch/merge path, not the export path — re-running `ExportItemsAdhoc`
  against the existing DB cannot exercise it (that data predates the fix). Asked the user for
  explicit go-ahead before a live re-fetch (~15-20 min, ~850 requests, writes to the real DB — same
  scope as the 2026-08-09 live run); confirmed. Isolated `Program.cs` to
  `FetchDslEquipmentFromWebAdhoc.Run()` + `ExportItemsAdhoc.Run()` the same way as 2026-08-09,
  running in the background.

  **First live run was a no-op** (completed in <1s): `FetchDslEquipmentFromWebAdhoc.Run()`
  hardcodes `bypassCache: false` on both `FetchSearchItems`/`DeduplicateSearchItems` calls, and the
  2026-08-09 run had just written fresh 30-day caches (`raw_items.json`,
  `equipment_list_from_web.json`) — the 2026-08-09 run only did a genuine fetch because ITS caches
  happened to be 9 months stale, not because caching was actually being bypassed by design.
  Temporarily forced both calls to `true` (same "isolate, run, restore exactly" pattern), confirmed
  live via the console log (item count climbing through the aa-zz sweep, not an instant cache hit),
  re-ran (~15 min, genuine).

  **Still didn't fix the flagship "silver bracer" example.** Traced why: it turned out the
  `FindEquipmentListMatch` fix (in the aa-zz search-row backfill path) never even ran for this item
  — `raw_items.json` (the search sweep's own deduplicated output) has ZERO entries named "a silver
  bracer" despite it existing on wrist.asp/jewelry.asp/allarmor.asp; some category-page items are
  simply never surfaced by any 2-letter keyword. These rely entirely on
  `FetchItemsFromEquipmentList`'s own "Add missing items" fallback loop (added when cross-cut pages
  were introduced 2026-08-09 step 2) — which had the IDENTICAL bug: `!returnItems.Any(x => x.Name ==
  webItem.Name)` checked by name only, so once ANY area-variant of a name was added, every OTHER
  area-variant was silently skipped, never added at all. For names that never hit the search sweep,
  this was the ONLY path that could add them — making it the actual DOMINANT cause of the "lot of
  items marked as armor without a specific slot" report, more so than the search-sweep backfill
  fixed earlier. Fixed the same way: match on `(Name, AreaFound)`. `Server.Dsl.Tests` 22/22
  (unchanged — this fix wasn't independently unit-testable without a bigger extraction than
  justified; verified via the live re-fetch instead, consistent with this project's "verify against
  real data" bar). Re-ran the live fetch (~15 min, genuine, confirmed via log).

  **User, mid-run, independently flagged a separate concern**: "scanning hitdam immediately jumps to
  [a big number]... this kind of persists... raw_items.json (10,761) to items.json (22,348) is a
  leap — is there a dedup issue?" Verified rather than dismissed: the aa-zz→stat-pages growth
  (8,633→10,761, stat pages contributing +2,128) matches the ALREADY-documented 2026-08-09 finding
  almost exactly (same magnitude, previously verified as real missing coverage, not new) — reported
  that back with the exact historical numbers. The raw→items.json jump was legitimately worth
  investigating further, and directly intersected with what was already being traced: 22,348 total
  items includes the FULL historical DB (every past run, upsert-only, nothing pruned — the
  already-documented "historical DB accumulation" open issue) PLUS `fetchedItemsFromEquipmentList`'s
  own entries added via "Add missing items" (now correctly finding more area-variants after the fix
  above) PLUS, it turned out, a NEW class of false near-duplicate the day's own fixes had just
  exposed.

  **Third bug, found by directly querying the fresh DB rather than assuming the first two fixes were
  sufficient**: grouped every (Name, AreaFound) pair with >1 entry and split by whether their
  identity fields (level/PBSE/damage/ExtraFlags) also matched — 52 groups had IDENTICAL stats but
  DIFFERENT slot_type/item_type (e.g. "a silver dagger" in Graveyard: one row `slot=null,
  item_type="weapondagger"` — an OLD row in the pre-2026-08-09-nbsp-fix format — sitting alongside a
  NEW row `slot="wield", item_type="weapon"`). Root cause: `NearDuplicateFingerprint` (the
  export-time near-duplicate collapse from 2026-08-09) still included `SlotType`/`WeaponType`/
  `ArmorType`/`ConsumableCategory` — fields the SAME fingerprint mechanism already has precedent for
  excluding when they're scraper-quality-driven rather than identity-driven (the existing
  `normalizedItemType.StartsWith("weapon")` collapse, and Weight/Material/Size/Condition already
  excluded as "enrichment reapplied regardless of which row wins"). Removed all four fields from the
  fingerprint with an explanation citing today's own evidence. Re-verified via `ExportItemsAdhoc`
  alone (export-time fix — no live re-fetch needed to test, much faster iteration): 22,348→22,327,
  barely moved. The "silver dagger" case now correctly collapsed to one row; "silver bracer" still
  didn't. Diffed its full JSON field-by-field: `is_equipment_list_visible` was `false` on the old row
  vs `true` on the new — still literally in the fingerprint's field list, and it's the SAME drift
  class (it's "did the backfill find a category-page match," a direct side effect of the exact bugs
  fixed today, not a genuine item property). Removed it too. Re-ran export: 22,327→22,204.
  Classification-drift groups: 52→24. "Silver dagger" fully collapsed; "still-unslotted armor/
  clothing" 759→680 (some items were ALSO gaining a slot for the first time this round, not just
  duplicates collapsing).

  **"Silver bracer" (Druid Stones, L44) STILL didn't collapse even after all of the above** — diffed
  its two remaining rows field-by-field one more time: `extra_flags` genuinely differ in CONTENT
  ("NoLocate, 1 Hit, 2 Dam" vs "Glow, Nolocate | 2 Damroll, 1 Hitroll" — one row is missing a real
  "Glow" flag the other has). This item is listed on BOTH wrist.asp and allarmor.asp, and the two
  site pages evidently report slightly different flag text for what's presumably the same physical
  item — a genuine SOURCE-DATA inconsistency across pages, not a scraper bug, and NOT something to
  force-collapse: doing so would risk exactly what decision C already warned against (silently
  merging items that have a real difference). Deliberately stopped here rather than also excluding
  ExtraFlags from the fingerprint, which would be a much blunter, riskier change with no comparably
  strong justification. Checked whether the remaining 680 unslotted items are a further bug or a
  genuine limit: 677/680 have `is_equipment_list_visible: false` — never matched by ANY scraped
  source at all (the site simply has no dedicated category page for many wearables — "a man's
  smoking jacket," "a lace veil," etc. — only the generic aa-zz search finds them, which carries no
  slot detail). This is a real site-data ceiling, not a code bug, and not fixable without the
  name-based guessing the user already explicitly vetoed. The other 3 (matched but still no slot)
  weren't individually chased further — diminishing returns at this point.

  Restored `Program.cs` and `FetchDslEquipmentFromWebAdhoc.cs`'s `bypassCache` args to their exact
  original state (confirmed via `git diff`, byte-identical). Full solution build 0 errors,
  `Server.Dsl.Tests` 22/22 throughout every step above.

  **Net result across the whole categorization thread**: 3 real bugs fixed (2 backfill-matching
  bugs sharing one root cause — by-name-only instead of by-name-and-area; 1 export-time
  near-duplicate fingerprint gap). Verified end-to-end against the real live site, not assumed.
  `is_enchantable` false-positives on jewelry/trash: fully eliminated (0/945, 0/1131). Armor/clothing
  items missing a slot: 759→680 (~10%), with the remaining gap now precisely characterized as a
  genuine site-data limitation rather than an open question. Classification-drift false
  near-duplicates: 52→24, with the residual cases identified as real source-data inconsistency
  rather than a bug to chase further.
