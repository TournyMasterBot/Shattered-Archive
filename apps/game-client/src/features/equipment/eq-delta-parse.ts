// apps\game-client\src\features\equipment\eq-delta-parse.ts
import type { EqSlot } from './equipment-types';

function stripAnsi(input: string): string {
  return String(input ?? '').replace(/\u001b\[[0-9;]*m/g, '');
}

function clean(input: string): string {
  return stripAnsi(input).replace(/\r/g, '').trim();
}

export type EqDeltaEvent =
  | { kind: 'wield'; item: string; isSecondary: boolean }
  | { kind: 'wear'; slot: EqSlot; item: string }
  | { kind: 'stop_using'; item: string }
  | { kind: 'disarm' };

function matchWield(line: string): { item: string; isSecondary: boolean } | null {
  const s = clean(line);

  const m2 = s.match(/^You wield (.+) as a secondary weapon\.$/i);
  if (m2) return { item: m2[1].trim(), isSecondary: true };

  const m1 = s.match(/^You wield (.+)\.$/i);
  if (m1) return { item: m1[1].trim(), isSecondary: false };

  return null;
}

function matchStopUsing(line: string): string | null {
  const s = clean(line);
  const m = s.match(/^You stop using (.+)\.$/i);
  if (!m) return null;
  return m[1].trim();
}

function matchDisarm(line: string): boolean {
  const s = clean(line);
  return s.includes('DISARMS you and sends your weapon flying!');
}

function matchWear(line: string): { slot: EqSlot; item: string } | null {
  const s = clean(line);

  // used as light
  // WEAR: You light {item} and hold it.
  {
    const m = s.match(/^You light (.+) and hold it\.$/i);
    if (m) return { slot: 'used_as_light', item: m[1].trim() };
  }

  // held
  // WEAR: You hold {item} in your hand.
  {
    const m = s.match(/^You hold (.+) in your hand\.$/i);
    if (m) return { slot: 'held', item: m[1].trim() };
  }

  // floating nearby
  // WEAR: You release {item} and it floats next to you.
  {
    const m = s.match(/^You release (.+) and it floats next to you\.$/i);
    if (m) return { slot: 'floating_nearby', item: m[1].trim() };
  }

  // worn as quiver
  // WEAR: You put {item} on your shoulder.
  {
    const m = s.match(/^You put (.+) on your shoulder\.$/i);
    if (m) return { slot: 'worn_as_quiver', item: m[1].trim() };
  }

  // sheathed (two types)
  // WEAR: You slip {item} over your shoulder.
  {
    const m = s.match(/^You slip (.+) over your shoulder\.$/i);
    if (m) return { slot: 'sheathed', item: m[1].trim() };
  }
  // WEAR: You sheath {item}.
  {
    const m = s.match(/^You sheath (.+)\.$/i);
    if (m) return { slot: 'sheathed', item: m[1].trim() };
  }

  // generic "You wear ..."
  const prefix = 'You wear ';
  if (!s.startsWith(prefix)) return null;

  const tailIdx = s.lastIndexOf('.');
  const core = tailIdx >= 0 ? s.slice(0, tailIdx) : s;
  const rest = core.slice(prefix.length);

  {
    const mShield = rest.match(/^(.+)\s+as a shield$/i);
    if (mShield) return { slot: 'worn_as_shield', item: mShield[1].trim() };
  }

  const mFinger = rest.match(/^(.+)\s+on your (left|right) finger$/i);
  if (mFinger) return { slot: 'worn_on_finger', item: mFinger[1].trim() };

  const mNeck = rest.match(/^(.+)\s+around your neck$/i);
  if (mNeck) return { slot: 'worn_around_neck', item: mNeck[1].trim() };

  const mTorso = rest.match(/^(.+)\s+on your torso$/i);
  if (mTorso) return { slot: 'worn_on_torso', item: mTorso[1].trim() };

  const mHead = rest.match(/^(.+)\s+on your head$/i);
  if (mHead) return { slot: 'worn_on_head', item: mHead[1].trim() };

  const mLegs = rest.match(/^(.+)\s+on your legs$/i);
  if (mLegs) return { slot: 'worn_on_legs', item: mLegs[1].trim() };

  const mFeet = rest.match(/^(.+)\s+on your feet$/i);
  if (mFeet) return { slot: 'worn_on_feet', item: mFeet[1].trim() };

  const mHands = rest.match(/^(.+)\s+on your hands$/i);
  if (mHands) return { slot: 'worn_on_hands', item: mHands[1].trim() };

  // about body
  const mBody = rest.match(/^(.+)\s+about your torso$/i);
  if (mBody) return { slot: 'worn_about_body', item: mBody[1].trim() };

  // waist
  const mWaist = rest.match(/^(.+)\s+about your waist$/i);
  if (mWaist) return { slot: 'worn_about_waist', item: mWaist[1].trim() };

  // wrist
  const mWrist = rest.match(/^(.+)\s+around your (left|right) wrist$/i);
  if (mWrist) return { slot: 'worn_around_wrist', item: mWrist[1].trim() };

  return null;
}

export function parseEqDeltaLine(line: string): EqDeltaEvent | null {
  const s = clean(line);
  if (!s) return null;

  const stopItem = matchStopUsing(s);
  if (stopItem) return { kind: 'stop_using', item: stopItem };

  if (matchDisarm(s)) return { kind: 'disarm' };

  const w = matchWield(s);
  if (w) return { kind: 'wield', item: w.item, isSecondary: w.isSecondary };

  const wear = matchWear(s);
  if (wear) return { kind: 'wear', slot: wear.slot, item: wear.item };

  return null;
}
