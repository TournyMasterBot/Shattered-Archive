import type { FeedEvent } from '@shatteredarchive/copilot-core';
import { commandEvent, linesEvent, roomEvent, viewEvents } from '../testing/worldFixtures';
import { commandDirection } from './direction';
import { parseRoomView, type Labeler } from './parseRoom';

const plain = viewEvents(1_000, {
  title: 'Hall of Lanterns',
  description: [
    '  Paper lanterns sway from the beams.',
    'Dust hangs in the light.',
    '',
    '  A second paragraph about the floor.  ',
  ],
  exitWords: ['north', 'south'],
  contents: ['     A brass bell hangs from a hook by the door.', '(Glowing) A grey rat sniffs about the floor.'],
});

describe('parseRoomView: a plain room', () => {
  it('reads the GMCP part exactly and the text between the title and the exits line as the description', () => {
    const view = parseRoomView(plain);
    expect(view).toMatchObject({
      at: 1_000,
      title: 'Hall of Lanterns',
      sector: 'inside',
      exits: ['N', 'S'],
      unknownExits: [],
      text: 'ok',
      unlisted: false,
    });
    expect(view?.description).toBe(
      'Paper lanterns sway from the beams.\nDust hangs in the light.\n\nA second paragraph about the floor.',
    );
  });

  it('lists what the room holds after the exits line, tags removed, every label unknown without a labeler', () => {
    expect(parseRoomView(plain)?.contents).toEqual([
      { label: 'A brass bell hangs from a hook by the door.', kind: 'unknown' },
      { label: 'A grey rat sniffs about the floor.', kind: 'unknown' },
    ]);
  });

  it('does not take the text of the previous view, which ends at its prompt', () => {
    const earlier = viewEvents(900, {
      title: 'Hall of Lanterns',
      contents: ['     A stale thing that was in the previous room.'],
    });
    const events = [...earlier, ...plain];
    expect(parseRoomView(events)?.contents.map((c) => c.label)).not.toContain(
      'A stale thing that was in the previous room.',
    );
  });

  it('removes colour codes', () => {
    const events: FeedEvent[] = [
      linesEvent(
        1,
        '\u001b[1;37mHall of Lanterns\u001b[0m',
        '  \u001b[0;36mCold light.\u001b[0m',
        '',
        ' [Exits: \u001b[0;32mnorth\u001b[0m  ]',
        '     \u001b[1;30mA brass bell.\u001b[0m',
      ),
      roomEvent(1, 'Hall of Lanterns', ['N']),
    ];
    const view = parseRoomView(events);
    expect(view).toMatchObject({ text: 'ok', description: 'Cold light.' });
    expect(view?.contents).toEqual([{ label: 'A brass bell.', kind: 'unknown' }]);
  });

  it('cuts a very long description to the schema cap', () => {
    const events = viewEvents(1, { title: 'Hall', description: ['  ' + 'long words here '.repeat(1000)] });
    expect(parseRoomView(events)?.description).toHaveLength(8000);
  });

  it('has no description when there are no lines between the title and the exits', () => {
    const view = parseRoomView(viewEvents(1, { title: 'Hall', description: [] }));
    expect(view?.text).toBe('ok');
    expect(view?.description).toBeUndefined();
  });
});

