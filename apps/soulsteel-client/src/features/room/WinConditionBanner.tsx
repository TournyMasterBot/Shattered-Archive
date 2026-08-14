import { useState } from 'react';

import { computeWinResult } from '../../domain/gameReducer.js';
import type { RoomState, WinResult } from '../../domain/types.js';

interface WinConditionBannerProps {
  room: RoomState;
}

const LABELS: Record<'darkKnights' | 'assassins', string> = {
  darkKnights: 'The Dark Knights have won — every Assassin has been eliminated.',
  assassins: 'The Assassins have won — they now equal or outnumber the Dark Knights.',
};

/** A suggestion, never an automatic game-ending action — see the MVP plan's Constraints on
 * custom/modifier roles making the automatic tally unreliable at the edges. */
export default function WinConditionBanner({ room }: WinConditionBannerProps) {
  const result = computeWinResult(room);
  const [dismissedFor, setDismissedFor] = useState<WinResult>(null);

  if (!result || dismissedFor === result) return null;

  return (
    <div className="ss-win-banner" role="status">
      <p>{LABELS[result]}</p>
      <p className="ss-win-banner-note">Custom or modifier roles can change this — use your judgment.</p>
      <button type="button" onClick={() => setDismissedFor(result)}>
        Dismiss
      </button>
    </div>
  );
}
