import type { FeedEvent } from '@shatteredarchive/copilot-core';
import { PROMPT, whoisicBlock } from '../testing/whoisicFixtures';
import { MAX_BLOCK_LINES, PROMPT_LINE, SETTLE_MS, WhoisicWatcher } from './whoisicWatcher';

const lines = (at: number, ...l: string[]): FeedEvent => ({ type: 'lines', at, lines: l });
const room = (at: number): FeedEvent => ({ type: 'room', at, room: 'Somewhere', sector: 'inside', exits: [] });

describe('WhoisicWatcher', () => {
  it('parses a block that ends at the prompt line, and keeps the prompt out of the description', () => {
    const w = new WhoisicWatcher();
    const found = w.feed([lines(1000, 'You look around.', ...whoisicBlock('Zorvak'), '', PROMPT, 'The next output.')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: 'Zorvak', hasDescription: true, at: 1000, fields: { Eyes: 'green', Sex: 'Male', Profession: 'Scribe' } });
    expect(found[0].text).toBe('The first line of the description.\nThe red second line.');
    expect(found[0].rawAnsi).toContain('\x1b[1;31mred');
    expect(found[0].dsl).toContain('{Rred');
    expect(found[0].text).not.toContain('hp');
  });

  it('ends a block at a feed event that is not text', () => {
    const w = new WhoisicWatcher();
    const found = w.feed([lines(5, ...whoisicBlock('Zorvak')), room(6), lines(7, 'later text')]);
    expect(found).toHaveLength(1);
    expect(found[0].text).not.toContain('later text');
  });

  it('keeps an open block across calls: a poll can cut a block in two', () => {
    const w = new WhoisicWatcher();
    const block = whoisicBlock('Zorvak', { description: ['one', 'two', 'three', 'four'] });
    expect(w.feed([lines(1, ...block.slice(0, 10))])).toEqual([]);
    const found = w.feed([lines(2, ...block.slice(10), PROMPT)]);
    expect(found).toHaveLength(1);
    expect(found[0].text).toBe('one\ntwo\nthree\nfour');
  });

  it('settle() closes a block that has been quiet long enough, and not before', () => {
    const w = new WhoisicWatcher();
    w.feed([lines(10_000, ...whoisicBlock('Zorvak'))]);
    expect(w.settle(10_000 + SETTLE_MS - 1)).toEqual([]);
    const found = w.settle(10_000 + SETTLE_MS);
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('Zorvak');
    expect(w.settle(99_999_999)).toEqual([]); // nothing left open
  });

  it('a second header closes the first block and starts another', () => {
    const w = new WhoisicWatcher();
    const found = w.feed([lines(1, ...whoisicBlock('Zorvak'), ...whoisicBlock('Quenta', { sex: 'Female' }), PROMPT)]);
    expect(found.map((r) => r.name)).toEqual(['Zorvak', 'Quenta']);
    expect(found[1].fields.Sex).toBe('Female');
  });

  it('cuts a block that never ends at MAX_BLOCK_LINES', () => {
    const w = new WhoisicWatcher();
    const endless = Array.from({ length: MAX_BLOCK_LINES + 50 }, (_, i) => `line ${i}`);
    const found = w.feed([lines(1, ...whoisicBlock('Zorvak', { description: endless }))]);
    expect(found).toHaveLength(1);
    expect(found[0].text.split('\n').length).toBeLessThan(MAX_BLOCK_LINES);
    expect(found[0].text).toContain('line 0');
    expect(found[0].text).not.toContain(`line ${MAX_BLOCK_LINES + 49}`);
  });

  it('a block with no description text (E7) is reported with hasDescription false', () => {
    const w = new WhoisicWatcher();
    const found = w.feed([lines(1, ...whoisicBlock('Zorvak', { description: [] }), PROMPT)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ hasDescription: false, rawAnsi: '', dsl: '', text: '' });
    expect(found[0].fields.Profession).toBe('Scribe');
  });

  it('ignores ordinary text, a prompt with no block open, and a header with no usable name', () => {
    const w = new WhoisicWatcher();
    expect(w.feed([lines(1, 'You see a door.', PROMPT, 'IC Information for  .', 'more')])).toEqual([]);
    expect(w.settle(1_000_000)).toEqual([]);
    expect(w.feed([room(2)])).toEqual([]);
  });

  it('recognises the header through colour codes', () => {
    const w = new WhoisicWatcher();
    const found = w.feed([lines(1, '\x1b[1;36mIC Information for Zorvak.\x1b[0m', ...whoisicBlock('Zorvak').slice(1), PROMPT)]);
    expect(found.map((r) => r.name)).toEqual(['Zorvak']);
  });

  it('PROMPT_LINE matches the game prompt and not ordinary text', () => {
    expect(PROMPT_LINE.test(PROMPT)).toBe(true);
    expect(PROMPT_LINE.test('<b>bold</b> text')).toBe(false);
    expect(PROMPT_LINE.test('You have 100/100hp left')).toBe(false);
  });
});
