# Plan: MUD Builder — Phase 10 (.are import with quarantine validation + audit viewer)

Created: 2026-07-16T18:00:00Z · Workspace: /workspace/shattered-archive · Status: COMPLETE
Task: Let builders bring an EXISTING .are file into the world through the UI — validated in quarantine (parse, round-trip, vnum ranges, refs, scripts) before anything touches disk — and surface the Phase 9 audit trail in the Access tab.

## Goal
A builder can upload/paste a .are file in the UI, see a full validation report (errors block, warnings inform) plus the normalized re-emitted text, and — only when clean and confirmed — land it in the area dir registered in area.lst (backup semantics as elsewhere; brand-new files load at the next copyover, as Phase 5 established). The Access tab shows the recent audit log. Done when a live import of a real .are through the edge round-trips byte-identically, a deliberately broken file is rejected with a useful report and zero disk writes, the audit viewer lists the import, and all suites stay green.

## Constraints
- STABILITY IS KING; no C changes planned. New-file loading uses the existing copyover path; nothing hot-loads.
- Quarantine rule: an uploaded file NEVER touches the area dir until it parses, re-emits, re-parses identically (the Phase 1 round-trip guarantee), passes vnum-range overlap checks against area.lst, script validation, and reference checks; on any error the report comes back and the disk stays untouched.
- Same write gate + Phase 9 bearer guard applies (import is a mutation); imports appear in the audit log.
- Overwriting an EXISTING area file via import must be explicit (a separate confirm flag) and takes the standard timestamped backup first.
- Audit log endpoint is MASTER-only (operator data, like /api/auth) and read-only; the log file itself stays append-only, never truncated by the API.
- Upload size bounded (a .are is text, cap ~2 MB); reject non-UTF8/binary garbage gracefully.
- All code testable in isolation; never-crash server contract; qwen (container) must NOT run pnpm install|build|test.

## Context
- Phase 9 COMPLETE (.ai-plans/20260716-1400-*): bearer guard + builder-auth.json key lifecycle + backups/audit.log live at build.shatteredarchive.dev; E2E drivers read the master key from the host bind mount.
- AreaStore (/workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts) already has: parse/emit via merc-area, emit-validated-before-anything, atomic writes + timestamped backups, area.lst registration with range-overlap 400 (createArea), path-traversal guard. Import composes these — most quarantine checks exist as callable pieces.
- merc-area (/workspace/shattered-archive/services/merc-area/src) exports parseAreaFile/emitAreaFile, validateRefs, script validation — the same set the preview endpoint uses (routes/areas.ts POST preview).
- Audit lines are JSON-per-line in <areaPath>/backups/audit.log (src/audit.ts); the Access tab (apps/mud-builder-client/src/features/auth/AccessPage.tsx) already knows when the stored token is master.
- Client file upload: read the file client-side (FileReader → text) and POST JSON {filename, text} — no multipart needed, matches the existing request() JSON idiom in src/api/client.ts.

## Steps
### [x] 1. (CLAUDE) Server: quarantine import endpoints
- Do: AreaStore.importArea(filename, text, {overwrite}) — filename safety (same traversal guard), parse text, re-emit + re-parse and require byte-identical round trip, range-overlap check against area.lst (skip self when overwriting), refs/scripts validation; returns {report, normalizedText, summary(entity counts)} WITHOUT writing. importAreaCommit(...) — gated write: backup if the file exists (and require overwrite flag), write atomically, register in area.lst when new, report requiresCopyover. Routes: POST /api/import/area (report only, works without writes enabled), PUT /api/import/area (commit, write-gated + guarded). GET /api/audit?limit=N (master-only via the requireMaster pattern from routes/auth.ts): parse the last N audit.log lines, newest first, tolerate a missing file ({entries: []}).
- Files: /workspace/shattered-archive/apps/mud-builder-server/src/area-store.ts, src/routes/import.ts (new), src/routes/audit-view.ts (new), src/app.ts (+tests: clean import report + commit + area.lst registration, broken file 400 report with zero writes, overlap rejection, overwrite-without-flag 409 + with-flag backup, oversized/binary 400, audit endpoint master-only + tail order)
- Verify: host mud-builder-server suite green; tsc clean.

