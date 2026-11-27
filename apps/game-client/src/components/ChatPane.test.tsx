import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatPane } from './ChatPane';
import {
  KNOWN_CHAT_SUBTYPES,
  getChatSettings,
  setChatSettings,
  updateChatSettings,
  type ChatSettings,
  type ChatSubtype,
} from '../features/chat/chat-settings-store';
import type { ChatMessage } from '../features/chat/chat-store';
import * as unreadStore from '../features/chat/chat-unread-store';

// The chat log the pane reads. A test gives it a new array and re-renders to "receive" a message.
let mockMessages: ChatMessage[] = [];
jest.mock('../hooks/useChatLog', () => ({
  useChatLog: () => ({ messages: mockMessages }),
}));
// What each pane lists (the real hook filters by subtype; the tests only need something to draw).
let mockPaneMessages: ChatMessage[] = [];
let mockShowJump = false;
const mockJumpToLive = jest.fn();

jest.mock('../hooks/useChatPane', () => ({
  useChatPane: () => ({
    messages: mockPaneMessages,
    scrollRef: { current: null },
    showJump: mockShowJump,
    handleScroll: jest.fn(),
    handleJumpToLive: mockJumpToLive,
  }),
}));

// A handful of subtypes is enough to exercise the pill strip without pinning
// the full subtype list.
const SOME_SUBTYPES = KNOWN_CHAT_SUBTYPES.slice(0, 4);

function fullSettings(overrides: Partial<ChatSettings>): ChatSettings {
  const enabledPanes = KNOWN_CHAT_SUBTYPES.reduce(
    (acc, k) => {
      acc[k] = SOME_SUBTYPES.includes(k);
      return acc;
    },
    {} as ChatSettings['enabledPanes'],
  );

  return {
    strictChatFormat: false,
    enableChatPanes: true,
    showHiddenChatPanes: true, // show enabled subtypes without needing real messages
    unreadDots: false,
    enabledPanes,
    paneOrder: [...KNOWN_CHAT_SUBTYPES],
    ...overrides,
  };
}

