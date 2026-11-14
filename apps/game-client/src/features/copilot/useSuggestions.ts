import { useCallback, useEffect, useRef, useState } from 'react';
import type { Suggestion } from '@shatteredarchive/copilot-core';
import type { CopilotApi } from './api';

export interface SuggestionsView {
  /** Oldest first: the owner answers in the order the agent asked. One entry per suggestion id. */
  suggestions: Suggestion[];
  /** The server could not be reached or answered badly on the last poll: the list shown is the last good one. */
  stale: boolean;
  /** How many tickets are open on the server (`null` until known or when the last answer failed). */
  openTickets: number | null;
  /** Drop a suggestion at once after the owner answered it, so it does not wait for the next poll. */
  dismiss(id: string): void;
}

/** Oldest first, one per id (the newest copy wins). */
export function orderSuggestions(list: readonly Suggestion[]): Suggestion[] {
  const byId = new Map<string, Suggestion>();
  for (const s of list) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Polls the suggestions and the open-ticket count while mounted. A poll is scheduled only after the previous one answered, each is
 * aborted on unmount, and none starts after it. An offline server keeps the last list and marks it stale; it is never an error.
 */
export function useSuggestions(api: CopilotApi, intervalMs = 3000): SuggestionsView {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stale, setStale] = useState(false);
  const [openTickets, setOpenTickets] = useState<number | null>(null);
  // ids the owner answered: they stay hidden even if a poll that was already in flight still lists them
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      const [list, tickets] = await Promise.all([api.getSuggestions(controller.signal), api.getOpenTickets(controller.signal)]);
      if (controller.signal.aborted) return;
      if (list.ok) {
        const live = new Set(list.value.map((s) => s.id));
        for (const id of dismissed.current) if (!live.has(id)) dismissed.current.delete(id); // the server has retired it
        setSuggestions(orderSuggestions(list.value.filter((s) => !dismissed.current.has(s.id))));
        setStale(false);
      } else {
        setStale(true);
      }
      setOpenTickets(tickets.ok ? tickets.value.length : null);
      timer = setTimeout(() => void poll(), intervalMs);
    };
    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, intervalMs]);

  const dismiss = useCallback((id: string): void => {
    dismissed.current.add(id);
    setSuggestions((current) => current.filter((s) => s.id !== id));
  }, []);

  return { suggestions, stale, openTickets, dismiss };
}
