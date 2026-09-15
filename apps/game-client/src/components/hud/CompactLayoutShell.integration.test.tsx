// apps/game-client/src/components/hud/CompactLayoutShell.integration.test.tsx
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactLayoutShell } from './CompactLayoutShell';
import { pluginHost } from '../../features/plugins/pluginHost';
import type { PluginRuntimeApi } from '@shatteredarchive/types-client';

jest.mock('../../hooks/useCharacterIdentity', () => ({ useCharacterIdentity: () => ({ characterName: null }) }));
jest.mock('../../hooks/useRoomHeader', () => ({ useRoomHeader: () => ({ roomName: '', roomFlags: '' }) }));
jest.mock('../../hooks/useCompassBlock', () => ({ useCompassBlock: () => ({ hasExit: () => false, move: jest.fn() }) }));
jest.mock('../../hooks/useLayoutShell', () => ({
  useStatusBlockViewModel: () => ({
    remaining: '',
    vitals: { hp: 1, hpMax: 1, mp: 1, mpMax: 1, stamina: 1, staminaMax: 1 },
    hpPct: 100,
    mpPct: 100,
    staPct: 100,
  }),
}));
jest.mock('../../hooks/useOpponentStatus', () => ({
  useOpponentStatus: () => ({ enemyUi: { lastSeenTs: 0, label: '', pct: 0, statusText: '' }, isEnemyActive: false, damageChunk: null }),
}));
jest.mock('../Terminal', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../ChatPane', () => ({ ChatPane: () => <div /> }));
jest.mock('../AffectsBlock', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../CommandInput', () => ({ __esModule: true, default: () => <div /> }));

describe('widget slot end-to-end (plugin -> registry -> CompactLayoutShell)', () => {
  it('a plugin publishing via PluginRuntimeApi shows up in the real rendered layout', () => {
    pluginHost.setConnection('integration-test');
    let api: PluginRuntimeApi | null = null;

    pluginHost.registerModule({
      manifest: { id: 'autoleveling-stand-in', name: 'AutoLeveling stand-in', version: '1.0.0' },
      onEnable: (a) => {
        api = a;
      },
    });
    pluginHost.enable('autoleveling-stand-in');

    render(<CompactLayoutShell isConnected sendRaw={jest.fn()} />);
    expect(screen.queryByText('A rabid wolf')).toBeNull();

    // setHudWidget -> publishHudWidget dispatches a native window CustomEvent
    // synchronously, and CompactWidgetSlot's listener calls a useState setter
    // from outside React's event handling, so the resulting re-render needs an
    // act() wrapper to flush before the assertion below reads the DOM (same
    // pattern as CompactWidgetSlot.test.tsx's "updates live when the occupant
    // changes after mount" case).
    act(() => {
      api!.setHudWidget!('hud.rightColumn', { label: 'Enemy', value: 'A rabid wolf' });
    });
    expect(screen.getByText('A rabid wolf')).toBeInTheDocument();

    act(() => {
      pluginHost.disable('autoleveling-stand-in');
    });
    expect(screen.queryByText('A rabid wolf')).toBeNull();
  });
});