describe('ChatPane pill strip layout', () => {
  beforeEach(() => {
    localStorage.clear();
    // setChatSettings REPLACES the module's cached settings outright (not a
    // merge), so this is a full reset even though the store has no dedicated
    // test hook.
    setChatSettings(fullSettings({}));
  });

  it('every enabled pane pill renders regardless of layout mode', () => {
    render(<ChatPane />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    for (const s of SOME_SUBTYPES) {
      expect(screen.getByRole('tab', { name: s.toUpperCase() })).toBeInTheDocument();
    }
  });

  it('defaults to the scrolling strip (classic layout) — no wrap classes applied', () => {
    render(<ChatPane />);
    const tablist = screen.getByRole('tablist', { name: 'Chat panes' });

    expect(tablist.classList.contains('sa-chat-pills-wrap')).toBe(false);
    expect(tablist.parentElement!.classList.contains('sa-chat-top-bar-wrap')).toBe(false);
  });

  it('wrapPills switches the pill strip and its row to the wrap layout', () => {
    render(<ChatPane wrapPills />);
    const tablist = screen.getByRole('tablist', { name: 'Chat panes' });

    expect(tablist.classList.contains('sa-chat-pills-wrap')).toBe(true);
    // The row that also holds the gear button must switch too, or the gear
    // stays bottom-aligned against a now-multi-row pill block.
    expect(tablist.parentElement!.classList.contains('sa-chat-top-bar-wrap')).toBe(true);
  });

  it('the gear button is always present and stays a sibling of the pill strip, never inside it (so it can never wrap away)', () => {
    render(<ChatPane wrapPills />);
    const gear = screen.getByRole('button', { name: 'Chat settings' });
    const tablist = screen.getByRole('tablist', { name: 'Chat panes' });

    expect(gear).toBeInTheDocument();
    expect(tablist.contains(gear)).toBe(false);
    expect(gear.parentElement).toBe(tablist.parentElement);
  });
});

// ---- the unread dot ----------------------------------------------------------------------------------------------

function msg(id: number, subtype: ChatSubtype | undefined, rawText: string): ChatMessage {
  return { id: String(id), html: rawText, rawText, ts: id, subtype };
}
const tell = (id: number) => msg(id, 'tell', "Alice tells you 'hi'");

// The tab names that carry a dot, without the hidden "unread messages" text.
function dotted(): string[] {
  return screen
    .queryAllByRole('tab')
    .filter((t) => t.getAttribute('data-unread') === 'true')
    .map((t) => (t.textContent ?? '').replace('unread messages', '').trim());
}

function configure(overrides: Partial<ChatSettings> = {}) {
  setChatSettings(fullSettings({ strictChatFormat: true, unreadDots: true, ...overrides }));
}

// Renders the pane and gives back a function that delivers messages to it.
function mountPane() {
  const view = render(<ChatPane />);
  const receive = (...messages: ChatMessage[]) => {
    mockMessages = [...mockMessages, ...messages];
    view.rerender(<ChatPane />);
  };
  return { ...view, receive };
}

describe('ChatPane unread dot', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMessages = [];
    unreadStore.disarmUnread();
    configure();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('puts no dot anywhere while the setting is off', () => {
    configure({ unreadDots: false });
    const { receive } = mountPane();

    receive(tell(1));

    expect(dotted()).toEqual([]);
    expect(unreadStore.getUnreadState().armed).toBe(false);
  });

  it('does not light history that was already there when the dot was switched on (UNREAD-01)', () => {
    mockMessages = [tell(1), tell(2), msg(3, 'gtell', "Bob tells the group 'x'")];

    mountPane();

    expect(dotted()).toEqual([]);
    expect(unreadStore.getUnreadState()).toMatchObject({ armed: true, baseline: 3 });
  });

  it('puts a dot on the tab of a channel that gets a new message, and never on All (E3, E11)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();

    receive(tell(2));

    expect(dotted()).toEqual(['TELL']);
    expect(screen.getByRole('tab', { name: 'TELL unread messages' })).toHaveAttribute('data-unread', 'true');
    expect(screen.getByRole('tab', { name: 'All' })).not.toHaveAttribute('data-unread');
  });

  it('shows the pill of a channel that has just got its first message already marked unread (E2)', () => {
    configure({ showHiddenChatPanes: false });
    mockMessages = [msg(1, 'say', "Alice says 'x'")];
    const { receive } = mountPane();
    expect(screen.queryByRole('tab', { name: /^TELL\b/ })).not.toBeInTheDocument();

    receive(tell(2));

    expect(screen.getByRole('tab', { name: /^TELL\b/ })).toHaveAttribute('data-unread', 'true');
    expect(screen.getByRole('tab', { name: 'SAY' })).not.toHaveAttribute('data-unread');
  });

  it('clears a dot when the tab is clicked, keeps the pane you are on clear, and dots it again after you leave (E3)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();
    receive(tell(2));
    expect(dotted()).toEqual(['TELL']);

    fireEvent.click(screen.getByRole('tab', { name: /^TELL\b/ }));
    expect(dotted()).toEqual([]);

    receive(tell(3)); // arrives on the pane you are reading
    expect(dotted()).toEqual([]);

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    receive(tell(4));
    expect(dotted()).toEqual(['TELL']);
  });

  it('does not count a line you said yourself as a new message (E12)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();

    receive(msg(2, 'tell', "You tell Bob 'my reply'"));

    expect(dotted()).toEqual([]);
  });

  it('keeps what was seen when the pane unmounts and mounts again, and dots what arrived meanwhile (UNREAD-01)', () => {
    mockMessages = [tell(1)];
    const first = mountPane();
    first.receive(tell(2));
    fireEvent.click(screen.getByRole('tab', { name: /^TELL\b/ }));
    first.unmount();

    const second = mountPane();
    expect(dotted()).toEqual([]); // nothing new since it was read
    second.unmount();

    mockMessages = [...mockMessages, tell(3)];
    mountPane();
    expect(dotted()).toEqual(['TELL']);
  });

  it('keeps the true state when a channel is switched off and on again (E5)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();
    receive(tell(2));

    act(() => updateChatSettings({ enabledPanes: { tell: false } as ChatSettings['enabledPanes'] }));
    expect(screen.queryByRole('tab', { name: /^TELL\b/ })).not.toBeInTheDocument();

    act(() => updateChatSettings({ enabledPanes: { tell: true } as ChatSettings['enabledPanes'] }));
    expect(dotted()).toEqual(['TELL']);
  });

  it('keeps a dot with its tab when the tabs are dragged into a new order (E5)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();
    receive(tell(2));
    const dataTransfer = { setData: jest.fn(), effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(screen.getByRole('tab', { name: /^TELL\b/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole('tab', { name: 'SAY' }), { dataTransfer });

    const order = screen.getAllByRole('tab').map((t) => (t.textContent ?? '').replace('unread messages', '').trim());
    expect(order.slice(0, 3)).toEqual(['All', 'TELL', 'SAY']);
    expect(dotted()).toEqual(['TELL']);
  });

  it('clears every dot and forgets the baseline when the setting is switched off, with no reload (SETTINGS-03)', () => {
    mockMessages = [tell(1)];
    const { receive } = mountPane();
    receive(tell(2));
    expect(dotted()).toEqual(['TELL']);

    act(() => updateChatSettings({ unreadDots: false }));

    expect(dotted()).toEqual([]);
    expect(unreadStore.getUnreadState().armed).toBe(false);
  });

  it('puts no dot when strict chat format is off, because lines then carry no channel (E4)', () => {
    configure({ strictChatFormat: false });
    mockMessages = [tell(1)];
    const { receive } = mountPane();

    receive(tell(2));

    expect(dotted()).toEqual([]);
    expect(unreadStore.getUnreadState().armed).toBe(false);
  });

  it('stops listening to the unread store when the pane unmounts', () => {
    const offs: jest.Mock[] = [];
    const real = unreadStore.subscribeUnread;
    jest.spyOn(unreadStore, 'subscribeUnread').mockImplementation((fn) => {
      const off = jest.fn(real(fn));
      offs.push(off);
      return off;
    });

    const { unmount } = mountPane();
    expect(offs).toHaveLength(1);
    expect(offs[0]).not.toHaveBeenCalled();

    unmount();

    expect(offs[0]).toHaveBeenCalledTimes(1);
  });
});

