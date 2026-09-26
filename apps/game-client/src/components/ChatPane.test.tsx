import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatPane } from './ChatPane';
import { KNOWN_CHAT_SUBTYPES, setChatSettings, type ChatSettings } from '../features/chat/chat-settings-store';

jest.mock('../hooks/useChatLog', () => ({
  useChatLog: () => ({ messages: [] }),
}));

jest.mock('../hooks/useChatPane', () => ({
  useChatPane: () => ({
    messages: [],
    scrollRef: { current: null },
    showJump: false,
    handleScroll: jest.fn(),
    handleJumpToLive: jest.fn(),
  }),
}));

// A handful of subtypes is enough to exercise the pill strip without pinning
// the full 21-subtype list.
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
