// apps/game-client/src/components/wizard/useCharacterLevel.ts

import { useEffect, useState } from 'react';
import { ListenEvent } from '../../features/event-emitter/event-dispatcher';

/**
 * The connected character's level + name from GMCP `login_data`
 * (dispatched as `game:character-login` by userScriptRuntime, snapshotted on
 * `window.__SA_EVENT_SNAPSHOTS__` for late subscribers).
 */
export function useCharacterLogin(): { level: number | null; name: string | null } {
  const [state, setState] = useState<{ level: number | null; name: string | null }>(() => {
    try {
      const snap = (window as any).__SA_EVENT_SNAPSHOTS__?.['game:character-login'];
      return {
        level: typeof snap?.level === 'number' ? snap.level : null,
        name: typeof snap?.name === 'string' ? snap.name : null,
      };
    } catch {
      return { level: null, name: null };
    }
  });

  useEffect(() => {
    return ListenEvent<any>(
      'game:character-login',
      (d) => {
        setState({
          level: typeof d?.level === 'number' ? d.level : null,
          name: typeof d?.name === 'string' ? d.name : null,
        });
      },
      { key: 'AutoLevelingWizard::game:character-login' },
    );
  }, []);

  return state;
}