describe('ChatPane existing behaviour in the component this item changed', () => {
  const openGear = () => fireEvent.click(screen.getByRole('button', { name: 'Chat settings' }));
  type Box = { top: number; bottom: number; left: number; right: number };
  const domRect = (r: Box) => ({
    ...r,
    x: r.left,
    y: r.top,
    width: r.right - r.left,
    height: r.bottom - r.top,
    toJSON: () => ({}),
  });
  const rect = (r: Box) => jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(domRect(r));
  const menuOf = () => screen.getByRole('checkbox', { name: 'Strict Chat Format' }).closest('[style]') as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    mockMessages = [];
    mockPaneMessages = [];
    unreadStore.disarmUnread();
    configure({ unreadDots: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockPaneMessages = [];
    mockShowJump = false;
    mockJumpToLive.mockClear();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  });

  it('offers Jump to live on a pane that is scrolled away from the newest message, and calls the hook when pressed', () => {
    mockShowJump = true;
    render(<ChatPane />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Jump to live' })[0]);

    expect(mockJumpToLive).toHaveBeenCalledTimes(1);
  });

  it('goes back to All when chat panes are switched off while you are on a channel tab', () => {
    render(<ChatPane />);
    fireEvent.click(screen.getByRole('tab', { name: /^TELL\b/ }));
    expect(screen.getByRole('tab', { name: /^TELL\b/ })).toHaveAttribute('aria-selected', 'true');

    act(() => updateChatSettings({ enableChatPanes: false }));

    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('goes back to All when the channel you are on is switched off', () => {
    render(<ChatPane />);
    fireEvent.click(screen.getByRole('tab', { name: /^TELL\b/ }));

    act(() => updateChatSettings({ enabledPanes: { tell: false } as ChatSettings['enabledPanes'] }));

    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /^TELL\b/ })).not.toBeInTheDocument();
  });

  it('leaves the dots as they were when you open a channel that has no messages', () => {
    configure(); // dot on, channels shown even without messages
    mockMessages = [tell(1)];
    const { receive } = mountPane();
    receive(tell(2));
    expect(dotted()).toEqual(['TELL']);

    fireEvent.click(screen.getByRole('tab', { name: 'SAY' }));

    expect(dotted()).toEqual(['TELL']);
  });

  it('sizes the menu from the browser visual viewport when there is one, and stops listening to it when the menu closes', () => {
    const viewport = { height: 300, width: 800, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    rect({ top: 10, bottom: 32, left: 20, right: 46 });
    render(<ChatPane />);

    openGear();

    expect(menuOf().style.maxHeight).toBe('254px'); // 300 - 32 (gear bottom) - 8 (margin) - 6 (gap)
    expect(viewport.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(viewport.removeEventListener).not.toHaveBeenCalled();

    openGear(); // closes the menu

    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('draws the messages of a pane as chat bubbles', () => {
    mockPaneMessages = [msg(1, 'tell', "Alice tells you 'hello there'")];

    render(<ChatPane />);

    expect(screen.getAllByText("Alice tells you 'hello there'").length).toBeGreaterThan(0);
  });

  it('switches a channel on or off from its checkbox in the gear menu', () => {
    render(<ChatPane />);
    openGear();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable tell' }));

    expect(getChatSettings().enabledPanes.tell).toBe(false);
    expect(screen.queryByRole('tab', { name: /^TELL\b/ })).not.toBeInTheDocument();
  });

  it('opens the menu below the gear and to its left edge when the gear sits at the top left', () => {
    rect({ top: 10, bottom: 32, left: 20, right: 46 });
    render(<ChatPane />);

    openGear();

    expect(menuOf().style.top).toBe('38px');
    expect(menuOf().style.left).toBe('20px');
    expect(menuOf().style.right).toBe('');
  });

  it('opens the menu above the gear and to its right edge when the gear sits at the bottom right', () => {
    rect({ top: 700, bottom: 722, left: 900, right: 926 });
    render(<ChatPane />);

    openGear();

    expect(menuOf().style.top).toBe('8px');
    expect(menuOf().style.right).toBe('98px');
    expect(menuOf().style.left).toBe('');
  });

  it('switches strict chat format, chat panes and hidden panes from their checkboxes in the gear menu', () => {
    configure({ unreadDots: false, strictChatFormat: false, enableChatPanes: true, showHiddenChatPanes: false });
    render(<ChatPane />);
    openGear();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Strict Chat Format' }));
    expect(getChatSettings().strictChatFormat).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Hidden Chat Panes' }));
    expect(getChatSettings().showHiddenChatPanes).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Chat Panes' }));
    expect(getChatSettings().enableChatPanes).toBe(false);
    expect(screen.getAllByRole('tab')).toHaveLength(1); // only All is left

    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable Chat Panes' }));
    expect(getChatSettings().enableChatPanes).toBe(true);
  });

  it('moves the open menu when the window is resized or scrolled, and keeps it where it is once closed', () => {
    const box = rect({ top: 10, bottom: 32, left: 20, right: 46 });
    render(<ChatPane />);
    openGear();
    expect(menuOf().style.top).toBe('38px');

    box.mockReturnValue(domRect({ top: 50, bottom: 72, left: 20, right: 46 }));
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(menuOf().style.top).toBe('78px');

    box.mockReturnValue(domRect({ top: 90, bottom: 112, left: 20, right: 46 }));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(menuOf().style.top).toBe('118px');

    openGear(); // closes the menu: its listeners are removed, so a later resize cannot reopen or move anything
    box.mockReturnValue(domRect({ top: 300, bottom: 322, left: 20, right: 46 }));
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByRole('checkbox', { name: 'Strict Chat Format' })).not.toBeInTheDocument();
  });

  it('closes the menu when the dark area around it is pressed, but not when the menu itself is', () => {
    render(<ChatPane />);
    openGear();

    fireEvent.mouseDown(screen.getByRole('checkbox', { name: 'Strict Chat Format' }));
    expect(screen.getByRole('checkbox', { name: 'Strict Chat Format' })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(screen.queryByRole('checkbox', { name: 'Strict Chat Format' })).not.toBeInTheDocument();
  });

  it('leaves the tab order alone when a tab is dropped on itself, or dropped with nothing being dragged', () => {
    render(<ChatPane />);
    const order = () => screen.getAllByRole('tab').map((t) => t.textContent);
    const before = order();
    const dataTransfer = { setData: jest.fn(), effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(screen.getByRole('tab', { name: /^TELL\b/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole('tab', { name: /^TELL\b/ }), { dataTransfer }); // onto itself
    fireEvent.drop(screen.getByRole('tab', { name: 'SAY' }), { dataTransfer }); // the drag was already used up
    expect(order()).toEqual(before);

    fireEvent.dragStart(screen.getByRole('tab', { name: /^TELL\b/ }), { dataTransfer });
    fireEvent.dragEnd(screen.getByRole('tab', { name: /^TELL\b/ }), { dataTransfer });
    fireEvent.drop(screen.getByRole('tab', { name: 'SAY' }), { dataTransfer }); // the drag was cancelled
    expect(order()).toEqual(before);
  });

  it('allows a tab to be dragged over another by marking the drop as a move', () => {
    render(<ChatPane />);
    const dataTransfer = { setData: jest.fn(), effectAllowed: '', dropEffect: '' };

    fireEvent.dragOver(screen.getByRole('tab', { name: 'SAY' }), { dataTransfer });

    expect(dataTransfer.dropEffect).toBe('move');
  });
});

describe('ChatPane gear menu: unread dot row and help', () => {
  const openGear = () => fireEvent.click(screen.getByRole('button', { name: 'Chat settings' }));

  beforeEach(() => {
    localStorage.clear();
    mockMessages = [];
    unreadStore.disarmUnread();
  });

  it('disables the row and names what is missing, then enables it once both are on (E4)', () => {
    configure({ strictChatFormat: false, enableChatPanes: false, unreadDots: false });
    render(<ChatPane />);
    openGear();
    const row = () => screen.getByRole('checkbox', { name: 'Unread dot on pane tabs' });

    expect(row()).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('Needs Strict Chat Format and Enable Chat Panes.');

    act(() => updateChatSettings({ strictChatFormat: true }));
    expect(row()).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('Needs Enable Chat Panes.');

    act(() => updateChatSettings({ strictChatFormat: false, enableChatPanes: true }));
    expect(screen.getByRole('note')).toHaveTextContent('Needs Strict Chat Format.');

    act(() => updateChatSettings({ strictChatFormat: true }));
    expect(row()).toBeEnabled();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('turns the setting on and off through the chat settings store (SETTINGS-04)', () => {
    configure({ unreadDots: false });
    render(<ChatPane />);
    openGear();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Unread dot on pane tabs' }));
    expect(getChatSettings().unreadDots).toBe(true);
    expect(JSON.parse(localStorage.getItem('shatteredArchive.chatSettings.v1') ?? '{}').unreadDots).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Unread dot on pane tabs' }));
    expect(getChatSettings().unreadDots).toBe(false);
  });

  it('shows the help in place of the settings rows, and Back brings the rows back', () => {
    configure();
    render(<ChatPane />);
    openGear();
    expect(screen.getByRole('checkbox', { name: 'Strict Chat Format' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Help: chat panes' }));
    expect(screen.getByRole('article', { name: 'Chat panes help' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Strict Chat Format' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to chat settings/ }));
    expect(screen.queryByRole('article', { name: 'Chat panes help' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Strict Chat Format' })).toBeInTheDocument();
  });

  it('opens on the settings rows again after the menu was closed with the help showing', () => {
    configure();
    render(<ChatPane />);
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'Help: chat panes' }));

    openGear(); // closes the menu
    openGear(); // opens it again

    expect(screen.queryByRole('article', { name: 'Chat panes help' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Strict Chat Format' })).toBeInTheDocument();
  });
});
