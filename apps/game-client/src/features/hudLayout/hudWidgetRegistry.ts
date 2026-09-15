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
