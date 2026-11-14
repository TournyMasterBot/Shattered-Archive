// apps/game-client/src/components/wizard/useWizardDraft.ts

import { useCallback, useState } from 'react';

import type { AutoLevelAlignment, AutoLevelRestDuringRoundRule } from '../../features/autoleveling/autoleveling-types';
import type { AutoPilotArea } from '../../features/autoleveling/autoleveling-content-types';
import type { BuffRow, FightRow } from '../../features/autoleveling/autoleveling-user-data';
import {
  targetOverrideKey,
  type UnmatchedOverride,
} from '../../features/autoleveling/autoleveling-target-overrides';

export type WizardMode = 'auto_level' | 'dry_run' | 'sightsee';

/** A target row as shown in the Targets step. */
export interface DraftTarget {
  /** Current room line: the server value, or the player's override of it. */
  lookName: string;
  /** Current kill keyword: the server value, or the player's override of it. */
  engageName: string;
  level?: number;
  /** Per-run on/off (the checkbox); not persisted. A hidden area target is never enabled. */
  enabled: boolean;
  /** 'area' = from the API, 'custom' = user-added (persisted to user-data). */
  origin: 'area' | 'custom';
  /** Custom targets: the stored record's id (absent until saved, or when no area is chosen). */
  id?: string;
  /** Area targets: the normalized ORIGINAL room line, the key a personal override is stored under. */
  key?: string;
  /** Area targets: the server's values, shown beside an edit and restored by "Reset to default". */
  defaultLookName?: string;
  defaultEngageName?: string;
  /** Area targets: the player has an override on this row (an edit and/or hidden). */
  overridden?: boolean;
  /** Area targets: the player hid this row (persisted; shown under "Hidden by you"). */
  hidden?: boolean;
}

/** Stable identity of a row across edits (the room line itself changes when the player edits it). */
export function targetRowId(t: Pick<DraftTarget, 'origin' | 'key' | 'id' | 'lookName'>): string {
  if (t.origin === 'area') return `a:${t.key ?? targetOverrideKey(t.lookName)}`;
  return `c:${t.id ?? `draft:${targetOverrideKey(t.lookName)}`}`;
}

export interface WizardDraft {
  areaSlug: string | null;
  /** Full detail for the chosen area (route + targets), fetched on selection. */
  area: AutoPilotArea | null;
  targets: DraftTarget[];
  /** The player's overrides whose area target is no longer in the served list (kept, not applied). */
  unmatchedOverrides: UnmatchedOverride[];

  mode: WizardMode;
  loopRounds: boolean;

  playerClass: string | null;
  initiationCommand: string;
  buffs: BuffRow[];
  fightCommands: FightRow[];

  /**
   * The player's own alignment, for the engine's kill-XP estimate (Combat step).
   * Default neutral = no correction. The MOB's alignment is not set here — the
   * engine reads it live from the `(Golden Aura)` / `(Red Aura)` line prefix.
   */
  playerAlignment: AutoLevelAlignment;

  /**
   * Optional reminder of where the player should stand before hitting Start — shown on
   * the Review step. Seeded from the area's own `startRoom` on selection, editable after
   * that. Purely informational: nothing checks the player's actual room against it.
   */
  startRoom: string;

  /**
   * Rest step. `restStartOfRound`/`restEndOfRound` are semicolon-separated command lists
   * (e.g. "wake;stand") — out of combat only, see AutoLevelRestConfig. `restDuringRound`
   * rules reuse those same two command lists as their "how to rest"/"how to wake" actions.
   */
  restStartOfRound: string;
  restEndOfRound: string;
  restDuringRound: AutoLevelRestDuringRoundRule[];

  /**
   * Weight step. `weightCommands` is a semicolon-separated command list (e.g. "drop gold;drop
   * silver"), same convention as the rest fields above — out of combat only, fires once when
   * carry-weight% crosses `weightAtOrAbovePct`. No separate on/off flag: a blank `weightCommands`
   * IS off. See AutoLevelWeightConfig.
   */
  weightAtOrAbovePct: number;
  weightCommands: string;
}

export function emptyDraft(): WizardDraft {
  return {
    areaSlug: null,
    area: null,
    targets: [],
    unmatchedOverrides: [],
    mode: 'auto_level',
    loopRounds: true,
    playerClass: null,
    initiationCommand: '',
    buffs: [],
    fightCommands: [],
    playerAlignment: 'neutral',
    startRoom: '',
    restStartOfRound: '',
    restEndOfRound: '',
    restDuringRound: [],
    weightAtOrAbovePct: 90,
    weightCommands: '',
  };
}

export function useWizardDraft() {
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);

  const patch = useCallback((p: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const reset = useCallback(() => setDraft(emptyDraft()), []);

  const setArea = useCallback(
    (slug: string, area: AutoPilotArea | null, seedTargets: DraftTarget[], unmatched: UnmatchedOverride[] = []) => {
      setDraft((d) => ({ ...d, areaSlug: slug, area, targets: seedTargets, unmatchedOverrides: unmatched }));
    },
    [],
  );

  /** `rid` is a row's `targetRowId`; the room line is not a stable identity once it can be edited. */
  const toggleTarget = useCallback((rid: string, enabled: boolean) => {
    setDraft((d) => ({
      ...d,
      targets: d.targets.map((t) => (targetRowId(t) === rid ? { ...t, enabled } : t)),
    }));
  }, []);

  /** Replaces fields of one row (an edit, a hide/restore, a reset); identity (`key`/`id`) never changes. */
  const editTarget = useCallback((rid: string, change: Partial<DraftTarget>) => {
    setDraft((d) => ({
      ...d,
      targets: d.targets.map((t) => (targetRowId(t) === rid ? { ...t, ...change } : t)),
    }));
  }, []);

  const addCustomTarget = useCallback((t: { lookName: string; engageName: string; id?: string }) => {
    setDraft((d) => {
      const key = targetOverrideKey(t.lookName);
      if (d.targets.some((x) => targetOverrideKey(x.lookName) === key || x.key === key)) return d;
      return {
        ...d,
        targets: [...d.targets, { ...t, enabled: true, origin: 'custom' as const }],
      };
    });
  }, []);

  const removeCustomTarget = useCallback((rid: string) => {
    setDraft((d) => ({
      ...d,
      targets: d.targets.filter((t) => !(t.origin === 'custom' && targetRowId(t) === rid)),
    }));
  }, []);

  const deleteUnmatched = useCallback((recordId: string) => {
    setDraft((d) => ({ ...d, unmatchedOverrides: d.unmatchedOverrides.filter((u) => u.id !== recordId) }));
  }, []);

  return {
    draft,
    setDraft,
    patch,
    reset,
    setArea,
    toggleTarget,
    editTarget,
    addCustomTarget,
    removeCustomTarget,
    deleteUnmatched,
  };
}
