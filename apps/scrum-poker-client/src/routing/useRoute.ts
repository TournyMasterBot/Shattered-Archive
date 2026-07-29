import { useCallback, useEffect, useState } from 'react';

import { ROOM_PATH_RE } from './room-id.js';

/**
 * A ~40-line path router, deliberately not a router library.
 *
 * The app has exactly two routes — the landing page and `/room/:code` — and the rest of this
 * repo's SPAs ship without a router at all. A shareable, deep-linkable room URL is the one
 * thing that genuinely needs history here, and `pushState` + `popstate` covers it. The
 * client's nginx already serves index.html for unknown paths, so a cold load of
 * /room/3f2504e0-4f89-41d3-9a0c-0305e82c3301 works.
 */

export type Route = { name: 'landing' } | { name: 'room'; roomId: string };

export function parseRoute(pathname: string): Route {
  const match = ROOM_PATH_RE.exec(pathname);
  return match ? { name: 'room', roomId: match[1]! } : { name: 'landing' };
}

export function roomPath(roomId: string): string {
  return `/room/${roomId}`;
}

export function useRoute(): { route: Route; navigate: (path: string) => void } {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
  }, []);

  return { route, navigate };
}
