# Contribute Feature

- [Contribute Feature](#contribute-feature)
  - [Overview](#overview)
  - [Identify (Item Identification)](#identify-item-identification)
    - [Workflow](#workflow)
    - [API: POST /contribute/identify](#api-post-contributeidentify)
  - [Creature Lore](#creature-lore)
    - [Workflow](#workflow-1)
    - [API: POST /contribute/creaturelore](#api-post-contributecreaturelore)
  - [Shared Design Notes](#shared-design-notes)
  - [Server Implementation](#server-implementation)
  - [Client Components](#client-components)
  - [Events Used](#events-used)

---

## Overview

The Contribute feature allows players to submit game data back to the Shattered Archive project. Currently supports two types:

1. **Identify** — submits the output of the `identify` command for an item
2. **Creature Lore** — submits `lore` and `look` output for a creature, tagged to a continent and area

Both features capture live game output by briefly listening to `shatteredarchive:raw-data`, then POST the result to the Shattered Archive Remote Server (`Server.Web.Public`, deployed at `https://shatteredarchive.com`).

Submissions are stored with `status: "pending"` and await moderator review.

---

## Identify (Item Identification)

### Workflow

1. User opens the **Identify** modal (menu bar → Contribute → Identify)
2. User types a **short description** (item name as it appears in inventory, e.g. `sword`)
3. User clicks **Capture** — the modal:
   - Starts listening to `shatteredarchive:raw-data`
   - Sends `c id <short>` to the MUD via `shatteredarchive:send-command`
   - Collects incoming lines for ~1 second
   - Stops when blank lines trail the output (trailing blank + next blank = end of identify block)
4. User reviews captured lines (can delete individual lines)
5. User optionally fills in a **long description**
6. User clicks **Submit** — POSTs to `/contribute/identify`

**Identity requirement:** The character name is read from `window.__SA_IDENTITY__.characterName`, which is populated via GMCP `login_data`. If the character name is not available, submit is blocked.

### API: POST /contribute/identify

**Endpoint:** `https://shatteredarchive.com/contribute/identify`

**Request body:**

```json
{
  "connectionId": "string (max 128)",
  "characterName": "string (max 64)",
  "timestamp": "ISO 8601 string (optional)",
  "short": "string (max 120) — item short name",
  "long": "string (max 512, optional) — item long description",
  "description": "string (max 40000) — raw identify output (may contain ANSI)"
}
```

**Responses:**

| Status | Meaning |
|---|---|
| `200` | `{ ok: true, hash, receivedAt }` — accepted |
| `400` | Validation error — `{ error: "..." }` |
| `409` | Duplicate — this exact content was already submitted |
| `413` | Payload too large (> 10 KB) |
| `429` | Too many pending items in queue (> 1000) |
| `503` | Database error — retry later |

**Deduplication:** The server hashes the ANSI-stripped, normalized `long + description` fields via SHA-256. If the hash already exists in the database, the submission is rejected as a duplicate.

---

## Creature Lore

### Workflow

1. User opens the **Creature Lore** modal (menu bar → Contribute → Creature Lore)
2. User selects a **continent** and **area** from dropdowns (fetched from web-server)
3. User fills in the creature's **short name** and optionally a **long description**
4. User clicks **Start Capture** — the modal runs two auto-sequenced captures:
   - **Lore capture:** Sends `lore <short>`, collects lines for ~2 seconds
   - **Look capture:** After a brief delay, sends `look <short>`, collects lines for ~2 seconds
5. User reviews/edits captured lore and look text
6. User clicks **Submit** — POSTs to `/contribute/creaturelore`

**Identity requirement:** Same as Identify — requires `window.__SA_IDENTITY__.characterName` from GMCP.

### API: POST /contribute/creaturelore

**Endpoint:** `https://shatteredarchive.com/contribute/creaturelore`

**Request body:**

```json
{
  "connectionId": "string (max 128)",
  "characterName": "string (max 64)",
  "timestamp": "ISO 8601 string (optional)",
  "short": "string (max 120) — creature short name",
  "long": "string (max 512, optional) — creature long description",
  "continent": "string (max 96)",
  "area": "string (max 128)",
  "creatureLore": "string (max 40000, optional) — lore output (ANSI ok)",
  "creatureLook": "string (max 40000, optional) — look output (ANSI ok)"
}
```

At least one of `creatureLore` or `creatureLook` must be provided.

**Responses:** Same status codes as Identify.

**Deduplication:** SHA-256 of ANSI-stripped, normalized `long + creatureLore + creatureLook`.

---

## Shared Design Notes

- **ANSI codes are preserved** in stored payloads. Hashing uses ANSI-stripped text for deduplication, but storage keeps raw ANSI.
- **Capture timing:** Both features use a brief time window (1-2 seconds) plus trailing-blank detection to bound the capture. The MUD reliably ends identify/lore/look blocks with two blank lines.
- **Identity is GMCP-derived.** `window.__SA_IDENTITY__` is set when `game:character-login` fires (GMCP `login_data`). If the player hasn't logged in or GMCP isn't active, the character name will be missing and submission is blocked.
- **No auth.** The contribute endpoints accept anonymous submissions. The connection ID and character name are stored for moderation but not cryptographically verified.
- **Pending backlog limit:** The server rejects new submissions when there are more than 1000 pending items awaiting review, to prevent runaway queue growth.

---

## Server Implementation

The C# controller is at:
```
Server.Web.Public/Controllers/ContributeController.cs
```

Key classes:
- `ContributeIdentifyRequest` — request model for identify submissions
- `ContributeCreatureLoreRequest` — request model for creature lore submissions
- `ContributeController.Identify()` — `POST /contribute/identify`
- `ContributeController.CreatureLore()` — `POST /contribute/creaturelore`

Storage uses `DBManager.SaveData<ItemIdentificationModel>` and `DBManager.SaveData<CreatureLoreModel>` from `Server.Datastore`.

---

## Client Components

| File | Purpose |
|---|---|
| `apps/game-client/src/components/ContributeIdentifyModal.tsx` | Identify capture + submit UI |
| `apps/game-client/src/components/ContributeCreatureLoreModal.tsx` | Creature lore capture + submit UI |
| `apps/game-client/src/styles/ContributeIdentifyModal.module.scss` | Identify modal styles |
| `apps/game-client/src/styles/ContributeLoreModal.module.scss` | Lore modal styles |

Both modals are rendered in `MainContainer.tsx` and opened via the main menu bar.

---

## Events Used

| Event | Direction | Purpose |
|---|---|---|
| `shatteredarchive:raw-data` | Listen | Capture raw game output during the capture phase |
| `shatteredarchive:send-command` | Emit | Send `c id <short>`, `lore <short>`, `look <short>` to the MUD |
| `shatteredarchive:identity-updated` | Listen | Update displayed character name when GMCP login_data arrives |
| `game:character-login` | (upstream) | Triggers `shatteredarchive:identity-updated` via UserScriptRuntime |
