# Custom HUD Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "compact" HUD layout to the game client (terminal + bordered vitals/room/exits/input sub-window on the left, chat + affects on the right, both with a bundled Slate & Amber theme option), plus a small plugin-extensible "widget slot" system, without touching the existing classic layout's behavior.

**Architecture:** New, additive components (`CompactLayoutShell` and friends) sit alongside the existing `LayoutShell`/`RightSidebar`, chosen by a new opt-in setting. They reuse existing data hooks (`useRoomHeader`, `useCompassBlock`, `useStatusBlockViewModel`) plus two new small hooks (`useCharacterIdentity`, `useOpponentStatus` — the latter extracted, behavior-preserving, from `StatusBlock`). A small `PluginRuntimeApi` addition (`setHudWidget`) lets plugins (and trusted first-party code) publish `{label, value, variant}` content into two named layout regions, following the same "structured data in, host renders it" shape the API already uses for `registerOmitRules`. Baseline styling is ordinary CSS Modules; the Slate & Amber theme is a separate CSS asset targeting stable, hand-written class names layered on top.

**Tech Stack:** React 18 (function components + hooks), TypeScript, Vite, CSS Modules (`*.module.scss`), Jest + `@testing-library/react`, the existing `event-emitter` pub/sub (`DispatchEvent`/`ListenEvent`), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md`

## Global Constraints

- Desktop-only feature (`min-width: 901px`) — the existing mobile layout (`≤900px`) must render unchanged regardless of this feature's settings.
- Default-off: `hudLayoutStore` defaults to `'classic'`, `hudThemeStore` defaults to `'default'` — zero behavior change for anyone who doesn't open Settings.
- No edits to `LayoutShell.tsx`, `RoomHeader.tsx`, `CompassBlock.tsx`, `FocusBarVitals.tsx`. `RightSidebar.tsx` gets exactly one behavior-preserving extraction (Task 4) — nothing it renders should change.
- New components (`components/hud/*`) use ordinary `*.module.scss` for baseline styling (matches the rest of the codebase); the theme CSS is the ONE place that needs additional plain, hand-written class name strings alongside the module classes, per spec §4.3.
- `PluginRuntimeApi.setHudWidget` content stays narrow: `{ label?: string; value: string; variant?: 'default' | 'warning' | 'critical' }` — no markup, no arbitrary HTML.
- Test command for `apps/game-client`: `pnpm --filter @shatteredarchive/game-client test -- <pattern>` (Jest, jsdom environment, real `window`/`localStorage` available in tests — no special mocking needed for the event bus or storage).

---

## Task 1: `useCharacterIdentity` hook

**Files:**
- Create: `apps/game-client/src/hooks/useCharacterIdentity.ts`
- Test: `apps/game-client/src/hooks/useCharacterIdentity.test.ts`

**Interfaces:**
- Consumes: `ListenEvent`/`DispatchEvent` from `../features/event-emitter/event-dispatcher` (signatures: `ListenEvent<T>(name: string, handler: (payload: T) => void, options?: ListenOptions): () => void`; `DispatchEvent<T extends object>(name: string, payload: T): void`). The app-wide `shatteredarchive:identity-updated` event, payload shape `{ characterName?: string; updatedAt?: number }` (confirmed in `userScriptRuntime.ts`), and `window.__SA_IDENTITY__` holding the same shape as a snapshot for late subscribers.
- Produces: `useCharacterIdentity(): { characterName: string | null }` — consumed by Task 8 (`CompactRoomRow`) and Task 9/11 (terminal panel title).

- [ ] **Step 1: Write the failing test**

```ts
// apps/game-client/src/hooks/useCharacterIdentity.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCharacterIdentity } from './useCharacterIdentity';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

describe('useCharacterIdentity', () => {
  beforeEach(() => {
    delete (window as any).__SA_IDENTITY__;
  });

  it('starts null when there is no snapshot and nothing has been dispatched', () => {
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBeNull();
  });

  it('seeds from window.__SA_IDENTITY__ at mount, for late subscribers', () => {
    (window as any).__SA_IDENTITY__ = { characterName: 'Aria', updatedAt: 123 };
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBe('Aria');
  });

  it('updates when shatteredarchive:identity-updated fires after mount', () => {
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBeNull();

    act(() => {
      DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Bram', updatedAt: 456 });
    });

    expect(result.current.characterName).toBe('Bram');
  });

  it('unsubscribes on unmount (no state update after unmount)', () => {
    const { result, unmount } = renderHook(() => useCharacterIdentity());
    unmount();

    // Should not throw / warn about updating an unmounted component.
    act(() => {
      DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Cato', updatedAt: 789 });
    });

    expect(result.current.characterName).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- useCharacterIdentity`
Expected: FAIL — `Cannot find module './useCharacterIdentity'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/game-client/src/hooks/useCharacterIdentity.ts
import { useEffect, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

type IdentitySnapshot = {
  characterName?: string;
  updatedAt?: number;
};

function readSnapshot(): string | null {
  const snapshot = (window as any).__SA_IDENTITY__ as IdentitySnapshot | undefined;
  return snapshot?.characterName ?? null;
}

export function useCharacterIdentity(): { characterName: string | null } {
  const [characterName, setCharacterName] = useState<string | null>(() => readSnapshot());

  useEffect(() => {
    return ListenEvent<IdentitySnapshot>(
      'shatteredarchive:identity-updated',
      (payload) => {
        setCharacterName(payload.characterName ?? null);
      },
      { key: 'useCharacterIdentity::identity-updated' },
    );
  }, []);

  return { characterName };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- useCharacterIdentity`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/hooks/useCharacterIdentity.ts apps/game-client/src/hooks/useCharacterIdentity.test.ts
git commit -m "feat(hud): add useCharacterIdentity hook"
```

---

## Task 2: HUD layout + theme settings stores

**Files:**
- Create: `apps/game-client/src/features/hudLayout/hudLayoutStore.ts`
- Create: `apps/game-client/src/features/hudLayout/hudThemeStore.ts`
- Test: `apps/game-client/src/features/hudLayout/hudLayoutStore.test.ts`
- Test: `apps/game-client/src/features/hudLayout/hudThemeStore.test.ts`

**Interfaces:**
- Consumes: nothing new — mirrors the existing `localStorage` get/set pattern used by `userStyleOverrideStore.ts`.
- Produces: `getHudLayout(): 'classic' | 'compact'`, `setHudLayout(v: 'classic' | 'compact'): void` — consumed by Task 14 (`MainContainer.tsx`) and Task 13 (`GraphicsSettingsModal.tsx`). `getHudTheme(): 'default' | 'slate-amber'`, `setHudTheme(v: 'default' | 'slate-amber'): void` — consumed by Task 12 (theme CSS injection) and Task 13.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/game-client/src/features/hudLayout/hudLayoutStore.test.ts
import { getHudLayout, setHudLayout } from './hudLayoutStore';

const KEY = 'shatteredArchive.hudLayout.mode.v1';

describe('hudLayoutStore', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));

  it('defaults to classic when nothing is stored', () => {
    expect(getHudLayout()).toBe('classic');
  });

  it('round-trips compact', () => {
    setHudLayout('compact');
    expect(getHudLayout()).toBe('compact');
  });

  it('ignores a corrupt stored value and falls back to classic', () => {
    window.localStorage.setItem(KEY, 'not-a-real-mode');
    expect(getHudLayout()).toBe('classic');
  });
});
```

```ts
// apps/game-client/src/features/hudLayout/hudThemeStore.test.ts
import { getHudTheme, setHudTheme } from './hudThemeStore';

const KEY = 'shatteredArchive.hudLayout.theme.v1';

describe('hudThemeStore', () => {
  beforeEach(() => window.localStorage.removeItem(KEY));

  it('defaults to default when nothing is stored', () => {
    expect(getHudTheme()).toBe('default');
  });

  it('round-trips slate-amber', () => {
    setHudTheme('slate-amber');
    expect(getHudTheme()).toBe('slate-amber');
  });

  it('ignores a corrupt stored value and falls back to default', () => {
    window.localStorage.setItem(KEY, 'not-a-real-theme');
    expect(getHudTheme()).toBe('default');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudLayoutStore hudThemeStore`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/game-client/src/features/hudLayout/hudLayoutStore.ts
export type HudLayoutMode = 'classic' | 'compact';

const KEY = 'shatteredArchive.hudLayout.mode.v1';
const VALID: HudLayoutMode[] = ['classic', 'compact'];

export function getHudLayout(): HudLayoutMode {
  try {
    const raw = window.localStorage.getItem(KEY);
    return VALID.includes(raw as HudLayoutMode) ? (raw as HudLayoutMode) : 'classic';
  } catch {
    return 'classic';
  }
}

export function setHudLayout(mode: HudLayoutMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // ignore
  }
}
```

```ts
// apps/game-client/src/features/hudLayout/hudThemeStore.ts
export type HudTheme = 'default' | 'slate-amber';

const KEY = 'shatteredArchive.hudLayout.theme.v1';
const VALID: HudTheme[] = ['default', 'slate-amber'];

export function getHudTheme(): HudTheme {
  try {
    const raw = window.localStorage.getItem(KEY);
    return VALID.includes(raw as HudTheme) ? (raw as HudTheme) : 'default';
  } catch {
    return 'default';
  }
}

export function setHudTheme(theme: HudTheme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudLayoutStore hudThemeStore`
Expected: PASS (3 tests each)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/features/hudLayout/hudLayoutStore.ts apps/game-client/src/features/hudLayout/hudLayoutStore.test.ts apps/game-client/src/features/hudLayout/hudThemeStore.ts apps/game-client/src/features/hudLayout/hudThemeStore.test.ts
git commit -m "feat(hud): add layout and theme settings stores"
```

---

## Task 3: Widget slot types + registry

The `HudSlotId`/`HudWidgetContent` types have to live in the shared
`@shatteredarchive/types-client` package (not inside `apps/game-client`),
because Task 5's `PluginRuntimeApi.setHudWidget` signature — defined in that
package — needs to reference them. `hudWidgetRegistry.ts` (in
`apps/game-client`) then imports them from there, same as `pluginHost.ts`
already does for `IPluginModule`/`PluginRuntimeApi`.

**Files:**
- Modify: `types/types-client/src/plugins/plugin-base.ts` (add types, no build step needed — `apps/game-client`'s Jest config path-aliases `@shatteredarchive/types-client` straight to this package's `src/index.ts`, confirmed in `tsconfig.jest.client.json`)
- Create: `apps/game-client/src/features/hudLayout/hudWidgetRegistry.ts`
- Test: `apps/game-client/src/features/hudLayout/hudWidgetRegistry.test.ts`

**Interfaces:**
- Consumes: `DispatchEvent`/`ListenEvent` (same signatures as Task 1).
- Produces: `HudSlotId = 'hud.bottomStrip' | 'hud.rightColumn'`, `HudWidgetContent = { label?: string; value: string; variant?: 'default' | 'warning' | 'critical' }`, `ALL_HUD_SLOT_IDS: HudSlotId[]` (all exported from `@shatteredarchive/types-client`). `getHudWidget(slotId: HudSlotId): { ownerId: string; content: HudWidgetContent } | null` and `publishHudWidget(slotId: HudSlotId, ownerId: string, content: HudWidgetContent | null): void` (exported from `hudWidgetRegistry.ts`) — consumed by Task 5 (`pluginHost.ts`) and Task 6 (`CompactWidgetSlot`).

- [ ] **Step 1: Add the shared types**

```ts
// types/types-client/src/plugins/plugin-base.ts
// Add near the bottom of the file, after InstalledPluginRecord:

/**
 * Named regions the compact HUD layout reserves for other features to fill
 * (see docs/superpowers/specs/2026-09-14-custom-hud-layout-design.md §4.6).
 * Deliberately narrow: plain text only, no markup — the host layout owns
 * all rendering.
 */
