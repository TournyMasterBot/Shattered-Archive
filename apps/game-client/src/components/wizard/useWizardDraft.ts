// apps/game-client/src/components/wizard/useWizardDraft.ts

import { useCallback, useState } from 'react';

import type { AutoLevelAlignment } from '../../features/autoleveling/autoleveling-types';
import type { AutoPilotArea } from '../../features/autoleveling/autoleveling-content-types';
import type { BuffRow, FightRow } from '../../features/autoleveling/autoleveling-user-data';

export type WizardMode = 'auto_level' | 'dry_run' | 'sightsee';

/** A target row as shown in the Targets step. */
export interface DraftTarget {
  lookName: string;
  engageName: string;
  level?: number;
  enabled: boolean;
  /** 'area' = from the API, 'custom' = user-added (persisted to user-data). */
  origin: 'area' | 'custom';
}

export interface WizardDraft {
  areaSlug: string | null;
  /** Full detail for the chosen area (route + targets), fetched on selection. */
  area: AutoPilotArea | null;
  targets: DraftTarget[];

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
}

export function emptyDraft(): WizardDraft {
  return {
    areaSlug: null,
    area: null,
    targets: [],
    mode: 'auto_level',
    loopRounds: true,
    playerClass: null,
    initiationCommand: '',
    buffs: [],
    fightCommands: [],
    playerAlignment: 'neutral',
    startRoom: '',
  };
}

export function useWizardDraft() {
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);

  const patch = useCallback((p: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const reset = useCallback(() => setDraft(emptyDraft()), []);

  const setArea = useCallback((slug: string, area: AutoPilotArea | null, seedTargets: DraftTarget[]) => {
    setDraft((d) => ({ ...d, areaSlug: slug, area, targets: seedTargets }));
  }, []);

  const toggleTarget = useCallback((lookName: string, enabled: boolean) => {
    setDraft((d) => ({
      ...d,
      targets: d.targets.map((t) => (t.lookName === lookName ? { ...t, enabled } : t)),
    }));
  }, []);

  const addCustomTarget = useCallback((t: { lookName: string; engageName: string }) => {
    setDraft((d) => {
      if (d.targets.some((x) => x.lookName.toLowerCase() === t.lookName.toLowerCase())) return d;
      return {
        ...d,
        targets: [...d.targets, { ...t, enabled: true, origin: 'custom' as const }],
      };
    });
  }, []);

  const removeCustomTarget = useCallback((lookName: string) => {
    setDraft((d) => ({
      ...d,
      targets: d.targets.filter((t) => !(t.origin === 'custom' && t.lookName === lookName)),
    }));
  }, []);

  return {
    draft,
    setDraft,
    patch,
    reset,
    setArea,
    toggleTarget,
    addCustomTarget,
    removeCustomTarget,
  };
}
