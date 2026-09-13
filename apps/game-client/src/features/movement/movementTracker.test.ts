// apps/game-client/src/features/movement/movementTracker.test.ts
//
// Verifies the head-of-queue-relative FIFO tracker against the exact scenarios the
// plan's corpus research flagged as load-bearing (see movementTracker.ts's header and
// .ai-plans/20260813-1325-movement-tracking-fix.md Step 2). Uses fake timers — the
// 1200ms head timeout and the deep-burst pacing case both need precise, fast-forwardable
// time control, unlike autoleveling-engine.test.ts's real-timer style.

import { movementTracker } from './movementTracker';

const emit = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
const sendCommand = (text: string) => emit('shatteredarchive:command-sent', { text });
const roomData = (room: string, sector: string, exits: string[]) => emit('game:room-data', { room, sector, exits });
const rawLine = (text: string) => emit('shatteredarchive:raw-data', { text });

function captureEvents(name: string) {
  const events: any[] = [];
  const listener = (ev: Event) => events.push((ev as CustomEvent).detail);
  window.addEventListener(name, listener);
  return { events, off: () => window.removeEventListener(name, listener) };
}

describe('movementTracker', () => {
  let unbind: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    unbind = movementTracker.bind();
  });

  afterEach(() => {
    unbind();
    jest.useRealTimers();
  });

  it('resolves three enqueued moves in FIFO order against three room_data updates', () => {
    const succeeded = captureEvents('shatteredarchive:movement-succeeded');

    roomData('Start Room', 'inside', ['n']);
    sendCommand('n');
    sendCommand('n');
    sendCommand('e');
    expect(movementTracker.pendingCount()).toBe(3);

    roomData('Room A', 'inside', ['s', 'e']);
    roomData('Room B', 'inside', ['w', 'n']);
    roomData('Room C', 'inside', ['w']);

    expect(movementTracker.pendingCount()).toBe(0);
    expect(succeeded.events.map((e) => e.cmd)).toEqual(['n', 'n', 'e']);
    expect(succeeded.events.map((e) => e.room.room)).toEqual(['Room A', 'Room B', 'Room C']);
    succeeded.off();
  });

  it('a darkness room_data in between resolves nothing and does not break ordering', () => {
    const succeeded = captureEvents('shatteredarchive:movement-succeeded');

    roomData('Start Room', 'inside', ['n']);
    sendCommand('n');
    sendCommand('e');

    roomData('darkness', 'inside', []); // blinded — resolves nothing, doesn't update last-known
    expect(movementTracker.pendingCount()).toBe(2);

    roomData('Room A', 'inside', ['s']);
    expect(succeeded.events.map((e) => e.cmd)).toEqual(['n']);

    roomData('Room B', 'inside', ['w']);
    expect(succeeded.events.map((e) => e.cmd)).toEqual(['n', 'e']);
    succeeded.off();
  });

  it('a room_data with the SAME room/sector but DIFFERENT exits still resolves as success', () => {
    const succeeded = captureEvents('shatteredarchive:movement-succeeded');

    roomData('Along the Eastern Road', 'road', ['n', 's']);
    sendCommand('n');
    roomData('Along the Eastern Road', 'road', ['s', 'e']); // same name/sector, different exits

    expect(succeeded.events).toHaveLength(1);
    succeeded.off();
  });

  it('an EXACT repeat of {room,sector,exits} while pending resolves immediately as succeeded (ambiguous-repeat)', () => {
    const succeeded = captureEvents('shatteredarchive:movement-succeeded');

    roomData('Thieves Row', 'city', ['n', 'e', 's', 'w']);
    sendCommand('n');
    roomData('Thieves Row', 'city', ['n', 'e', 's', 'w']); // structurally indistinguishable segment

    expect(movementTracker.pendingCount()).toBe(0);
    expect(succeeded.events).toHaveLength(1);
    succeeded.off();
  });

  it('an "Alas" raw line resolves the oldest pending entry as failed without waiting for the timeout', () => {
    const failed = captureEvents('shatteredarchive:movement-failed');

    sendCommand('n');
    rawLine('Alas, you cannot go that way.\r\n');

    expect(movementTracker.pendingCount()).toBe(0);
    expect(failed.events).toHaveLength(1);
    expect(failed.events[0].reasonLine).toBe('Alas, you cannot go that way.');

    jest.advanceTimersByTime(2000); // no further resolution should fire from the timeout poll
    expect(failed.events).toHaveLength(1);
    failed.off();
  });

  it('resolves a templated door-closed line via the line-anchored regex, not a fixed string', () => {
    const failed = captureEvents('shatteredarchive:movement-failed');

    sendCommand('n');
    rawLine('The gate is closed.\r\n');

    expect(failed.events).toHaveLength(1);
    expect(failed.events[0].reasonLine).toBe('The gate is closed.');
    failed.off();
  });

  it('does not false-positive on "is closed" inside ordinary chat (not line-anchored)', () => {
    const failed = captureEvents('shatteredarchive:movement-failed');

    sendCommand('n');
    rawLine("Cedarmold says 'The stairway is closed....'");

    expect(movementTracker.pendingCount()).toBe(1); // still pending — not resolved by the chat line
    expect(failed.events).toHaveLength(0);
    failed.off();
  });

  it('a non-movement command is never enqueued', () => {
    sendCommand('look');
    sendCommand('kill rat');
    expect(movementTracker.pendingCount()).toBe(0);
  });

  it('times out (head-of-queue-relative) after 1200ms with no resolution signal', () => {
    const failed = captureEvents('shatteredarchive:movement-failed');

    sendCommand('n');
    jest.advanceTimersByTime(1199);
    expect(failed.events).toHaveLength(0);

    jest.advanceTimersByTime(50);
    expect(failed.events).toHaveLength(1);
    expect(failed.events[0].reasonLine).toBe('(timeout)');
    failed.off();
  });

  it('a deep burst (10 moves enqueued in the same tick) does not time out entries past the 2nd/3rd slot when the server paces them ~500ms apart', () => {
    const succeeded = captureEvents('shatteredarchive:movement-succeeded');
    const failed = captureEvents('shatteredarchive:movement-failed');

    roomData('Start Room', 'inside', ['n']);
    for (let i = 0; i < 10; i++) sendCommand('n');
    expect(movementTracker.pendingCount()).toBe(10);

    // Server resolves one hop every 500ms, working through the burst in order —
    // well under the 1200ms head-relative window each time, even though the 10th
    // entry's OWN send-to-resolve latency is ~5000ms (expected, per the plan's own
    // "consequence for UX" note — correctness, not a bug).
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(500);
      roomData(`Room ${i}`, 'inside', ['n']);
    }

    expect(movementTracker.pendingCount()).toBe(0);
    expect(succeeded.events).toHaveLength(10);
    expect(failed.events).toHaveLength(0);
    succeeded.off();
    failed.off();
  });
});