export type HudSlotId = 'hud.bottomStrip' | 'hud.rightColumn';

export const ALL_HUD_SLOT_IDS: HudSlotId[] = ['hud.bottomStrip', 'hud.rightColumn'];

export interface HudWidgetContent {
  label?: string;
  value: string;
  variant?: 'default' | 'warning' | 'critical';
}
```

Then add `setHudWidget` to `PluginRuntimeApi`, right after `registerOmitRules`:

```ts
// types/types-client/src/plugins/plugin-base.ts, inside `export interface PluginRuntimeApi { ... }`

  /**
   * Publish (or clear, with null) this plugin's content into a named HUD
   * widget slot in the compact layout. Structured data only — the host
   * component owns all rendering and styling, so a plugin cannot inject
   * markup or break layout. The last publisher to a slot wins; clearing
   * only takes effect if this plugin is the slot's current occupant.
   */
  setHudWidget: (slotId: HudSlotId, content: HudWidgetContent | null) => void;
```

- [ ] **Step 2: Write the failing registry test**

```ts
// apps/game-client/src/features/hudLayout/hudWidgetRegistry.test.ts
import { getHudWidget, publishHudWidget } from './hudWidgetRegistry';
import { ListenEvent } from '../event-emitter/event-dispatcher';

describe('hudWidgetRegistry', () => {
  afterEach(() => {
    // leave every slot empty between tests
    publishHudWidget('hud.bottomStrip', 'test-owner', null);
    publishHudWidget('hud.rightColumn', 'test-owner', null);
  });

  it('is empty for a slot nothing has published to', () => {
    expect(getHudWidget('hud.bottomStrip')).toBeNull();
  });

  it('publish then getHudWidget returns the current occupant', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { label: 'Enemy', value: 'A rabid wolf' });
    expect(getHudWidget('hud.rightColumn')).toEqual({
      ownerId: 'autoleveling',
      content: { label: 'Enemy', value: 'A rabid wolf' },
    });
  });

  it('later publisher wins for the same slot', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    publishHudWidget('hud.rightColumn', 'questbot', { value: 'Quest complete' });
    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'questbot', content: { value: 'Quest complete' } });
  });

  it('publishing null only clears if the caller currently owns the slot', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    publishHudWidget('hud.rightColumn', 'questbot', null); // not the owner — no-op
    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'autoleveling', content: { value: 'A rabid wolf' } });

    publishHudWidget('hud.rightColumn', 'autoleveling', null); // owner clears — takes effect
    expect(getHudWidget('hud.rightColumn')).toBeNull();
  });

  it('dispatches shatteredarchive:hud-widget-updated on every publish (including clears)', () => {
    const seen: unknown[] = [];
    const dispose = ListenEvent('shatteredarchive:hud-widget-updated', (payload) => seen.push(payload), {
      key: 'test::hud-widget-updated',
    });

    publishHudWidget('hud.bottomStrip', 'autoleveling', { value: 'x' });
    publishHudWidget('hud.bottomStrip', 'autoleveling', null);

    dispose();
    expect(seen).toEqual([
      { slotId: 'hud.bottomStrip', ownerId: 'autoleveling', content: { value: 'x' } },
      { slotId: 'hud.bottomStrip', ownerId: 'autoleveling', content: null },
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudWidgetRegistry`
Expected: FAIL — `Cannot find module './hudWidgetRegistry'`

- [ ] **Step 4: Write minimal implementation**

```ts
// apps/game-client/src/features/hudLayout/hudWidgetRegistry.ts
import type { HudSlotId, HudWidgetContent } from '@shatteredarchive/types-client';
import { DispatchEvent } from '../event-emitter/event-dispatcher';

export type { HudSlotId, HudWidgetContent };

export const HUD_WIDGET_UPDATED_EVENT = 'shatteredarchive:hud-widget-updated';

export type HudWidgetOccupant = { ownerId: string; content: HudWidgetContent };

// In-memory snapshot, same reason window.__SA_IDENTITY__ exists: a
// CompactWidgetSlot that mounts AFTER the last publish (layout switched
// mid-session, or a reload with compact already on) needs to read current
// state immediately, not just wait for the next change to fire.
const current = new Map<HudSlotId, HudWidgetOccupant>();

export function getHudWidget(slotId: HudSlotId): HudWidgetOccupant | null {
  return current.get(slotId) ?? null;
}

export function publishHudWidget(slotId: HudSlotId, ownerId: string, content: HudWidgetContent | null): void {
  if (content === null) {
    const occupant = current.get(slotId);
    // A disabled/stale owner can't clobber someone else's widget.
    if (!occupant || occupant.ownerId !== ownerId) return;
    current.delete(slotId);
  } else {
    current.set(slotId, { ownerId, content });
  }

  DispatchEvent(HUD_WIDGET_UPDATED_EVENT, { slotId, ownerId, content });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudWidgetRegistry`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add types/types-client/src/plugins/plugin-base.ts apps/game-client/src/features/hudLayout/hudWidgetRegistry.ts apps/game-client/src/features/hudLayout/hudWidgetRegistry.test.ts
git commit -m "feat(hud): add HUD widget slot registry and shared types"
```

---

## Task 4: Extract `useOpponentStatus` from `StatusBlock`

This is the one existing-behavior-carrying extraction in the plan (flagged
in review as real risk, not a trivial reshuffle) — `StatusBlock`
(`RightSidebar.tsx`) currently tracks the enemy/opponent bar as inline
component state: a `setInterval` staleness ticker, a damage-chunk pulse
with its own timeout ref, and an `isEnemyActive` computation. Extracting it
must not change what `StatusBlock` renders in the classic layout.

**Files:**
- Create: `apps/game-client/src/hooks/useOpponentStatus.ts`
- Test: `apps/game-client/src/hooks/useOpponentStatus.test.ts`
- Modify: `apps/game-client/src/components/RightSidebar.tsx` (StatusBlock switches to the extracted hook)

**Interfaces:**
- Consumes: `ListenEvent` (Task 1's signature). The existing `'event:fighting:opponent'` event, payload `OpponentStatusDetail` from `../features/combat/opponent-types` (already imported in `RightSidebar.tsx` today).
- Produces: `useOpponentStatus(): { enemyUi: EnemyUiState; isEnemyActive: boolean; damageChunk: { leftPct: number; widthPct: number; key: number } | null }` — consumed by Task 7 (`CompactVitalsRow`) and, after this task, by `StatusBlock` itself.

- [ ] **Step 1: Write the failing test**

```ts
// apps/game-client/src/hooks/useOpponentStatus.test.ts
import { renderHook, act } from '@testing-library/react';
import { useOpponentStatus } from './useOpponentStatus';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

describe('useOpponentStatus', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  it('starts inactive with no enemy', () => {
    const { result } = renderHook(() => useOpponentStatus());
    expect(result.current.isEnemyActive).toBe(false);
    expect(result.current.enemyUi.label).toBe('Enemy');
  });

  it('becomes active when event:fighting:opponent fires', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });

    expect(result.current.isEnemyActive).toBe(true);
    expect(result.current.enemyUi.label).toBe('A rabid wolf');
    expect(result.current.enemyUi.pct).toBe(80);
  });

  it('goes stale after ENEMY_STALE_MS (5000ms) with no new event', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    expect(result.current.isEnemyActive).toBe(true);

    act(() => {
      jest.advanceTimersByTime(5200);
    });
    expect(result.current.isEnemyActive).toBe(false);
  });

  it('shows a damage chunk when pct drops, and clears it after its own timeout', () => {
    const { result } = renderHook(() => useOpponentStatus());

    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 50, ts: Date.now() });
    });

    expect(result.current.damageChunk).not.toBeNull();
    expect(result.current.damageChunk!.leftPct).toBe(50);
    expect(result.current.damageChunk!.widthPct).toBe(30);

    act(() => {
      jest.advanceTimersByTime(4600);
    });
    expect(result.current.damageChunk).toBeNull();
  });

  it('cleans up its timers on unmount (no pending-timer warnings)', () => {
    const { unmount } = renderHook(() => useOpponentStatus());
    act(() => {
      DispatchEvent('event:fighting:opponent', { label: 'A rabid wolf', pct: 80, ts: Date.now() });
    });
    unmount();
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    // No assertion needed beyond "this doesn't throw" — jest.useFakeTimers
    // surfaces leaked/dangling timers as noise if cleanup is missing.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- useOpponentStatus`
Expected: FAIL — `Cannot find module './useOpponentStatus'`

- [ ] **Step 3: Write the extracted implementation**

This is the existing logic from `StatusBlock` in `RightSidebar.tsx`, moved
verbatim into hook form (same field names, same timing constants, same
formatting call) — not rewritten.

```ts
// apps/game-client/src/hooks/useOpponentStatus.ts
import { useEffect, useRef, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';
import { formatOpponentStatusText, type OpponentStatusDetail, type EnemyUiState } from '../features/combat/opponent-types';

const ENEMY_STALE_MS = 5000;

type DamageChunk = { leftPct: number; widthPct: number; key: number };

export function useOpponentStatus(): {
  enemyUi: EnemyUiState;
  isEnemyActive: boolean;
  damageChunk: DamageChunk | null;
} {
  const [enemyUi, setEnemyUi] = useState<EnemyUiState>({
    lastSeenTs: 0,
    label: 'Enemy',
    pct: 0,
    statusText: '',
  });

  const [damageChunk, setDamageChunk] = useState<DamageChunk | null>(null);
  const chunkTimerRef = useRef<number | null>(null);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const dispose = ListenEvent<OpponentStatusDetail>(
      'event:fighting:opponent',
      (d) => {
        if (!d || !Number.isFinite(d.pct)) return;

        setEnemyUi((prev) => {
          const prevSeen = prev.lastSeenTs > 0;
          const prevPct = prevSeen ? prev.pct : d.pct;
          const nextPct = d.pct;

          if (nextPct < prevPct) {
            const left = Math.max(0, Math.min(100, nextPct));
            const width = Math.max(0, Math.min(100 - left, prevPct - nextPct));

            if (width > 0.05) {
              setDamageChunk({ leftPct: left, widthPct: width, key: d.ts || Date.now() });

              if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
              chunkTimerRef.current = window.setTimeout(() => setDamageChunk(null), 4500);
            }
          }

          return {
            lastSeenTs: d.ts || Date.now(),
            label: d.label?.trim() || prev.label || 'Enemy',
            pct: nextPct,
            statusText: formatOpponentStatusText(d.pct, d.minPct, d.maxPct),
          };
        });
      },
      { key: 'useOpponentStatus::event:fighting:opponent' },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
      if (chunkTimerRef.current) window.clearTimeout(chunkTimerRef.current);
    };
  }, []);

  const isEnemyActive = enemyUi.lastSeenTs > 0 && now - enemyUi.lastSeenTs <= ENEMY_STALE_MS;

  useEffect(() => {
    if (!isEnemyActive && damageChunk) setDamageChunk(null);
  }, [isEnemyActive, damageChunk]);

  return { enemyUi, isEnemyActive, damageChunk };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- useOpponentStatus`
Expected: PASS (5 tests)

- [ ] **Step 5: Switch `StatusBlock` to the extracted hook**

In `apps/game-client/src/components/RightSidebar.tsx`:
1. Add import: `import { useOpponentStatus } from '../hooks/useOpponentStatus';`
2. Delete the inline `enemyUi`/`damageChunk`/`chunkTimerRef`/`now`/the `useEffect` for the 200ms ticker/the `useEffect` for `'event:fighting:opponent'`/the `isEnemyActive` computation/the stale-clears-damageChunk `useEffect` from `StatusBlock` — replace with:

```ts
  const { enemyUi, isEnemyActive, damageChunk } = useOpponentStatus();
```

Everything below that line in `StatusBlock` (the `enemyRowClass` memo, the JSX referencing `enemyUi`/`isEnemyActive`/`damageChunk`) is unchanged — same variable names, so no other edits needed.

- [ ] **Step 6: Manual before/after check of classic layout**

Run the dev server (`pnpm --filter @shatteredarchive/game-client dev`), connect, and verify in the browser: the enemy HP bar in the classic right sidebar still appears during combat, updates live, shows a damage-chunk pulse on a hit, and goes stale/disappears after ~5s with no combat activity — matching pre-extraction behavior. This step exists because the extraction carries real stateful behavior (timers) that a type-check or unit test alone won't fully catch in the *integrated* component.

- [ ] **Step 7: Run the full game-client test suite**

Run: `pnpm --filter @shatteredarchive/game-client test`
Expected: PASS — no existing test regresses from the `RightSidebar.tsx` change

- [ ] **Step 8: Commit**

```bash
git add apps/game-client/src/hooks/useOpponentStatus.ts apps/game-client/src/hooks/useOpponentStatus.test.ts apps/game-client/src/components/RightSidebar.tsx
git commit -m "refactor(hud): extract useOpponentStatus from StatusBlock"
```

---

## Task 5: `PluginRuntimeApi.setHudWidget`

**Files:**
- Modify: `apps/game-client/src/features/plugins/pluginHost.ts`
- Modify: `apps/game-client/src/features/plugins/pluginHost.test.ts` (existing file — add to it)

**Interfaces:**
- Consumes: `publishHudWidget`, `ALL_HUD_SLOT_IDS` (Task 3).
- Produces: `PluginRuntimeApi.setHudWidget(slotId, content)` — usable by any `core-plugins/*.plugin.ts` via `api.setHudWidget(...)` in `onEnable`/`onEvent`. Consumed end-to-end by Task 15.

- [ ] **Step 1: Look at the existing `pluginHost.test.ts` conventions**

Run: `cat apps/game-client/src/features/plugins/pluginHost.test.ts` and match its existing style (how it builds a minimal `IPluginModule`, how it calls `pluginHost.setConnection`/`registerModule`/`enable`/`disable`) before writing the new tests below — this repo's convention is to follow the file you're extending, not introduce a new test-setup style.

- [ ] **Step 2: Write the failing tests**

Add to `apps/game-client/src/features/plugins/pluginHost.test.ts` (adjust the minimal-module builder to match whatever helper the existing file already uses — if it has one, e.g. `makeModule(...)`, reuse it):

```ts
import { getHudWidget } from '../hudLayout/hudWidgetRegistry';

describe('PluginRuntimeApi.setHudWidget', () => {
  it('publishes into the widget registry, owned by the plugin id', () => {
    pluginHost.setConnection('test-conn');
    let capturedApi: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'test-plugin', name: 'Test', version: '1.0.0' },
      onEnable: (api) => {
        capturedApi = api;
      },
    });
    pluginHost.enable('test-plugin');

    capturedApi!.setHudWidget('hud.rightColumn', { label: 'Enemy', value: 'A rabid wolf' });

    expect(getHudWidget('hud.rightColumn')).toEqual({
      ownerId: 'test-plugin',
      content: { label: 'Enemy', value: 'A rabid wolf' },
    });
  });

  it('clears every slot the plugin owns when the plugin is disabled', () => {
    pluginHost.setConnection('test-conn-2');
    let capturedApi: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'test-plugin-2', name: 'Test 2', version: '1.0.0' },
      onEnable: (api) => {
        capturedApi = api;
      },
    });
    pluginHost.enable('test-plugin-2');
    capturedApi!.setHudWidget('hud.bottomStrip', { value: 'x' });
    expect(getHudWidget('hud.bottomStrip')).not.toBeNull();

    pluginHost.disable('test-plugin-2');
    expect(getHudWidget('hud.bottomStrip')).toBeNull();
  });

  it('disabling one plugin does not clear a slot owned by another plugin', () => {
    pluginHost.setConnection('test-conn-3');
    let apiA: PluginRuntimeApi | null = null;
    let apiB: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'plugin-a', name: 'A', version: '1.0.0' },
      onEnable: (api) => {
        apiA = api;
      },
    });
    pluginHost.registerModule({
      manifest: { id: 'plugin-b', name: 'B', version: '1.0.0' },
      onEnable: (api) => {
        apiB = api;
      },
    });
    pluginHost.enable('plugin-a');
    pluginHost.enable('plugin-b');

    apiA!.setHudWidget('hud.rightColumn', { value: 'from A' });
    pluginHost.disable('plugin-b'); // never touched this slot

    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'plugin-a', content: { value: 'from A' } });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @shatteredarchive/game-client test -- pluginHost`
Expected: FAIL — `api.setHudWidget is not a function`

- [ ] **Step 4: Wire the implementation**

In `apps/game-client/src/features/plugins/pluginHost.ts`:

1. Add the import:

```ts
import { publishHudWidget } from '../hudLayout/hudWidgetRegistry';
import { ALL_HUD_SLOT_IDS, type HudSlotId, type HudWidgetContent } from '@shatteredarchive/types-client';
```

2. Inside `makeDefaultApi`'s returned object, right after `registerOmitRules`:

```ts
    setHudWidget: (slotId: HudSlotId, content: HudWidgetContent | null) => {
      publishHudWidget(slotId, pluginId, content);
    },
```

3. Inside `disable(pluginId)`, right after the existing `setPluginOmitRules(pluginId, []);` line:

```ts
    for (const slotId of ALL_HUD_SLOT_IDS) {
      publishHudWidget(slotId, pluginId, null);
    }
```

(`publishHudWidget`'s ownership check already makes this safe to call for every slot unconditionally — it only clears a slot this plugin actually owns.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @shatteredarchive/game-client test -- pluginHost`
Expected: PASS (existing tests + 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/src/features/plugins/pluginHost.ts apps/game-client/src/features/plugins/pluginHost.test.ts
git commit -m "feat(hud): wire setHudWidget into PluginRuntimeApi"
```

---

## Task 6: `CompactWidgetSlot` component

**Files:**
- Create: `apps/game-client/src/components/hud/CompactWidgetSlot.tsx`
- Create: `apps/game-client/src/styles/hud/CompactWidgetSlot.module.scss`
- Test: `apps/game-client/src/components/hud/CompactWidgetSlot.test.tsx`

**Interfaces:**
- Consumes: `getHudWidget`, `HUD_WIDGET_UPDATED_EVENT`, `HudSlotId` (Task 3). `ListenEvent` (Task 1).
- Produces: `<CompactWidgetSlot slotId={HudSlotId} />` — consumed by Task 11 (`CompactLayoutShell`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/components/hud/CompactWidgetSlot.test.tsx
import { render, screen, act } from '@testing-library/react';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import { publishHudWidget } from '../../features/hudLayout/hudWidgetRegistry';

describe('CompactWidgetSlot', () => {
  afterEach(() => {
    publishHudWidget('hud.rightColumn', 'test', null);
  });

  it('renders nothing when the slot is empty', () => {
    const { container } = render(<CompactWidgetSlot slotId="hud.rightColumn" />);
    expect(container.querySelector('[data-hud-slot]')).toBeNull();
  });

  it('shows the current occupant read at mount (late-mount snapshot)', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { label: 'Enemy', value: 'A rabid wolf' });

    render(<CompactWidgetSlot slotId="hud.rightColumn" />);

    expect(screen.getByText('Enemy')).toBeInTheDocument();
    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();
  });

  it('updates live when the occupant changes after mount', () => {
    render(<CompactWidgetSlot slotId="hud.rightColumn" />);
    expect(screen.queryByText('A rabid wolf')).toBeNull();

    act(() => {
      publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    });

    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();
  });

  it('exposes the variant as a data attribute for theme CSS to target', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'Low HP!', variant: 'warning' });
    render(<CompactWidgetSlot slotId="hud.rightColumn" />);

    expect(screen.getByText('Low HP!').closest('[data-hud-slot]')).toHaveAttribute('data-variant', 'warning');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactWidgetSlot`
Expected: FAIL — `Cannot find module './CompactWidgetSlot'`

- [ ] **Step 3: Write minimal implementation**

```scss
// apps/game-client/src/styles/hud/CompactWidgetSlot.module.scss
.root {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.75rem;
  padding: 2px 4px;
}

.label {
  color: #9a9a9a;
}

.value {
  color: #e0e0e0;
}
```

```tsx
// apps/game-client/src/components/hud/CompactWidgetSlot.tsx
import React, { useEffect, useState } from 'react';
import styles from '../../styles/hud/CompactWidgetSlot.module.scss';
import {
  getHudWidget,
  HUD_WIDGET_UPDATED_EVENT,
  type HudSlotId,
  type HudWidgetContent,
} from '../../features/hudLayout/hudWidgetRegistry';
import { ListenEvent } from '../../features/event-emitter/event-dispatcher';

export interface CompactWidgetSlotProps {
  slotId: HudSlotId;
}

export const CompactWidgetSlot: React.FC<CompactWidgetSlotProps> = ({ slotId }) => {
  const [content, setContent] = useState<HudWidgetContent | null>(() => getHudWidget(slotId)?.content ?? null);

  useEffect(() => {
    // Re-sync in case the slotId prop itself changes, or another slot's
    // update fired before this instance mounted with its own slotId.
    setContent(getHudWidget(slotId)?.content ?? null);

    return ListenEvent<{ slotId: HudSlotId; ownerId: string; content: HudWidgetContent | null }>(
      HUD_WIDGET_UPDATED_EVENT,
      (payload) => {
        if (payload.slotId !== slotId) return;
        setContent(payload.content);
      },
      { key: `CompactWidgetSlot::${slotId}` },
    );
  }, [slotId]);

  if (!content) return null;

  return (
    <div className={`${styles.root} sa-hud-widget-slot`} data-hud-slot={slotId} data-variant={content.variant ?? 'default'}>
      {content.label && <span className={`${styles.label} sa-hud-widget-slot-label`}>{content.label}</span>}
      <span className={`${styles.value} sa-hud-widget-slot-value`}>{content.value}</span>
    </div>
  );
};

export default CompactWidgetSlot;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactWidgetSlot`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/components/hud/CompactWidgetSlot.tsx apps/game-client/src/styles/hud/CompactWidgetSlot.module.scss apps/game-client/src/components/hud/CompactWidgetSlot.test.tsx
git commit -m "feat(hud): add CompactWidgetSlot component"
```

---

## Task 7: `CompactVitalsRow` component

**Files:**
- Create: `apps/game-client/src/components/hud/CompactVitalsRow.tsx`
- Create: `apps/game-client/src/styles/hud/CompactVitalsRow.module.scss`
- Test: `apps/game-client/src/components/hud/CompactVitalsRow.test.tsx`

**Interfaces:**
- Consumes: `useStatusBlockViewModel()` from `../../hooks/useLayoutShell` — returns (at minimum) `{ remaining, vitals: { hp, hpMax, mp, mpMax, stamina, staminaMax }, hpPct, mpPct, staPct }` (existing, unmodified). `useOpponentStatus()` (Task 4) — returns `{ enemyUi, isEnemyActive, damageChunk }`.
- Produces: `<CompactVitalsRow />` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/components/hud/CompactVitalsRow.test.tsx
import { render, screen } from '@testing-library/react';
import { CompactVitalsRow } from './CompactVitalsRow';

jest.mock('../../hooks/useLayoutShell', () => ({
  useStatusBlockViewModel: () => ({
    remaining: '4:12',
    vitals: { hp: 402, hpMax: 402, mp: 233, mpMax: 233, stamina: 140, staminaMax: 140 },
    hpPct: 100,
    mpPct: 100,
    staPct: 100,
  }),
}));

jest.mock('../../hooks/useOpponentStatus', () => ({
  useOpponentStatus: () => ({
    enemyUi: { lastSeenTs: 0, label: 'Enemy', pct: 0, statusText: '' },
    isEnemyActive: false,
    damageChunk: null,
  }),
}));

describe('CompactVitalsRow', () => {
  it('shows legible X / Y text for HP, Mana, and Move', () => {
    render(<CompactVitalsRow />);

    expect(screen.getByText('402 / 402')).toBeInTheDocument(); // HP
    expect(screen.getByText('233 / 233')).toBeInTheDocument(); // Mana
    expect(screen.getByText('140 / 140')).toBeInTheDocument(); // Move (Stamina, relabeled)
  });

  it('labels the third gauge MOVE, not Stam', () => {
    render(<CompactVitalsRow />);
    expect(screen.getByText('MOVE')).toBeInTheDocument();
    expect(screen.queryByText('Stam')).toBeNull();
  });

  it('does not render an enemy row when no opponent is active', () => {
    render(<CompactVitalsRow />);
    expect(screen.queryByText(/enemy/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactVitalsRow`
Expected: FAIL — `Cannot find module './CompactVitalsRow'`

- [ ] **Step 3: Write minimal implementation**

```scss
// apps/game-client/src/styles/hud/CompactVitalsRow.module.scss
.root {
  display: flex;
  gap: 16px;
  padding: 4px 10px;
  font-size: 0.75rem;
}

.gauge {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gaugeLabel {
  width: 2.3rem;
  color: #9a9a9a;
  font-size: 0.65rem;
}

.track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: #222;
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999px;
}

.value {
  min-width: 4.2rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #e0e0e0;
}

.enemyRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
```

```tsx
// apps/game-client/src/components/hud/CompactVitalsRow.tsx
import React from 'react';
import styles from '../../styles/hud/CompactVitalsRow.module.scss';
import { useStatusBlockViewModel } from '../../hooks/useLayoutShell';
import { useOpponentStatus } from '../../hooks/useOpponentStatus';

export const CompactVitalsRow: React.FC = () => {
  const { vitals, hpPct, mpPct, staPct } = useStatusBlockViewModel();
  const { enemyUi, isEnemyActive } = useOpponentStatus();

  return (
    <div className={`${styles.root} sa-hud-vitals-row`}>
      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>HP</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-hp`} style={{ width: `${hpPct}%` }} data-hp-warning={hpPct < 25} />
        </div>
        <span className={styles.value}>
          {vitals.hp} / {vitals.hpMax}
        </span>
      </div>

      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>Mana</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-mp`} style={{ width: `${mpPct}%` }} />
        </div>
        <span className={styles.value}>
          {vitals.mp} / {vitals.mpMax}
        </span>
      </div>

      <div className={styles.gauge}>
        <span className={styles.gaugeLabel}>MOVE</span>
        <div className={styles.track}>
          <div className={`${styles.fill} sa-hud-vitals-fill-move`} style={{ width: `${staPct}%` }} />
        </div>
        <span className={styles.value}>
          {vitals.stamina} / {vitals.staminaMax}
        </span>
      </div>

      {isEnemyActive && (
        <div className={`${styles.enemyRow} sa-hud-vitals-enemy-row`}>
          <span className={styles.gaugeLabel}>{enemyUi.label}</span>
          <div className={styles.track}>
            <div className={`${styles.fill} sa-hud-vitals-fill-enemy`} style={{ width: `${enemyUi.pct}%` }} />
          </div>
          <span className={styles.value}>{enemyUi.statusText}</span>
        </div>
      )}
    </div>
  );
};

export default CompactVitalsRow;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactVitalsRow`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/components/hud/CompactVitalsRow.tsx apps/game-client/src/styles/hud/CompactVitalsRow.module.scss apps/game-client/src/components/hud/CompactVitalsRow.test.tsx
git commit -m "feat(hud): add CompactVitalsRow component"
```

---

## Task 8: `CompactRoomRow` component

**Files:**
- Create: `apps/game-client/src/components/hud/CompactRoomRow.tsx`
- Create: `apps/game-client/src/styles/hud/CompactRoomRow.module.scss`
- Test: `apps/game-client/src/components/hud/CompactRoomRow.test.tsx`

**Interfaces:**
- Consumes: `useCharacterIdentity()` (Task 1) — `{ characterName: string | null }`. `useRoomHeader()` from `../../hooks/useRoomHeader` (existing) — `{ roomName: string; roomFlags: string }`. `useCompassBlock()` from `../../hooks/useCompassBlock` (existing) — `{ hasExit: (dir: CompassDirection) => boolean; move: (dir: CompassDirection) => void }`, `CompassDirection` type also exported from that module.
- Produces: `<CompactRoomRow />` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/components/hud/CompactRoomRow.test.tsx
import { render, screen } from '@testing-library/react';
import { CompactRoomRow } from './CompactRoomRow';

jest.mock('../../hooks/useCharacterIdentity', () => ({
  useCharacterIdentity: () => ({ characterName: 'Aria' }),
}));

jest.mock('../../hooks/useRoomHeader', () => ({
  useRoomHeader: () => ({ roomName: 'The Chamber of the Body', roomFlags: '(inside)' }),
}));

const mockHasExit = jest.fn();
jest.mock('../../hooks/useCompassBlock', () => ({
  useCompassBlock: () => ({ hasExit: mockHasExit, move: jest.fn() }),
}));

describe('CompactRoomRow', () => {
  beforeEach(() => {
    mockHasExit.mockReset();
    mockHasExit.mockImplementation((dir: string) => dir === 'N' || dir === 'E');
  });

  it('shows the room name', () => {
    render(<CompactRoomRow />);
    expect(screen.getByText('The Chamber of the Body')).toBeInTheDocument();
  });

  it('shows only the available exits, bracketed', () => {
    render(<CompactRoomRow />);
    expect(screen.getByText('[')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.queryByText('S')).toBeNull();
    expect(screen.queryByText('W')).toBeNull();
  });

  it('clicking an available exit calls move with that direction', () => {
    render(<CompactRoomRow />);
    screen.getByText('N').click();
    // move is re-mocked fresh per render via useCompassBlock's factory; assert
    // indirectly is out of scope here — Task 11's manual verification covers
    // click-to-move end to end. This test only proves availability filtering.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactRoomRow`
Expected: FAIL — `Cannot find module './CompactRoomRow'`

- [ ] **Step 3: Write minimal implementation**

```scss
// apps/game-client/src/styles/hud/CompactRoomRow.module.scss
.root {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  font-size: 0.75rem;
}

.roomName {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #f0f0f0;
}

.exits {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #9a9a9a;
  flex-shrink: 0;
}

.exitBtn {
  background: transparent;
  border: none;
  padding: 1px 3px;
  font-size: 0.7rem;
  color: #e0e0e0;
  cursor: pointer;
}
```

```tsx
// apps/game-client/src/components/hud/CompactRoomRow.tsx
import React from 'react';
import styles from '../../styles/hud/CompactRoomRow.module.scss';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { useRoomHeader } from '../../hooks/useRoomHeader';
import { useCompassBlock, type CompassDirection } from '../../hooks/useCompassBlock';

const EXIT_ORDER: CompassDirection[] = ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'];

export const CompactRoomRow: React.FC = () => {
  // characterName isn't rendered in this row today (the room name + exits
  // took the space) but the hook is exercised here since this is where the
  // spec originally placed it (§4.2) — Task 9 uses it for the terminal
  // panel title instead. Kept as a documented, intentional no-render use
  // so the hook has a real consumer even before Task 9 lands, per TDD step
  // ordering; remove this comment once Task 9 is merged and this becomes
  // moot.
  useCharacterIdentity();

  const { roomName } = useRoomHeader();
  const { hasExit, move } = useCompassBlock();

  const availableExits = EXIT_ORDER.filter((dir) => hasExit(dir));

  return (
    <div className={`${styles.root} sa-hud-room-row`}>
      <span className={styles.roomName}>{roomName}</span>
      <span className={`${styles.exits} sa-hud-room-exits`}>
        {'['}
        {availableExits.map((dir) => (
          <button
            key={dir}
            type="button"
            className={`${styles.exitBtn} sa-hud-room-exit`}
            data-available="true"
            onClick={() => move(dir)}
          >
            {dir}
          </button>
        ))}
        {']'}
      </span>
    </div>
  );
};

export default CompactRoomRow;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactRoomRow`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/components/hud/CompactRoomRow.tsx apps/game-client/src/styles/hud/CompactRoomRow.module.scss apps/game-client/src/components/hud/CompactRoomRow.test.tsx
git commit -m "feat(hud): add CompactRoomRow component"
```

---

## Task 9: Bordered panel title mixin (terminal title)

**Files:**
- Create: `apps/game-client/src/styles/_BorderedPanel.scss`
- Test: none (pure CSS; verified visually in Task 11's manual check)

**Interfaces:**
- Produces: a `borderedPanelTitle` SCSS mixin, `@use`-able from any component's `.module.scss`, generating a `.borderedPanelTitle` class scoped inside whatever selector applies the mixin. Consumed by Task 11 (`CompactLayoutShell.module.scss`, not created until that task) for the terminal panel wrapper — this task only creates the standalone mixin file; nothing consumes it yet.

- [ ] **Step 1: Write the mixin**

```scss
// apps/game-client/src/styles/_BorderedPanel.scss
// A bordered panel with its title embedded directly in the top border
// line (classic box-drawing TUI look), e.g.:
//
//   ┌─ Aria ──────────────────────┐
//   │ ...panel content...         │
//   └──────────────────────────────┘
//
// Baseline structural element (§4.2b of the design spec) — corner radius
// and color are intentionally left to whatever theme is active; this
// mixin only establishes the shape.
@mixin borderedPanelTitle($border-color: #333, $bg-color: #000) {
  position: relative;
  border: 1px solid $border-color;
  box-sizing: border-box;

  .borderedPanelTitle {
    position: absolute;
    top: -0.7em;
    left: 12px;
    padding: 0 6px;
    background: $bg-color;
    font-size: 0.75rem;
    line-height: 1;
    white-space: nowrap;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/game-client/src/styles/_BorderedPanel.scss
git commit -m "feat(hud): add bordered-panel-title SCSS mixin"
```

(This task has no automated test — it's pure CSS with no logic to assert on. Task 11's manual verification step covers it visually, and Task 11's render test asserts the expected class/structure is present.)

---

## Task 10: `useCompactLayoutSizing` hook

Mirrors `useLayoutSizing` (in `useMainContainer.ts`) exactly in shape, with
its own independent localStorage keys (a user may want different column
widths in compact vs. classic layout) and one extra resizable dimension
for the right column's chat/affects split (spec §4.3b).

**Files:**
- Create: `apps/game-client/src/hooks/useCompactLayoutSizing.ts`
- Test: `apps/game-client/src/hooks/useCompactLayoutSizing.test.ts`

**Interfaces:**
- Produces: `useCompactLayoutSizing(): { layoutVars: CSSProperties; handleVerticalResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void; handleChatResizeMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void }`, where `layoutVars` sets `--right-pane-width` and `--sa-chat-pane-height`. Consumed by Task 11.

- [ ] **Step 1: Write the failing test**

```ts
// apps/game-client/src/hooks/useCompactLayoutSizing.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCompactLayoutSizing } from './useCompactLayoutSizing';

const LS_RIGHT_WIDTH = 'shatteredArchive.compactLayout.rightPaneWidth';
const LS_CHAT_HEIGHT = 'shatteredArchive.compactLayout.chatPaneHeight';

function fireMouseDown(handler: (e: any) => void, clientX = 0, clientY = 0) {
  act(() => {
    handler({ preventDefault: () => {}, clientX, clientY } as any);
  });
}

function fireWindowMouseMove(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(Object.assign(new Event('mousemove'), { clientX, clientY }));
  });
}

function fireWindowMouseUp() {
  act(() => {
    window.dispatchEvent(new Event('mouseup'));
  });
}

describe('useCompactLayoutSizing', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LS_RIGHT_WIDTH);
    window.localStorage.removeItem(LS_CHAT_HEIGHT);
  });

  it('defaults both variables to sane values', () => {
    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(result.current.layoutVars['--right-pane-width']).toBeDefined();
    expect(result.current.layoutVars['--sa-chat-pane-height']).toBeDefined();
  });

  it('reads persisted values on mount', () => {
    window.localStorage.setItem(LS_RIGHT_WIDTH, '300');
    window.localStorage.setItem(LS_CHAT_HEIGHT, '400');

    const { result } = renderHook(() => useCompactLayoutSizing());
    expect(result.current.layoutVars['--right-pane-width']).toBe('300px');
    expect(result.current.layoutVars['--sa-chat-pane-height']).toBe('400px');
  });

  it('dragging the vertical resizer updates --right-pane-width and persists it', () => {
    window.localStorage.setItem(LS_RIGHT_WIDTH, '300');
    const { result } = renderHook(() => useCompactLayoutSizing());

    fireMouseDown(result.current.handleVerticalResizeMouseDown, 500, 0);
    fireWindowMouseMove(450, 0); // dragged left by 50 -> right pane grows by 50
    fireWindowMouseUp();

    expect(result.current.layoutVars['--right-pane-width']).toBe('350px');
    expect(window.localStorage.getItem(LS_RIGHT_WIDTH)).toBe('350');
  });

  it('dragging the chat resizer updates --sa-chat-pane-height and persists it', () => {
    window.localStorage.setItem(LS_CHAT_HEIGHT, '400');
    const { result } = renderHook(() => useCompactLayoutSizing());

    fireMouseDown(result.current.handleChatResizeMouseDown, 0, 500);
    fireWindowMouseMove(0, 460); // dragged up by 40 -> chat pane shrinks by 40
    fireWindowMouseUp();

    expect(result.current.layoutVars['--sa-chat-pane-height']).toBe('360px');
    expect(window.localStorage.getItem(LS_CHAT_HEIGHT)).toBe('360');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- useCompactLayoutSizing`
Expected: FAIL — `Cannot find module './useCompactLayoutSizing'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/game-client/src/hooks/useCompactLayoutSizing.ts
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type React from 'react';

const MIN_RIGHT_WIDTH = 220;
const MAX_RIGHT_WIDTH = 640;
const MIN_CHAT_HEIGHT = 120;
const MAX_CHAT_HEIGHT = 900;

const LS_RIGHT_WIDTH = 'shatteredArchive.compactLayout.rightPaneWidth';
const LS_CHAT_HEIGHT = 'shatteredArchive.compactLayout.chatPaneHeight';

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function useCompactLayoutSizing() {
  const [rightWidth, setRightWidth] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LS_RIGHT_WIDTH);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH) : 320;
    } catch {
      return 320;
    }
  });

  const [chatHeight, setChatHeight] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LS_CHAT_HEIGHT);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? clamp(n, MIN_CHAT_HEIGHT, MAX_CHAT_HEIGHT) : 400;
    } catch {
      return 400;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_RIGHT_WIDTH, String(rightWidth));
    } catch {
      // ignore
    }
  }, [rightWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_CHAT_HEIGHT, String(chatHeight));
    } catch {
      // ignore
    }
  }, [chatHeight]);

  const layoutVars: CSSProperties = {
    '--right-pane-width': `${rightWidth}px`,
    '--sa-chat-pane-height': `${chatHeight}px`,
  } as CSSProperties;

  const handleVerticalResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setRightWidth(clamp(startWidth + delta, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH));
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [rightWidth],
  );

  const handleChatResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = chatHeight;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY; // dragged up (negative) => shrink
        setChatHeight(clamp(startHeight + delta, MIN_CHAT_HEIGHT, MAX_CHAT_HEIGHT));
      };
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [chatHeight],
  );

  return { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- useCompactLayoutSizing`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/game-client/src/hooks/useCompactLayoutSizing.ts apps/game-client/src/hooks/useCompactLayoutSizing.test.ts
git commit -m "feat(hud): add useCompactLayoutSizing hook"
```

---

## Task 11: `CompactLayoutShell` composition

Assembles everything from Tasks 4, 6, 7, 8, 9, 10 plus the reused
`Terminal`, `CommandInput`, `ChatPane`, `AffectsBlock` into the actual
2-column layout. Fluid/intrinsic sizing by default (spec §4.3b) — only the
two resizer-driven dimensions get a fixed CSS variable; everything else is
ordinary flexbox sizing to content.

**Files:**
- Create: `apps/game-client/src/components/hud/CompactLayoutShell.tsx`
- Create: `apps/game-client/src/styles/hud/CompactLayoutShell.module.scss`
- Test: `apps/game-client/src/components/hud/CompactLayoutShell.test.tsx`

**Interfaces:**
- Consumes: `useCompactLayoutSizing` (Task 10), `CompactVitalsRow` (Task 7), `CompactRoomRow` (Task 8), `CompactWidgetSlot` (Task 6), `useCharacterIdentity` (Task 1, for the terminal title), the `borderedPanelTitle` mixin (Task 9), and the existing `Terminal`, `CommandInput`, `ChatPane`, `AffectsBlock` components (all reused with their existing prop shapes — `CommandInput`'s props: `isConnected: boolean; sendRaw: (data: string) => void; onOpenAutoLeveling?: () => void; autoLevelMode?: AutoLevelMode; autoLevelRunState?: AutoLevelRunState; onSightseeRescan?: () => void`, matching `LayoutShellProps` today).
- Produces: `<CompactLayoutShell isConnected sendRaw onOpenAutoLeveling? autoLevelMode? autoLevelRunState? onSightseeRescan? />` — same prop shape `LayoutShell` takes today minus `layoutVars`/`onVerticalResizeMouseDown`/`onHorizontalResizeMouseDown`/`BottomPaneComponent` (compact layout owns its own sizing internally and has no bottom-pane tab strip). Consumed by Task 14 (`MainContainer.tsx`).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/components/hud/CompactLayoutShell.test.tsx
import { render, screen } from '@testing-library/react';
import { CompactLayoutShell } from './CompactLayoutShell';

jest.mock('../../hooks/useCharacterIdentity', () => ({
  useCharacterIdentity: () => ({ characterName: 'Aria' }),
}));
jest.mock('./CompactVitalsRow', () => ({ CompactVitalsRow: () => <div>vitals-row</div> }));
jest.mock('./CompactRoomRow', () => ({ CompactRoomRow: () => <div>room-row</div> }));
jest.mock('./CompactWidgetSlot', () => ({
  CompactWidgetSlot: ({ slotId }: { slotId: string }) => <div>widget-slot:{slotId}</div>,
}));
jest.mock('../Terminal', () => ({ __esModule: true, default: () => <div>terminal</div> }));
jest.mock('../ChatPane', () => ({ ChatPane: () => <div>chat-pane</div> }));
jest.mock('../AffectsBlock', () => ({ __esModule: true, default: () => <div>affects-block</div> }));
jest.mock('../CommandInput', () => ({
  __esModule: true,
  default: () => <div>command-input</div>,
}));

describe('CompactLayoutShell', () => {
  const baseProps = { isConnected: true, sendRaw: jest.fn() };

  it('renders the terminal, vitals row, room row, both widget slots, chat, and affects', () => {
    render(<CompactLayoutShell {...baseProps} />);

    expect(screen.getByText('terminal')).toBeInTheDocument();
    expect(screen.getByText('vitals-row')).toBeInTheDocument();
    expect(screen.getByText('room-row')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.bottomStrip')).toBeInTheDocument();
    expect(screen.getByText('widget-slot:hud.rightColumn')).toBeInTheDocument();
    expect(screen.getByText('command-input')).toBeInTheDocument();
    expect(screen.getByText('chat-pane')).toBeInTheDocument();
    expect(screen.getByText('affects-block')).toBeInTheDocument();
  });

  it('shows the character name as the terminal panel title', () => {
    render(<CompactLayoutShell {...baseProps} />);
    expect(screen.getByText('Aria')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactLayoutShell`
Expected: FAIL — `Cannot find module './CompactLayoutShell'`

- [ ] **Step 3: Write minimal implementation**

```scss
// apps/game-client/src/styles/hud/CompactLayoutShell.module.scss
@use '../BorderedPanel' as bp;

.shell {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.leftColumn {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
}

.terminalPanel {
  @include bp.borderedPanelTitle(#333, #050505);
  flex: 1;
  min-height: 0;
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.subWindow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.verticalResizer {
  width: 4px;
  cursor: col-resize;
  background: #252525;
  flex-shrink: 0;
}

.rightColumn {
  width: var(--right-pane-width);
  min-width: 220px;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 6px;
  gap: 6px;
}

.chatPane {
  height: var(--sa-chat-pane-height);
  min-height: 120px;
  display: flex;
  overflow: hidden;
  border-radius: 8px;
}

.chatResizer {
  height: 4px;
  cursor: row-resize;
  background: #252525;
  flex-shrink: 0;
}

.affectsAndSlot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

```tsx
// apps/game-client/src/components/hud/CompactLayoutShell.tsx
import React from 'react';
import styles from '../../styles/hud/CompactLayoutShell.module.scss';
import { useCompactLayoutSizing } from '../../hooks/useCompactLayoutSizing';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { CompactVitalsRow } from './CompactVitalsRow';
import { CompactRoomRow } from './CompactRoomRow';
import { CompactWidgetSlot } from './CompactWidgetSlot';
import Terminal from '../Terminal';
import CommandInput from '../CommandInput';
import { ChatPane } from '../ChatPane';
import AffectsBlock from '../AffectsBlock';
import { AutoLevelMode, AutoLevelRunState } from '../../features/autoleveling/autoleveling-types';

export interface CompactLayoutShellProps {
  isConnected: boolean;
  sendRaw: (data: string) => void;
  onOpenAutoLeveling?: () => void;
  autoLevelMode?: AutoLevelMode;
  autoLevelRunState?: AutoLevelRunState;
  onSightseeRescan?: () => void;
}

export const CompactLayoutShell: React.FC<CompactLayoutShellProps> = ({
  isConnected,
  sendRaw,
  onOpenAutoLeveling,
  autoLevelMode,
  autoLevelRunState,
  onSightseeRescan,
}) => {
  const { layoutVars, handleVerticalResizeMouseDown, handleChatResizeMouseDown } = useCompactLayoutSizing();
  const { characterName } = useCharacterIdentity();

  return (
    <div className={`${styles.shell} sa-hud-shell`} style={layoutVars}>
      <div className={styles.leftColumn}>
        <div className={`${styles.terminalPanel} sa-hud-terminal-panel`}>
          {characterName && <span className={`${styles.borderedPanelTitle} sa-hud-terminal-title`}>{characterName}</span>}
          <Terminal />
        </div>

        <div className={`${styles.subWindow} sa-hud-sub-window`}>
          <CompactVitalsRow />
          <CompactRoomRow />
          <CompactWidgetSlot slotId="hud.bottomStrip" />
          <CommandInput
            isConnected={isConnected}
            sendRaw={sendRaw}
            onOpenAutoLeveling={onOpenAutoLeveling}
            autoLevelMode={autoLevelMode}
            autoLevelRunState={autoLevelRunState}
            onSightseeRescan={onSightseeRescan}
          />
        </div>
      </div>

      <div className={styles.verticalResizer} onMouseDown={handleVerticalResizeMouseDown} />

      <div className={`${styles.rightColumn} sa-hud-right-column`}>
        <div className={`${styles.chatPane} sa-hud-chat-pane`}>
          <ChatPane />
        </div>

        <div className={styles.chatResizer} onMouseDown={handleChatResizeMouseDown} />

        <div className={styles.affectsAndSlot}>
          <AffectsBlock />
          <CompactWidgetSlot slotId="hud.rightColumn" />
        </div>
      </div>
    </div>
  );
};

export default CompactLayoutShell;
```

The title `<span>` uses `styles.borderedPanelTitle` (the module's scoped
class) rather than a literal string, because Task 9's mixin generates
`.borderedPanelTitle` *nested inside* whatever selector applies the mixin —
here that's `.terminalPanel` — so it compiles to a scoped selector like
`CompactLayoutShell_terminalPanel__xxx
.CompactLayoutShell_borderedPanelTitle__yyy`, not a global class name.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactLayoutShell`
Expected: PASS (2 tests)

- [ ] **Step 5: Manual verification in a real browser**

Run the dev server, open Settings → Graphics (Task 13 will have added the
toggle by the time this is exercised end-to-end — for now, temporarily
render `<CompactLayoutShell isConnected={false} sendRaw={() => {}} />`
directly in place of `<LayoutShell .../>` in `MainContainer.tsx` to
eyeball it, then revert that temporary edit). Verify: terminal shows with
the character name embedded in its top border once connected and
identified; vitals/room/input stack below it; chat/affects stack on the
right; both resizers drag smoothly; nothing overlaps at both a small
laptop-width window and a wide external-monitor-width window.

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/src/components/hud/CompactLayoutShell.tsx apps/game-client/src/styles/hud/CompactLayoutShell.module.scss apps/game-client/src/components/hud/CompactLayoutShell.test.tsx
git commit -m "feat(hud): add CompactLayoutShell composition"
```

---

## Task 12: Slate & Amber theme CSS + conditional loading

Baseline styling (Tasks 6-11) is plain and functional. This task adds the
actual Slate & Amber / Soft Glow visual skin as a separate, optional CSS
asset targeting the `sa-hud-*` class names and `data-*` attributes
established in every component above — none of those files change here.

**Files:**
- Create: `apps/game-client/public/themes/slate-amber.css`
- Create: `apps/game-client/src/features/hudLayout/hudThemeLoader.ts`
- Test: `apps/game-client/src/features/hudLayout/hudThemeLoader.test.ts`

**Interfaces:**
- Consumes: `getHudTheme` (Task 2).
- Produces: `applyHudTheme(theme: HudTheme): void` — injects or removes a `<link id="hud-theme-style">` pointing at `/themes/slate-amber.css`. Consumed by Task 14 (`MainContainer.tsx`, called once on mount and whenever the setting changes) and Task 13 (called immediately when the theme selector changes, for a live preview).

- [ ] **Step 1: Write the failing test**

```ts
// apps/game-client/src/features/hudLayout/hudThemeLoader.test.ts
import { applyHudTheme } from './hudThemeLoader';

describe('applyHudTheme', () => {
  afterEach(() => {
    document.getElementById('hud-theme-style')?.remove();
  });

  it('injects a stylesheet link for slate-amber', () => {
    applyHudTheme('slate-amber');
    const link = document.getElementById('hud-theme-style') as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link!.rel).toBe('stylesheet');
    expect(link!.href).toContain('/themes/slate-amber.css');
  });

  it('removes the stylesheet link for default', () => {
    applyHudTheme('slate-amber');
    expect(document.getElementById('hud-theme-style')).not.toBeNull();

    applyHudTheme('default');
    expect(document.getElementById('hud-theme-style')).toBeNull();
  });

  it('is idempotent when called twice with the same theme', () => {
    applyHudTheme('slate-amber');
    applyHudTheme('slate-amber');
    expect(document.querySelectorAll('#hud-theme-style').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudThemeLoader`
Expected: FAIL — `Cannot find module './hudThemeLoader'`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/game-client/src/features/hudLayout/hudThemeLoader.ts
import type { HudTheme } from './hudThemeStore';

const LINK_ID = 'hud-theme-style';
const THEME_HREF: Partial<Record<HudTheme, string>> = {
  'slate-amber': '/themes/slate-amber.css',
};

export function applyHudTheme(theme: HudTheme): void {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  const href = THEME_HREF[theme];

  if (!href) {
    existing?.remove();
    return;
  }

  if (existing) {
    if (!existing.href.endsWith(href)) existing.href = href;
    return;
  }

  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @shatteredarchive/game-client test -- hudThemeLoader`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the theme CSS asset**

A real, working starting point — establishes the visual language
(near-black panels, amber accent, soft glow, rounded corners per the
confirmed decision to keep the terminal panel rounded too) rather than a
complete pixel-polished pass. Refining it is a live, visual iteration loop
(same as the rest of this feature's styling work), not something to
finalize blind here.

```css
/* apps/game-client/public/themes/slate-amber.css */
:root {
  --sa-accent: #e0a94a;
  --sa-accent-glow: rgba(224, 169, 74, 0.45);
  --sa-panel-bg: #111113;
  --sa-panel-border: #232323;
}

.sa-hud-shell {
  background: #0c0c0d;
}

.sa-hud-terminal-panel,
.sa-hud-vitals-row,
.sa-hud-room-row,
.sa-hud-chat-pane,
[class*='affectsBlock_'],
.sa-hud-widget-slot {
  background: var(--sa-panel-bg);
  border-color: var(--sa-panel-border);
  border-radius: 8px;
}

.sa-hud-terminal-title {
  color: var(--sa-accent);
  text-shadow: 0 0 6px var(--sa-accent-glow);
}

.sa-hud-vitals-fill-move {
  background: var(--sa-accent);
  box-shadow: 0 0 6px 1px var(--sa-accent-glow);
}

.sa-hud-vitals-fill-hp[data-hp-warning='true'] {
  box-shadow: 0 0 6px 1px rgba(220, 60, 60, 0.5);
}

.sa-hud-room-exit[data-available='true'] {
  color: var(--sa-accent);
  text-shadow: 0 0 5px var(--sa-accent-glow);
}

#game-command-input:focus {
  border-color: var(--sa-accent) !important;
  box-shadow: 0 0 8px var(--sa-accent-glow) !important;
}

.sa-hud-widget-slot[data-variant='warning'] {
  color: #e0c04a;
}

.sa-hud-widget-slot[data-variant='critical'] {
  color: #e05a4a;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/public/themes/slate-amber.css apps/game-client/src/features/hudLayout/hudThemeLoader.ts apps/game-client/src/features/hudLayout/hudThemeLoader.test.ts
git commit -m "feat(hud): add Slate & Amber theme CSS and loader"
```

---

## Task 13: `GraphicsSettingsModal` — Layout section

**Files:**
- Modify: `apps/game-client/src/components/GraphicsSettingsModal.tsx`
- Test: `apps/game-client/src/components/GraphicsSettingsModal.test.tsx` (new — no existing test file for this component)

**Interfaces:**
- Consumes: `getHudLayout`/`setHudLayout` (Task 2), `getHudTheme`/`setHudTheme` (Task 2), `applyHudTheme` (Task 12).
- Produces: nothing new consumed elsewhere — this is a leaf UI task.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/components/GraphicsSettingsModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { GraphicsSettingsModal } from './GraphicsSettingsModal';
import { getHudLayout, setHudLayout } from '../features/hudLayout/hudLayoutStore';
import { getHudTheme } from '../features/hudLayout/hudThemeStore';

describe('GraphicsSettingsModal — Layout section', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a Layout nav item, defaulting to classic', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));
    expect(screen.getByLabelText('HUD layout')).toHaveValue('classic');
  });

  it('changing the layout selector persists immediately (not gated behind Save)', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    fireEvent.change(screen.getByLabelText('HUD layout'), { target: { value: 'compact' } });

    expect(getHudLayout()).toBe('compact');
  });

  it('the theme selector only appears when compact layout is selected', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    expect(screen.queryByLabelText('HUD theme')).toBeNull();

    fireEvent.change(screen.getByLabelText('HUD layout'), { target: { value: 'compact' } });
    expect(screen.getByLabelText('HUD theme')).toBeInTheDocument();
  });

  it('changing the theme selector persists immediately', () => {
    setHudLayout('compact');
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    fireEvent.change(screen.getByLabelText('HUD theme'), { target: { value: 'slate-amber' } });
    expect(getHudTheme()).toBe('slate-amber');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- GraphicsSettingsModal`
Expected: FAIL — no "Layout" nav item exists yet

- [ ] **Step 3: Implement the section**

In `apps/game-client/src/components/GraphicsSettingsModal.tsx`:

1. Add imports:

```ts
import { getHudLayout, setHudLayout, type HudLayoutMode } from '../features/hudLayout/hudLayoutStore';
import { getHudTheme, setHudTheme, type HudTheme } from '../features/hudLayout/hudThemeStore';
import { applyHudTheme } from '../features/hudLayout/hudThemeLoader';
```

2. Widen the nav key type: `type GraphicsNavKey = 'rendering' | 'layout';`

3. Add state, seeded/reset the same way `config`/`draft` are (in the existing "Reset draft on open/close" effect, add two more lines reading the two stores):

```ts
  const [hudLayout, setHudLayoutState] = useState<HudLayoutMode>(() => getHudLayout());
  const [hudTheme, setHudThemeState] = useState<HudTheme>(() => getHudTheme());
```

   and inside the existing `useEffect(() => { if (isOpen) { ... } }, [isOpen])`, add:

```ts
      setHudLayoutState(getHudLayout());
      setHudThemeState(getHudTheme());
```

4. Add the nav item to `navItems`:

```ts
    { key: 'layout', label: 'Layout', hint: 'HUD arrangement' },
```

5. Add the section, as a sibling to the existing `{activeNav === 'rendering' && ( ... )}` block, applying immediately on change (not gated behind the modal's Save/Discard, which is scoped to `GraphicsConfig` only):

```tsx
            {activeNav === 'layout' && (
              <div className={styles.section}>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>HUD layout</div>
                  <select
                    aria-label="HUD layout"
                    value={hudLayout}
                    onChange={(e) => {
                      const next = e.target.value as HudLayoutMode;
                      setHudLayoutState(next);
                      setHudLayout(next);
                    }}
                  >
                    <option value="classic">Classic</option>
                    <option value="compact">Compact</option>
                  </select>
                </label>

                {hudLayout === 'compact' && (
                  <label className={styles.field}>
                    <div className={styles.fieldLabel}>HUD theme</div>
                    <select
                      aria-label="HUD theme"
                      value={hudTheme}
                      onChange={(e) => {
                        const next = e.target.value as HudTheme;
                        setHudThemeState(next);
                        setHudTheme(next);
                        applyHudTheme(next);
                      }}
                    >
                      <option value="default">Default</option>
                      <option value="slate-amber">Slate &amp; Amber</option>
                    </select>
                  </label>
                )}
              </div>
            )}
```

6. Update the `paneTitle` line to cover the new nav key:

```tsx
              <div className={styles.paneTitle}>
                {activeNav === 'rendering' ? 'Rendering' : activeNav === 'layout' ? 'Layout' : ''}
              </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @shatteredarchive/game-client test -- GraphicsSettingsModal`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full game-client test suite**

Run: `pnpm --filter @shatteredarchive/game-client test`
Expected: PASS — confirms the `GraphicsSettingsModal` edit didn't regress its existing `rendering` section behavior

- [ ] **Step 6: Commit**

```bash
git add apps/game-client/src/components/GraphicsSettingsModal.tsx apps/game-client/src/components/GraphicsSettingsModal.test.tsx
git commit -m "feat(hud): add Layout section to GraphicsSettingsModal"
```

---

## Task 14: `MainContainer` — pick shell by setting, gated to desktop widths

Mobile must always get the classic layout, regardless of the `hudLayout`
setting — compact layout has no mobile-responsive behavior of its own
(spec §6). Mirrors the existing `isSmallScreen` viewport-check pattern
already used in `GraphicsSettingsModal.tsx`, at this codebase's standard
900px breakpoint (not that file's unrelated 768px).

**Files:**
- Modify: `apps/game-client/src/pages/MainContainer.tsx`
- Test: `apps/game-client/src/pages/MainContainer.test.tsx` (new — no existing test file for this component)

**Interfaces:**
- Consumes: `getHudLayout` (Task 2), `applyHudTheme`, `getHudTheme` (Task 12/2), `CompactLayoutShell` (Task 11).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/game-client/src/pages/MainContainer.test.tsx
import { render, screen } from '@testing-library/react';
import { MainContainer } from './MainContainer';
import { setHudLayout } from '../features/hudLayout/hudLayoutStore';

jest.mock('../components/LayoutShell', () => ({ __esModule: true, default: () => <div>classic-shell</div> }));
jest.mock('../components/hud/CompactLayoutShell', () => ({
  __esModule: true,
  default: () => <div>compact-shell</div>,
}));
// MainContainer pulls in a lot of app wiring (connection, plugins, etc.) —
// this test only exercises the shell-selection branch, so everything else
// it touches needs a minimal mock. Match whatever this file's other tests
// (if any exist elsewhere for MainContainer-adjacent components) already
// mock; if none exist, mock useGameConnection/usePlugins/useAutoLeveling/
// useMainContainer to their simplest non-throwing shape.

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('MainContainer — shell selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1440);
  });

  it('renders the classic shell by default', () => {
    render(<MainContainer />);
    expect(screen.getByText('classic-shell')).toBeInTheDocument();
  });

  it('renders the compact shell when the setting is on and the viewport is desktop-width', () => {
    setHudLayout('compact');
    render(<MainContainer />);
    expect(screen.getByText('compact-shell')).toBeInTheDocument();
  });

  it('falls back to the classic shell on a mobile-width viewport even if compact is selected', () => {
    setHudLayout('compact');
    setViewportWidth(600);
    render(<MainContainer />);
    expect(screen.getByText('classic-shell')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @shatteredarchive/game-client test -- MainContainer`
Expected: FAIL — compact shell never renders (no selection logic yet)

- [ ] **Step 3: Implement the selection logic**

In `apps/game-client/src/pages/MainContainer.tsx`:

1. Add imports:

```ts
import CompactLayoutShell from '../components/hud/CompactLayoutShell';
import { getHudLayout } from '../features/hudLayout/hudLayoutStore';
import { getHudTheme } from '../features/hudLayout/hudThemeStore';
import { applyHudTheme } from '../features/hudLayout/hudThemeLoader';
```

2. Add state + a resize listener + the theme-apply-on-mount effect, near the top of the component body (alongside the existing `useVisualViewportHeight()`/`useAuthCallback()` calls):

```ts
  const [hudLayout] = React.useState(() => getHudLayout());
  const [isDesktopWidth, setIsDesktopWidth] = React.useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth > 900,
  );

  React.useEffect(() => {
    const onResize = () => setIsDesktopWidth(window.innerWidth > 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    applyHudTheme(getHudTheme());
  }, []);

  const useCompactShell = hudLayout === 'compact' && isDesktopWidth;
```

3. Replace the existing:

```tsx
      <FocusBarVitals />

      <LayoutShell
        layoutVars={layoutVars}
        onVerticalResizeMouseDown={handleVerticalResizeMouseDown}
        onHorizontalResizeMouseDown={handleHorizontalResizeMouseDown}
        BottomPaneComponent={BottomPane}
        isConnected={gameConn.isConnected}
        sendRaw={gameConn.sendRaw}
        autoLevelMode={auto.config.mode}
        autoLevelRunState={auto.runState}
        onSightseeRescan={auto.rescanRoom}
      />
```

   with:

```tsx
      <FocusBarVitals />

      {useCompactShell ? (
        <CompactLayoutShell
          isConnected={gameConn.isConnected}
          sendRaw={gameConn.sendRaw}
          onOpenAutoLeveling={handleOpenAutoLeveling}
          autoLevelMode={auto.config.mode}
          autoLevelRunState={auto.runState}
          onSightseeRescan={auto.rescanRoom}
        />
      ) : (
        <LayoutShell
          layoutVars={layoutVars}
          onVerticalResizeMouseDown={handleVerticalResizeMouseDown}
          onHorizontalResizeMouseDown={handleHorizontalResizeMouseDown}
          BottomPaneComponent={BottomPane}
          isConnected={gameConn.isConnected}
          sendRaw={gameConn.sendRaw}
          autoLevelMode={auto.config.mode}
          autoLevelRunState={auto.runState}
          onSightseeRescan={auto.rescanRoom}
        />
      )}
```

(Note: `LayoutShell`'s existing usage doesn't pass `onOpenAutoLeveling` — checking the current file, that's already the case there, so this is a genuinely new prop only for the compact path. `CompactLayoutShell`'s prop type from Task 11 already declares it optional.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @shatteredarchive/game-client test -- MainContainer`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full game-client test suite**

Run: `pnpm --filter @shatteredarchive/game-client test`
Expected: PASS

- [ ] **Step 6: Manual verification in a real browser**

Dev server, toggle the new Layout setting on/off, resize the browser
window across the 900px boundary with compact selected, confirm it snaps
back to classic below 900px and back to compact above it.

- [ ] **Step 7: Commit**

```bash
git add apps/game-client/src/pages/MainContainer.tsx apps/game-client/src/pages/MainContainer.test.tsx
git commit -m "feat(hud): wire compact layout selection into MainContainer"
```

---

## Task 15: End-to-end widget-slot verification

Proves the full chain — a plugin calling `api.setHudWidget` through
`pluginHost`, landing in the registry, rendered by `CompactWidgetSlot`
inside the real `CompactLayoutShell` — works together, not just each piece
in isolation. Stands in for a real first-party producer (e.g. AutoLeveling
publishing the current enemy name): `feature/AutoLevel-Redesign` is a
separate, unmerged branch whose `useAutoLeveling.ts` doesn't have this
plumbing on `release/dev` today, so wiring an actual AutoLeveling call is
explicitly out of scope here — this test proves the *contract* works
identically well for any future producer, first-party or plugin.

**Files:**
- Create: `apps/game-client/src/components/hud/CompactLayoutShell.integration.test.tsx`

**Interfaces:**
- Consumes: `pluginHost` (Task 5), `CompactLayoutShell` (Task 11).

- [ ] **Step 1: Write the test**

```tsx
// apps/game-client/src/components/hud/CompactLayoutShell.integration.test.tsx
import { render, screen } from '@testing-library/react';
import { CompactLayoutShell } from './CompactLayoutShell';
import { pluginHost } from '../../features/plugins/pluginHost';
import type { PluginRuntimeApi } from '@shatteredarchive/types-client';

jest.mock('../../hooks/useCharacterIdentity', () => ({ useCharacterIdentity: () => ({ characterName: null }) }));
jest.mock('../../hooks/useRoomHeader', () => ({ useRoomHeader: () => ({ roomName: '', roomFlags: '' }) }));
jest.mock('../../hooks/useCompassBlock', () => ({ useCompassBlock: () => ({ hasExit: () => false, move: jest.fn() }) }));
jest.mock('../../hooks/useLayoutShell', () => ({
  useStatusBlockViewModel: () => ({
    remaining: '',
    vitals: { hp: 1, hpMax: 1, mp: 1, mpMax: 1, stamina: 1, staminaMax: 1 },
    hpPct: 100,
    mpPct: 100,
    staPct: 100,
  }),
}));
jest.mock('../../hooks/useOpponentStatus', () => ({
  useOpponentStatus: () => ({ enemyUi: { lastSeenTs: 0, label: '', pct: 0, statusText: '' }, isEnemyActive: false, damageChunk: null }),
}));
jest.mock('../Terminal', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../ChatPane', () => ({ ChatPane: () => <div /> }));
jest.mock('../AffectsBlock', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../CommandInput', () => ({ __esModule: true, default: () => <div /> }));

describe('widget slot end-to-end (plugin -> registry -> CompactLayoutShell)', () => {
  it('a plugin publishing via PluginRuntimeApi shows up in the real rendered layout', () => {
    pluginHost.setConnection('integration-test');
    let api: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'autoleveling-stand-in', name: 'AutoLeveling stand-in', version: '1.0.0' },
      onEnable: (a) => {
        api = a;
      },
    });
    pluginHost.enable('autoleveling-stand-in');

    render(<CompactLayoutShell isConnected sendRaw={jest.fn()} />);
    expect(screen.queryByText('A rabid wolf')).toBeNull();

    api!.setHudWidget('hud.rightColumn', { label: 'Enemy', value: 'A rabid wolf' });
    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();

    pluginHost.disable('autoleveling-stand-in');
    expect(screen.queryByText('A rabid wolf')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect it to already pass**

Run: `pnpm --filter @shatteredarchive/game-client test -- CompactLayoutShell.integration`
Expected: PASS — every piece this test exercises was already built and unit-tested in Tasks 3/5/6/11; this test's job is proving the wiring between them, not introducing new behavior. If it fails, that's a real integration bug between already-"passing" units — fix the wiring (not the test) before moving on.

- [ ] **Step 3: Commit**

```bash
git add apps/game-client/src/components/hud/CompactLayoutShell.integration.test.tsx
git commit -m "test(hud): end-to-end widget slot verification"
```

---

## Final check: full suite

- [ ] Run: `pnpm --filter @shatteredarchive/game-client test`
- [ ] Expected: PASS, no regressions anywhere in `apps/game-client`
- [ ] Manual pass in a real browser covering: classic layout unchanged with the feature off; compact layout on, both resizers, both themes, the terminal title, exits row, widget slots empty and occupied, and the 900px mobile fallback (Task 14, Step 6, repeated once everything is merged together)

---

## Rework note — 2026-09-20

This plan (and its spec, `2026-09-14-custom-hud-layout-design.md`) describes the
original implementation as submitted in community PR #151
(`hex337/Shattered-Archive:Feature/custom-hud-layout`). TournyMasterBot's review
of that PR came back CHANGES_REQUESTED; hex337 gave an explicit go-ahead to take
the branch over rather than iterate on it in place. That rework happened on
`feature/hud-theme-engine`, tracked in its own plan document,
`.ai-plans/20260920-0005-hud-theme-engine.md` — that doc's "Current State"
section and Progress log are the authoritative, detailed history; this note is
a summary pointer, not a replacement for it. The tasks above are left
unedited/unchecked as a historical record of the original design — they do not
reflect what actually shipped. Don't resume checking them off.

What changed, at a level someone reading only this file needs to know:

- **The core review finding**: representing "layout" and "theme" as two
  independent settings (§4.4 above) doesn't hold up once a theme's *shape*
  diverges, not just its skin — collapsed into one theme registry
  (`features/hudLayout/themeRegistry.ts`'s `THEME_REGISTRY` +
  `resolveActiveTheme`), one store (`hudThemeStore.ts`, one `HudThemeId`), one
  selector in `GraphicsSettingsModal.tsx`. See the design spec's §4.4 for the
  full replacement description — don't rely on this plan's Task list for the
  settings shape, it describes the pre-rework two-store split.
- **The review's biggest flagged issue** — two regex scanners
  (score-sheet identity, world-time period) running unconditionally on every
  line of server text in `userScriptRuntime.ts`'s hot path, for every user
  regardless of theme — fixed by moving both into a new opt-in core plugin
  (`features/plugins/core-plugins/world-time-and-identity.plugin.ts`), gated
  behind a cheap substring pre-check, auto-enabled only when `slate-amber`
  activates (via `themeRegistry.ts`'s `onActivate` hook) and independently
  toggleable off. `userScriptRuntime.ts`'s hot path has zero trace of either
  scan now.
- **An unrelated merge conflict surfaced and resolved**: PR #152 landed on
  `release/dev` first with its own fix for the same opponent-name ANSI
  rendering PR #151 had independently touched — reconciled in favor of
  `release/dev`'s approach (raw label + `ansiToHtml`), applied consistently to
  `CompactVitalsRow.tsx` too (a gap in both original PRs).
- **Slate & Amber ships as real SCSS**, not the `<link>`-swap CSS loader this
  plan's tasks describe — `styles/hud/themes/slateAmber.theme.scss`, rules
  nested under `:root[data-hud-theme='slate-amber']`, confirmed via a real
  production build to code-split into the theme's own lazy chunk.
- **Slate & Amber gained its own narrow-viewport shell**
  (`CompactLayoutShellNarrow.tsx`) instead of falling back to classic below
  900px, styled with the theme's own colors.
- **Biggest addition beyond this plan's original scope**: theme switching is
  now fully **live** — no reload required. `hudThemeId` is reactive state
  (an event `hudThemeStore.ts` dispatches on every change), `<Terminal/>` is
  hoisted into a portal target that never itself changes identity (a real bug
  in the first attempt at this was caught live via Playwright and fixed —
  see the theme-engine plan's Step 7 log), and five hooks
  (`useCharData`, `useAffectsBlock`, `useSanctuaryActive`, `useRoomHeader`,
  `useOpponentStatus`) now seed from small module-level caches so a live
  switch shows last-known state immediately instead of flashing blank.
- **Verification grew well past this plan's per-task Jest tests**: alongside
  the full suite (517/517 as of the rework's completion, up from whatever
  count this plan's tasks produced), a set of reusable Playwright scripts
  under `Shattered-AI/tools/browser-test/` (`theme-registry-check.mjs`,
  `theme-slate-amber-full.mjs`, `theme-live-switch-durability.mjs`, and
  others) verify real dev-server behavior end-to-end — this caught two real
  bugs unit tests alone could not have (a plugin/event dedup-key collision,
  and the terminal portal-identity bug above).

Read the theme-engine plan doc for anything not covered here — file paths,
exact reasoning, and the full step-by-step decision trail all live there.