describe('parseRoomView: what the room holds', () => {
  it('lets a labeler say mob or item, by where the line was printed', () => {
    const calls: [string, string][] = [];
    const label: Labeler = (text, placement) => {
      calls.push([text, placement]);
      return placement === 'object' ? 'item' : 'mob';
    };
    const view = parseRoomView(plain, label);
    expect(view?.contents).toEqual([
      { label: 'A brass bell hangs from a hook by the door.', kind: 'item' },
      { label: 'A grey rat sniffs about the floor.', kind: 'mob' },
    ]);
    expect(calls).toEqual([
      ['A brass bell hangs from a hook by the door.', 'object'],
      ['A grey rat sniffs about the floor.', 'creature'],
    ]);
  });

  it('marks people as players: by a flag only a person carries, or by a name-shaped line', () => {
    const events = viewEvents(1, {
      title: 'Hall',
      contents: [
        '(Red Aura) (WANTED) Zephyr Quill is here.',
        'Brindle Ashgrove stands here, waiting.',
        'Wrenna rests here.',
        'A Nightwarden of Drakkara tends to the tower.',
        'The old gatekeeper sits here.',
        'Some pigeons peck at crumbs.',
      ],
    });
    const kinds = Object.fromEntries((parseRoomView(events)?.contents ?? []).map((c) => [c.label, c.kind]));
    expect(kinds).toEqual({
      'Zephyr Quill is here.': 'player',
      'Brindle Ashgrove stands here, waiting.': 'player',
      'Wrenna rests here.': 'player',
      'A Nightwarden of Drakkara tends to the tower.': 'unknown',
      'The old gatekeeper sits here.': 'unknown',
      'Some pigeons peck at crumbs.': 'unknown',
    });
  });

  it('lets the labeler win over the name shape (a named creature is a mob, not a person)', () => {
    const events = viewEvents(1, { title: 'Hall', contents: ['Thessaly Ironbrook stands here.'] });
    expect(parseRoomView(events, () => 'mob')?.contents).toEqual([
      { label: 'Thessaly Ironbrook stands here.', kind: 'mob' },
    ]);
  });

  it('an indented line is never taken for a person, even when it is name-shaped', () => {
    const events = viewEvents(1, { title: 'Hall', contents: ['     Brindle Ashgrove stands here as a statue.'] });
    expect(parseRoomView(events)?.contents[0].kind).toBe('unknown');
  });

  it('notes an indented blank line as an unlisted object and keeps it out of the contents', () => {
    const events = viewEvents(1, {
      title: 'Hall',
      contents: ['     A black skull.', '     ', '     A mystic vault door.'],
    });
    const view = parseRoomView(events);
    expect(view?.unlisted).toBe(true);
    expect(view?.contents.map((c) => c.label)).toEqual(['A black skull.', 'A mystic vault door.']);
  });

  it('still sees an unlisted marker that is the last line before the prompt', () => {
    const events = [linesEvent(1, 'Hall', '  Nothing.', '', ' [Exits: north  ]', '     '), roomEvent(1, 'Hall', ['N'])];
    expect(parseRoomView(events)?.unlisted).toBe(true);
  });

  it('skips a line that is only tags', () => {
    const events = viewEvents(1, { title: 'Hall', contents: ['(Glowing) (Humming)', '(Glowing) A lamp.'] });
    expect(parseRoomView(events)?.contents).toEqual([{ label: 'A lamp.', kind: 'unknown' }]);
  });

  it('a room with nothing in it has no contents', () => {
    expect(parseRoomView(viewEvents(1, { title: 'Hall' }))?.contents).toEqual([]);
  });
});

describe('parseRoomView: when the text cannot be trusted', () => {
  it('a dark room: the text says so and has no exits line, so nothing is read from it', () => {
    const events = [linesEvent(1, 'It is pitch black...'), roomEvent(1, 'Deep Cellar', ['U'])];
    expect(parseRoomView(events)).toMatchObject({ title: 'Deep Cellar', exits: ['U'], text: 'dark', contents: [] });
    expect(parseRoomView(events)?.description).toBeUndefined();
    const blind = [linesEvent(1, "You can't see a thing!"), roomEvent(1, 'Deep Cellar', ['U'])];
    expect(parseRoomView(blind)?.text).toBe('dark');
  });

  it('GMCP and text disagree: the title line is not the GMCP room name, so the text is ignored and flagged', () => {
    const events = viewEvents(1, {
      title: 'The Fountain Court',
      gmcpName: 'Hall of Lanterns',
      contents: ['     A brass bell.'],
    });
    const view = parseRoomView(events);
    expect(view).toMatchObject({ title: 'Hall of Lanterns', text: 'disagrees', contents: [], unlisted: false });
    expect(view?.description).toBeUndefined();
  });

  it('text with no exits line and no sign of darkness disagrees too', () => {
    const events = [linesEvent(1, 'You feel a gust of wind.', 'Something happens.'), roomEvent(1, 'Hall', ['N'])];
    expect(parseRoomView(events)?.text).toBe('disagrees');
  });

  it('an exits line with no title line before it disagrees', () => {
    const events = [linesEvent(1, '  A description with no title.', ' [Exits: north  ]'), roomEvent(1, 'Hall', ['N'])];
    expect(parseRoomView(events)?.text).toBe('disagrees');
  });

  it('a title that only differs in case and spacing is still the title', () => {
    const events = viewEvents(1, { title: '  hall   OF lanterns ', gmcpName: 'Hall of Lanterns' });
    expect(parseRoomView(events)?.text).toBe('ok');
  });

  it('no text at all (brief mode, or a repeat the feed collapsed) is absent', () => {
    expect(parseRoomView([roomEvent(1, 'Hall', ['N'])])).toMatchObject({ text: 'absent', contents: [], exits: ['N'] });
    expect(
      parseRoomView([
        linesEvent(1, '<100/100hp 50/50m 80/80mv 1000tnl> [Hall] [N] [3:00pm]'),
        roomEvent(1, 'Hall', ['N']),
      ])?.text,
    ).toBe('absent');
  });

  it('is undefined without a room event', () => {
    expect(parseRoomView([])).toBeUndefined();
    expect(parseRoomView([linesEvent(1, 'text'), commandEvent(2, 'look')])).toBeUndefined();
  });
});

