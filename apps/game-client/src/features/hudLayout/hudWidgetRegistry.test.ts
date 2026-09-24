import { getHudWidget, publishHudWidget, __resetForTests } from './hudWidgetRegistry';
import { ListenEvent } from '../event-emitter/event-dispatcher';

describe('hudWidgetRegistry', () => {
  afterEach(() => {
    // leave every slot empty between tests (bypasses ownership checks —
    // publishHudWidget(..., null) would silently no-op here since no test
    // publishes under a 'test-owner' id)
    __resetForTests();
  });

  it('is empty for a slot nothing has published to', () => {
    expect(getHudWidget('hud.bottomStrip')).toBeNull();
  });

  it('publish then getHudWidget returns the current occupant', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { label: 'Enemy', value: 'A rabid wolf' });
    expect(getHudWidget('hud.rightColumn')).toEqual({
      ownerId: 'autoleveling',
      content: { label: 'Enemy', value: 'A rabid wolf' },
    });
  });

  it('later publisher wins for the same slot', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    publishHudWidget('hud.rightColumn', 'questbot', { value: 'Quest complete' });
    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'questbot', content: { value: 'Quest complete' } });
  });

  it('publishing null only clears if the caller currently owns the slot', () => {
    publishHudWidget('hud.rightColumn', 'autoleveling', { value: 'A rabid wolf' });
    publishHudWidget('hud.rightColumn', 'questbot', null); // not the owner — no-op
    expect(getHudWidget('hud.rightColumn')).toEqual({ ownerId: 'autoleveling', content: { value: 'A rabid wolf' } });

    publishHudWidget('hud.rightColumn', 'autoleveling', null); // owner clears — takes effect
    expect(getHudWidget('hud.rightColumn')).toBeNull();
  });

  it('dispatches shatteredarchive:hud-widget-updated on every publish (including clears)', () => {
    const seen: unknown[] = [];
    const dispose = ListenEvent('shatteredarchive:hud-widget-updated', (payload) => seen.push(payload), {
      key: 'test::hud-widget-updated',
    });

    publishHudWidget('hud.bottomStrip', 'autoleveling', { value: 'x' });
    publishHudWidget('hud.bottomStrip', 'autoleveling', null);

    dispose();
    expect(seen).toEqual([
      { slotId: 'hud.bottomStrip', ownerId: 'autoleveling', content: { value: 'x' } },
      { slotId: 'hud.bottomStrip', ownerId: 'autoleveling', content: null },
    ]);
  });
});
