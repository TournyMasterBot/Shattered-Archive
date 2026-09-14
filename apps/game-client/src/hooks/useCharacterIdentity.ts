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
