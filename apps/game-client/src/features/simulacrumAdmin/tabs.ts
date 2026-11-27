export type TabId = 'players' | 'world' | 'server' | 'commands' | 'gmcp' | 'activity';

/** The window's tabs, in display order. Navigation is free: any tab can be opened at any time. */
export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'players', label: 'Players' },
  { id: 'world', label: 'World' },
  { id: 'server', label: 'Server' },
  { id: 'commands', label: 'Commands' },
  { id: 'gmcp', label: 'GMCP' },
  { id: 'activity', label: 'Activity' },
];
