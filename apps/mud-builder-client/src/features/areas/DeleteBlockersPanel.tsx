import { useState } from 'react';
import type { RefKind } from '@shatteredarchive/merc-area';

import { deleteBlockers, removeEntity } from './model-ops.js';
import type { AreaWorkbench } from './workbench.js';

export type BlockerCategory = 'resets' | 'map' | 'mobs' | 'scripts' | 'other';

const CATEGORY_LABEL: Record<BlockerCategory, string> = {
  resets: 'Resets',
  map: 'Map (room exits)',
  mobs: 'Mobs (shops / specials)',
  scripts: 'Scripts',
  other: 'Other',
};

/**
 * deleteBlockers()'s `where` strings are built from a fixed, small set of
 * prefixes (services/merc-area/src/validate.ts collectRefs) — sniffing the
 * prefix is enough to route a reconciliation button, no extra data needed.
 */
export function categorizeBlocker(where: string): BlockerCategory {
  if (where.startsWith('reset #')) return 'resets';
  if (where.includes(' exit ')) return 'map';
  if (where.startsWith('shop:') || where.startsWith('special:')) return 'mobs';
  if (where.includes('script')) return 'scripts';
  return 'other';
}

export interface DeleteBlockersPanelProps {
  /** e.g. "room #101" */
  entityLabel: string;
  blockers: string[];
  onGoToResets?: () => void;
  onGoToMap?: () => void;
  onGoToMobs?: () => void;
  onGoToScripts?: () => void;
}

/**
 * Categorized, actionable "why can't I delete this" panel — replaces a flat
 * error toast. Each category present among the blockers gets its own group;
 * a group only gets a "Go fix it" button when the caller wired a navigation
 * callback for it (e.g. a room delete has nowhere useful to send you for a
 * "mobs" blocker beyond "switch tabs and look around" today).
 */
export default function DeleteBlockersPanel({
  entityLabel,
  blockers,
  onGoToResets,
  onGoToMap,
  onGoToMobs,
  onGoToScripts,
}: DeleteBlockersPanelProps) {
  if (blockers.length === 0) return null;

  const groups = new Map<BlockerCategory, string[]>();
  for (const b of blockers) {
    const cat = categorizeBlocker(b);
    groups.set(cat, [...(groups.get(cat) ?? []), b]);
  }
  const nav: Partial<Record<BlockerCategory, { label: string; onClick: () => void }>> = {
    ...(onGoToResets && { resets: { label: 'Go fix it in Resets →', onClick: onGoToResets } }),
    ...(onGoToMap && { map: { label: 'Go fix it on the Map →', onClick: onGoToMap } }),
    ...(onGoToMobs && { mobs: { label: 'Go fix it in Mobs →', onClick: onGoToMobs } }),
    ...(onGoToScripts && { scripts: { label: 'Go fix it in Scripts →', onClick: onGoToScripts } }),
  };

  return (
    <div className="mb-delete-blockers" role="alert" aria-label="Delete blocked">
      <strong>⚠ Cannot delete {entityLabel} — still referenced:</strong>
      {[...groups.entries()].map(([cat, items]) => (
        <div key={cat} className="mb-delete-blockers-group">
          <h5>{CATEGORY_LABEL[cat]}</h5>
          <ul>
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
          {nav[cat] && (
            <button type="button" onClick={nav[cat]!.onClick}>
              {nav[cat]!.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export interface DeleteWithBlockers {
  blockers: string[];
  /** Checks deleteBlockers first; if clear, window.confirm's confirmMessage, then removes. */
  attemptDelete: (vnum: number, confirmMessage: string, afterDelete?: () => void) => void;
  clearBlockers: () => void;
}

/**
 * The check-block-then-confirm-then-remove flow shared by every entity
 * delete button (first used by Rooms; the same deleteBlockers/removeEntity
 * pair already backs Mobs/Objects too). Kept here, co-located with the panel
 * it feeds, so the two call sites (RoomsPage.tsx, the Areas dashboard's
 * RoomDashboardEntry) can't drift apart.
 */
export function useDeleteWithBlockers(wb: AreaWorkbench, kind: RefKind): DeleteWithBlockers {
  const [blockers, setBlockers] = useState<string[]>([]);

  const attemptDelete = (vnum: number, confirmMessage: string, afterDelete?: () => void) => {
    if (!wb.area) return;
    const found = deleteBlockers(wb.area, kind, vnum);
    if (found.length > 0) {
      setBlockers(found);
      return;
    }
    if (!window.confirm(confirmMessage)) return;
    wb.setAreaModel(removeEntity(wb.area, kind, vnum));
    setBlockers([]);
    wb.ok(`removed ${kind} #${vnum}`);
    afterDelete?.();
  };

  const clearBlockers = () => setBlockers([]);

  return { blockers, attemptDelete, clearBlockers };
}
