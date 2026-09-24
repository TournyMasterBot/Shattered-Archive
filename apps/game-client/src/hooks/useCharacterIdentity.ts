import { useEffect, useId, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

type IdentitySnapshot = {
  characterName?: string;
  raceName?: string;
  className?: string;
  updatedAt?: number;
};

interface CharacterIdentity {
  characterName: string | null;
  raceName: string | null;
  className: string | null;
}

function readSnapshot(): CharacterIdentity {
  const snapshot = (window as any).__SA_IDENTITY__ as IdentitySnapshot | undefined;
  return {
    characterName: snapshot?.characterName ?? null,
    raceName: snapshot?.raceName ?? null,
    className: snapshot?.className ?? null,
  };
}

export function useCharacterIdentity(): CharacterIdentity {
  const instanceId = useId();
  const [identity, setIdentity] = useState<CharacterIdentity>(() => readSnapshot());

  useEffect(() => {
    return ListenEvent<IdentitySnapshot>(
      'shatteredarchive:identity-updated',
      (payload) => {
        setIdentity({
          characterName: payload.characterName ?? null,
          raceName: payload.raceName ?? null,
          className: payload.className ?? null,
        });
      },
      { key: `useCharacterIdentity::identity-updated::${instanceId}` },
    );
  }, [instanceId]);

  return identity;
}
