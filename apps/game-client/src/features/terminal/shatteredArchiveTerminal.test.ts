// The terminal's write handler, driven through the real window event with plain fake
// xterm objects (jsdom has no canvas/xterm). Focus: when auto-scroll is OFF each write
// must keep the user's scroll position, and the scroll container is looked up once, not
// with a DOM query on every received line.
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { ShatteredArchiveTerminal } from './shatteredArchiveTerminal';
import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { setOmitRules } from '../userScripts/triggerOmitStore';

interface Fake {
  term: XTerm;
  root: HTMLElement;
  scroller: HTMLDivElement;
  write: jest.Mock;
  scrollToBottom: jest.Mock;
}

function makeTerm(): Fake {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.className = 'xterm-scrollable-element';
  root.appendChild(scroller);
  document.body.appendChild(root);

  const write = jest.fn();
  const scrollToBottom = jest.fn();
  const term = { element: root, write, scrollToBottom, cols: 80, rows: 24 } as unknown as XTerm;
  return { term, root, scroller, write, scrollToBottom };
}

const fit = { fit: jest.fn() } as unknown as FitAddon;
const send = (rawText: string, extra: object = {}) =>
  DispatchEvent('shatteredarchive:write-terminal', { rawText, ...extra });

let terminal: ShatteredArchiveTerminal;

beforeEach(() => {
  document.body.innerHTML = '';
  terminal = ShatteredArchiveTerminal.Instance;
  terminal.detach();
  setOmitRules([], 'dsl-mud');
});

afterEach(() => terminal.detach());

describe('write handler', () => {
  it('writes to the attached terminal and scrolls to the bottom when auto-scroll is on', () => {
    const f = makeTerm();
    terminal.attach(f.term, fit);

    send('hello\r\n');

    expect(f.write).toHaveBeenCalledWith('hello\r\n');
    expect(f.scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no terminal is attached or the text is empty', () => {
    const f = makeTerm();
    send('lost');
    terminal.attach(f.term, fit);
    send('');

    expect(f.write).not.toHaveBeenCalled();
  });

  it('drops a line the omit rules match, but not one a user script wrote', () => {
    const f = makeTerm();
    terminal.attach(f.term, fit);
    setOmitRules([{ id: 'r', eventName: 'shatteredarchive:raw-data', matchText: 'spam', caseInsensitive: true }], 'dsl-mud');

    send('SPAM line');
    send('SPAM from a script', { fromUserScript: true });

    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.write).toHaveBeenCalledWith('SPAM from a script');
  });

  it('keeps the scroll position on every write when auto-scroll is off', () => {
    const f = makeTerm();
    terminal.attach(f.term, fit);
    terminal.setAutoScroll(false);
    f.scroller.scrollTop = 120;
    // xterm moves the viewport when it writes; the handler must put it back.
    f.write.mockImplementation(() => {
      f.scroller.scrollTop = 0;
    });

    send('one');
    expect(f.scroller.scrollTop).toBe(120);
    send('two');
    expect(f.scroller.scrollTop).toBe(120);
    expect(f.scrollToBottom).not.toHaveBeenCalled();
  });

  it('looks the scroll container up once across many writes', () => {
    const f = makeTerm();
    terminal.attach(f.term, fit);
    terminal.setAutoScroll(false);
    const query = jest.spyOn(f.root, 'querySelector');

    for (let i = 0; i < 25; i++) send(`line ${i}`);

    const lookups = query.mock.calls.filter(([sel]) => sel === '.xterm-scrollable-element');
    expect(lookups).toHaveLength(1);
  });

  it('finds the container again if xterm replaces it', () => {
    const f = makeTerm();
    terminal.attach(f.term, fit);
    terminal.setAutoScroll(false);
    send('first');

    f.root.removeChild(f.scroller);
    const replacement = document.createElement('div');
    replacement.className = 'xterm-scrollable-element';
    f.root.appendChild(replacement);
    replacement.scrollTop = 40;
    f.write.mockImplementation(() => {
      replacement.scrollTop = 0;
    });

    send('second');

    expect(replacement.scrollTop).toBe(40);
  });

  it('writes normally when auto-scroll is off but the terminal has no scroll container', () => {
    const f = makeTerm();
    f.root.removeChild(f.scroller);
    terminal.attach(f.term, fit);
    terminal.setAutoScroll(false);

    send('still written');

    expect(f.write).toHaveBeenCalledWith('still written');
    expect(f.scrollToBottom).not.toHaveBeenCalled();
  });

  it('forgets the cached container on detach, so a new terminal gets its own', () => {
    const first = makeTerm();
    terminal.attach(first.term, fit);
    terminal.setAutoScroll(false);
    send('a');
    terminal.detach();

    const second = makeTerm();
    terminal.attach(second.term, fit);
    terminal.setAutoScroll(false);
    second.scroller.scrollTop = 77;
    second.write.mockImplementation(() => {
      second.scroller.scrollTop = 0;
    });

    send('b');

    expect(second.scroller.scrollTop).toBe(77);
  });
});
