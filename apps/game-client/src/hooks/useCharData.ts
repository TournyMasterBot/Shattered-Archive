// apps/game-client/src/hooks/useCharData.ts
import { useEffect, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

export interface CharDataVitals {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  stamina: number;
  staminaMax: number;
}

export interface CharDataAncillary {
  carryWeight: number | null;
  carryWeightMax: number | null;
  carryWeightPct: number | null;
  isQuiet: boolean;
  isFlying: boolean;
  isRiding: boolean;
  isFighting: boolean;
  language: string | null;
}

const defaultVitals: CharDataVitals = {
  hp: 0,
  hpMax: 0,
  mp: 0,
  mpMax: 0,
  stamina: 0,
  staminaMax: 0,
};

const defaultAncillary: CharDataAncillary = {
  carryWeight: null,
  carryWeightMax: null,
  carryWeightPct: null,
  isQuiet: false,
  isFlying: false,
  isRiding: false,
  isFighting: false,
  language: null,
};

export function useCharData() {
  const [vitals, setVitals] = useState<CharDataVitals>(defaultVitals);
  const [ancillary, setAncillary] = useState<CharDataAncillary>(defaultAncillary);

  useEffect(() => {
    const dispose = ListenEvent<any>(
      'game:char-data',
      (data) => {
        const d = data ?? {};

        const hp = Number(d.hp ?? 0);
        const maxHp = Number(d.max_hp ?? 0);
        const mana = Number(d.mana ?? 0);
        const maxMana = Number(d.max_mana ?? 0);
        const move = Number(d.move ?? 0);
        const maxMove = Number(d.max_move ?? 0);

        const carryWeightRaw = Number(d.carry_weight ?? NaN);
        const canCarryWeightRaw = Number(d.can_carry_weight ?? NaN);

        const hasCarry = Number.isFinite(carryWeightRaw);
        const hasCarryMax = Number.isFinite(canCarryWeightRaw) && canCarryWeightRaw > 0;

        const carryWeight = hasCarry ? carryWeightRaw : null;
        const carryWeightMax = hasCarryMax ? canCarryWeightRaw : null;

        const carryWeightPct =
          hasCarry && hasCarryMax ? Math.max(0, Math.min(100, (carryWeightRaw / canCarryWeightRaw) * 100)) : null;

        setVitals({
          hp,
          hpMax: maxHp,
          mp: mana,
          mpMax: maxMana,
          stamina: move,
          staminaMax: maxMove,
        });

        setAncillary({
          carryWeight,
          carryWeightMax,
          carryWeightPct,
          isQuiet: !!d.is_quiet,
          isFlying: !!d.is_flying,
          isRiding: !!d.is_riding,
          isFighting: !!d.is_fighting,
          language: typeof d.language === 'string' ? d.language : null,
        });
      },
      { key: 'vitalsAncillary::game:char-data' },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return { vitals, ancillary };
}
