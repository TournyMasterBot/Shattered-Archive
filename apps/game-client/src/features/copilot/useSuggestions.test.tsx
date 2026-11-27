import { act, renderHook, waitFor } from '@testing-library/react';
import type { EscalationTicket, Suggestion } from '@shatteredarchive/copilot-core';
import type { ApiResult, CopilotApi } from './api';
import { orderSuggestions, useSuggestions } from './useSuggestions';

const make = (id: string, createdAt: number): Suggestion => ({
  id,
  character: 'Agate-F',
  createdAt,
  mode: 'exploration',
  sphere: 'world',
  kind: 'move',
  command: 'north',
  rationale: 'r',
  confidence: 0.8,
  confidenceSource: 'model',
  situationKey: 'k',
});
const ticket = { id: 't1' } as EscalationTicket;

function fakeApi(script: { suggestions: () => ApiResult<Suggestion[]>; tickets?: () => ApiResult<EscalationTicket[]> }) {
  const signals: AbortSignal[] = [];
  let calls = 0;
  const api = {
    getSuggestions: async (signal: AbortSignal) => {
      calls += 1;
      signals.push(signal);
      return script.suggestions();
    },
    getOpenTickets: async () => (script.tickets ? script.tickets() : { ok: true as const, value: [] }),
  } as unknown as CopilotApi;
  return { api, signals, calls: () => calls };
}

describe('orderSuggestions', () => {
  it('puts the oldest first and keeps one entry per id, the later copy winning', () => {
    const later = { ...make('b', 9), command: 'south' };
    const out = orderSuggestions([make('b', 3), make('a', 2), later]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out[1].command).toBe('south');
  });
});

describe('useSuggestions', () => {
  it('lists the suggestions oldest first and counts the open tickets', async () => {
    const { api } = fakeApi({ suggestions: () => ({ ok: true, value: [make('b', 5), make('a', 1)] }), tickets: () => ({ ok: true, value: [ticket, ticket] }) });
    const { result, unmount } = renderHook(() => useSuggestions(api, 5));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.current.openTickets).toBe(2);
    expect(result.current.stale).toBe(false);
    unmount();
  });

  it('keeps the last list and marks it stale while the server is unreachable, then recovers', async () => {
    let up = true;
    const { api } = fakeApi({
      suggestions: () => (up ? { ok: true, value: [make('a', 1)] } : { ok: false, reason: 'offline' }),
      tickets: () => (up ? { ok: true, value: [ticket] } : { ok: false, reason: 'offline' }),
    });
    const { result, unmount } = renderHook(() => useSuggestions(api, 5));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    up = false;
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['a']);
    expect(result.current.openTickets).toBeNull();
    up = true;
    await waitFor(() => expect(result.current.stale).toBe(false));
    unmount();
  });

  it('dismiss removes a suggestion at once and keeps it hidden while the server still lists it', async () => {
    const { api } = fakeApi({ suggestions: () => ({ ok: true, value: [make('a', 1), make('b', 2)] }) });
    const { result, unmount } = renderHook(() => useSuggestions(api, 5));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
    act(() => result.current.dismiss('a'));
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['b']);
    await new Promise((resolve) => setTimeout(resolve, 40)); // several more polls, each still listing 'a'
    expect(result.current.suggestions.map((s) => s.id)).toEqual(['b']);
    unmount();
  });

  it('forgets a dismissed id once the server has retired it, so a new suggestion with that id shows', async () => {
    let list = [make('a', 1)];
    const { api } = fakeApi({ suggestions: () => ({ ok: true, value: list }) });
    const { result, unmount } = renderHook(() => useSuggestions(api, 5));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    act(() => result.current.dismiss('a'));
    list = [];
    await new Promise((resolve) => setTimeout(resolve, 30));
    list = [make('a', 3)];
    await waitFor(() => expect(result.current.suggestions.map((s) => s.id)).toEqual(['a']));
    unmount();
  });

  it('an answer that arrives after unmount changes nothing and schedules no further poll', async () => {
    let release: (value: ApiResult<Suggestion[]>) => void = () => undefined;
    let calls = 0;
    const api = {
      getSuggestions: () => {
        calls += 1;
        return new Promise<ApiResult<Suggestion[]>>((resolve) => (release = resolve));
      },
      getOpenTickets: async () => ({ ok: true as const, value: [] }),
    } as unknown as CopilotApi;
    const { result, unmount } = renderHook(() => useSuggestions(api, 5));
    unmount(); // before the first poll has answered: there is no timer to clear yet
    release({ ok: true, value: [make('a', 1)] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(calls).toBe(1);
    expect(result.current.suggestions).toEqual([]);
  });

  it('stops polling on unmount and aborts the poll in flight', async () => {
    const { api, signals, calls } = fakeApi({ suggestions: () => ({ ok: true, value: [] }) });
    const { unmount } = renderHook(() => useSuggestions(api, 5));
    await waitFor(() => expect(calls()).toBeGreaterThan(1));
    unmount();
    const after = calls();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls()).toBe(after);
    expect(signals[signals.length - 1].aborted).toBe(true);
  });
});
