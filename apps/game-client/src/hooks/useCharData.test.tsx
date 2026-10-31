// char_data repeats unchanged between fights. The hook must not hand React a new object for an
// identical packet, or every HUD consumer re-renders for nothing.
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { useCharData } from './useCharData';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests, getCharData } from '../features/charData/charDataStore';

const FULL = { hp: 50, max_hp: 100, mana: 20, max_mana: 40, move: 30, max_move: 60 };

// Counts COMMITTED renders: React may call a component once more before bailing out of an
// identical state update, but a bailed-out render never commits.
function mount() {
  let commits = 0;
  const hook = renderHook(
    () => {
      const value = useCharData();
      React.useEffect(() => {
        commits += 1;
      });
      return value;
    },
  );
  return { ...hook, commits: () => commits };
}

const emit = (payload: object) => act(() => DispatchEvent('game:char-data', payload));

beforeEach(() => __resetForTests());

describe('useCharData', () => {
  it('maps a char_data packet to vitals and ancillary state', () => {
    const { result } = mount();
    emit({ ...FULL, is_fighting: true, language: 'Elvish', carry_weight: 10, can_carry_weight: 40 });

    expect(result.current.vitals).toEqual({ hp: 50, hpMax: 100, mp: 20, mpMax: 40, stamina: 30, staminaMax: 60 });
    expect(result.current.ancillary).toMatchObject({
      isFighting: true,
      language: 'Elvish',
      carryWeight: 10,
      carryWeightMax: 40,
      carryWeightPct: 25,
    });
  });

  it('keeps the SAME state objects, and does not re-render, for an identical packet', () => {
    const { result, commits } = mount();
    emit(FULL);
    const vitals = result.current.vitals;
    const ancillary = result.current.ancillary;
    const afterFirst = commits();

    emit(FULL);
    emit({ ...FULL });

    expect(result.current.vitals).toBe(vitals);
    expect(result.current.ancillary).toBe(ancillary);
    expect(commits()).toBe(afterFirst);
  });

  it('re-renders with new vitals when one value changes, leaving unchanged ancillary state alone', () => {
    const { result } = mount();
    emit(FULL);
    const ancillary = result.current.ancillary;

    emit({ ...FULL, hp: 40 });

    expect(result.current.vitals.hp).toBe(40);
    expect(result.current.ancillary).toBe(ancillary);
  });

  it('re-renders when only an ancillary flag changes', () => {
    const { result } = mount();
    emit(FULL);
    const vitals = result.current.vitals;

    emit({ ...FULL, is_flying: true });

    expect(result.current.ancillary.isFlying).toBe(true);
    expect(result.current.vitals).toBe(vitals);
  });

  it('tolerates an empty packet and leaves carry weight unset', () => {
    const { result } = mount();
    emit({});
    expect(result.current.vitals.hp).toBe(0);
    expect(result.current.ancillary.carryWeight).toBeNull();
    expect(result.current.ancillary.carryWeightMax).toBeNull();
    expect(result.current.ancillary.carryWeightPct).toBeNull();
  });

  it('still records every packet in the store that seeds remounted hooks', () => {
    const { result } = mount();
    emit(FULL);
    emit({ ...FULL, hp: 10 });

    expect(getCharData()?.vitals.hp).toBe(10);
    expect(result.current.vitals.hp).toBe(10);
  });

  it('seeds a remounted hook from the last packet', () => {
    mount();
    emit(FULL);

    const remounted = mount();

    expect(remounted.result.current.vitals.hp).toBe(50);
  });
});
