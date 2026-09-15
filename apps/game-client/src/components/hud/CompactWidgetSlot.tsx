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