describe('parseRoomView: boundaries and exits', () => {
  it('text from before the last command is not part of the view', () => {
    const events: FeedEvent[] = [
      linesEvent(1, 'Old Place', '  Old text.', '', ' [Exits: north  ]', '     An old thing.'),
      commandEvent(2, 'north'),
      ...viewEvents(3, { title: 'Hall', withPromptBefore: false, contents: ['     A new thing.'] }),
    ];
    const view = parseRoomView(events);
    expect(view?.text).toBe('ok');
    expect(view?.contents.map((c) => c.label)).toEqual(['A new thing.']);
  });

  it('text from before an earlier room event, a login or a session change is not part of the view', () => {
    for (const boundary of [
      roomEvent(1, 'Elsewhere'),
      { type: 'login', at: 1 } as FeedEvent,
      { type: 'session', at: 1, state: 'connected' } as FeedEvent,
    ]) {
      const events: FeedEvent[] = [
        linesEvent(0, 'Hall', '  Stale.', '', ' [Exits: north  ]', '     A stale thing.'),
        boundary,
        ...viewEvents(2, { title: 'Hall', withPromptBefore: false }),
      ];
      expect(parseRoomView(events)?.contents).toEqual([]);
    }
  });

  it('uses the last room event of the window', () => {
    const events = [
      ...viewEvents(1, { title: 'First' }),
      ...viewEvents(2, { title: 'Second', withPromptBefore: false }),
    ];
    expect(parseRoomView(events)?.title).toBe('Second');
  });

  it('keeps only the last lines of a very long text', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `noise ${i}`);
    const events = [linesEvent(1, ...lines, 'Hall', '  Text.', '', ' [Exits: north  ]'), roomEvent(1, 'Hall', ['N'])];
    expect(parseRoomView(events)?.text).toBe('ok');
  });

  it('reads exits in any case, in direction order without repeats, and keeps the names it has no slot for', () => {
    const events = [roomEvent(1, 'Hall', ['d', 'N', 'n', 'ne', 'sideways', ' W '])];
    expect(parseRoomView(events)).toMatchObject({ exits: ['N', 'NE', 'W', 'D'], unknownExits: ['sideways'] });
  });

  it('reads an empty sector as empty', () => {
    expect(parseRoomView([{ type: 'room', at: 1, room: 'Hall', sector: '', exits: [] }])?.sector).toBe('');
  });
});

describe('commandDirection', () => {
  it('knows the ten directions as words and letters, in any case', () => {
    const table: Record<string, string> = {
      n: 'N',
      North: 'N',
      NE: 'NE',
      northeast: 'NE',
      e: 'E',
      se: 'SE',
      S: 'S',
      southwest: 'SW',
      w: 'W',
      northwest: 'NW',
      u: 'U',
      DOWN: 'D',
      ' up ': 'U',
    };
    for (const [command, dir] of Object.entries(table)) expect(commandDirection(command)).toBe(dir);
  });

  it('is undefined for anything that is not a bare direction', () => {
    for (const command of [
      '',
      'look',
      'go north',
      'north now',
      'flee',
      'enter portal',
      'recall',
      'constructor',
      '__proto__',
      'toString',
    ]) {
      expect(commandDirection(command)).toBeUndefined();
    }
  });
});

describe('parseRoomView: lines it passes over', () => {
  it('reads text across a vitals event, which is neither text nor a boundary', () => {
    const [text, room] = viewEvents(1, { title: 'Hall', contents: ['     A brass bell.'] });
    const vitals: FeedEvent = {
      type: 'vitals',
      at: 1,
      vitals: { hp: 1, maxHp: 1, mana: 1, maxMana: 1, move: 1, maxMove: 1 },
      inFight: false,
    };
    expect(parseRoomView([text, vitals, room])?.contents).toEqual([{ label: 'A brass bell.', kind: 'unknown' }]);
  });

  it('a line of one blank is not an unlisted marker', () => {
    const view = parseRoomView(viewEvents(1, { title: 'Hall', contents: [' ', '     A brass bell.'] }));
    expect(view?.unlisted).toBe(false);
    expect(view?.contents).toHaveLength(1);
  });
});