### [x] 2. (CLAUDE) Client: Import UI + audit viewer
- Do: Areas page gains an Import control (file picker + paste box): POST report shown as errors/warnings + entity summary + normalized-text preview with download; Commit button (disabled on errors; overwrite requires an explicit checkbox) → PUT, copyover note toast on success. AccessPage gains an "Audit log" section when master: fetch GET /api/audit, table of ts/method/route/actor, refresh button.
- Files: /workspace/shattered-archive/apps/mud-builder-client/src/features/areas/* (import component + test), src/features/auth/AccessPage.tsx (+test), src/api/client.ts
- Verify: host mud-builder-client suite green; tsc clean.

### [x] 3. (CLAUDE) Deploy + live E2E + docs + sign-off
- Do: rebuild + up the builder pair; E2E via edge (token minted from the host master key): import an existing stock .are copy under a new name → report clean → commit → file on disk byte-identical to normalized text + area.lst updated → cleanup (remove file + deregister via existing delete path or restore area.lst backup); broken .are → 400 + no disk change; audit endpoint shows the import; GET endpoints open; game container untouched. Update docs/mud-builder/README.md (import section + audit viewer note); refresh .annotated; mark plan COMPLETE; draft Phase 11 (candidates: in-UI new-skill C codegen assist, builder presence/locking for multi-user, world map visualization).
- Files: (driver in scratchpad), /workspace/shattered-archive/docs/mud-builder/README.md
- Verify: all driver checks pass; suites green; the MUD never restarted this phase.

## Progress log

- 2026-07-16T18:00:00Z plan created (successor to Phase 9, which is COMPLETE)
- 2026-07-16T20:30:00Z step 1 done: quarantine import + audit viewer on the server — AreaStore.importArea (pure report: parse, canonical round-trip stability, header/range sanity, overlap vs area.lst skipping self, refs/scripts; 2MB + binary guards) and importAreaCommit (403 write gate, 400 on report errors, 409 overwrite-without-flag, backup + atomic write, area.lst registration for new files with requiresCopyover). Routes: POST /api/import/area/preview (renamed from the planned POST /api/import/area so the audit middleware's /preview exclusion applies — previews never write, so they are not audited) + PUT /api/import/area, with a SCOPED 2mb JSON parser registered BEFORE the app-wide 1mb one (first parser wins). GET /api/audit (requireMaster, now exported from routes/auth.ts): tail-N newest-first, missing file = empty, bad line = { raw }. Server suite 56/56 (12 new), tsc clean.
- 2026-07-16T21:00:00Z step 2 done: client — ImportAreaPanel (file picker via FileReader + paste box, Validate → report with blocking errors/warnings/entity summary/canonical-text download, Commit disabled on errors/writes-off/unchecked-overwrite, stale report invalidated on any input change) wired into AreasPage ("Import .are file…" sidebar toggle, main-pane panel, refresh+open on success); AccessPage gains a master-only Audit log fieldset (newest-first table, refresh, { raw } fallback rows); api gains importPreview/importCommit/audit + ImportReport/ImportCommitResult/AuditEntry types. Client suite 63/63 (7 new), tsc clean.
- 2026-07-16T22:00:00Z step 3 done + plan COMPLETE: builder pair rebuilt and recreated (game container untouched, Up 10h); live E2E through the edge ALL 27 CHECKS PASS — audit viewer 401/200 gating, guarded import preview, stock immort.are previews clean (its canonical form round-trips byte-identically; the RAW host file normalizes: CRLF checkout + one E-before-D room sub-block ordering, correctly downgraded to a formatting warning), broken/overlap uploads rejected with zero disk writes, clean import committed byte-identical + area.lst registered + requiresCopyover, 409-then-overwrite-with-backup, audit shows commits (never previews, never token values); driver cleaned up after itself (import file removed, area.lst restored — the game never loads mid-boot, so host-side cleanup before any copyover is safe). Docs: README Phase 10 section + Scope sentence; .annotated refreshed (server src+routes, client areas/auth/api, docs); Phase 11 plan drafted (presence + save-conflict safety). NOTE for reviewers: the E2E confirmed the emitter canonicalizes room sub-block order (doors before extra descriptions), so imports of hand-edited stock files may legitimately warn about normalization.
