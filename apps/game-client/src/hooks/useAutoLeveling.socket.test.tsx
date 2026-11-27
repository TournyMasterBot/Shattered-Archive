// The autopilot hook and the script sandbox hook both follow the socket. The shared dispatcher keeps one
// listener per key, so they must not use the same keys.
import { act, renderHook } from '@testing-library/react';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { useAutoLeveling } from './useAutoLeveling';
import { useUserScriptSandbox } from './useUserScriptSandbox';

// both read import.meta, which the jest transform does not support
jest.mock('../features/autoleveling/autoleveling-debug', () => ({ isAutoLevelingDebugEnabled: () => false }));
jest.mock('../features/autoleveling/autoleveling-storage', () => ({
  loadAutoLevelConfig: (_id: string, fallback: unknown) => fallback,
  saveAutoLevelConfig: jest.fn(),
  resetAutoLevelConfig: jest.fn(),
}));

it('keeps following the socket when the sandbox hook subscribes after it', () => {
  const autopilot = renderHook(() => useAutoLeveling('dsl-mud', false));
  const sandbox = renderHook(() => useUserScriptSandbox('dsl-mud'));
  expect(autopilot.result.current.socketReady).toBe(false);

  act(() => DispatchEvent('game:remote-server:open', {}));
  expect(autopilot.result.current.socketReady).toBe(true);

  act(() => DispatchEvent('game:remote-server:close', {}));
  expect(autopilot.result.current.socketReady).toBe(false);

  sandbox.unmount();
  autopilot.unmount();
});
