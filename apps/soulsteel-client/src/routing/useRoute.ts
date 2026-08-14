import { useCallback, useEffect, useState } from 'react';

import { ROOM_PATH_RE } from './room-id.js';

/**
 * A ~40-line path router, deliberately not a router library — mirrors scrum-poker-client's
 * `useRoute.ts`. The app has exactly two routes: the landing page and `/room/:id`. The client's
 * nginx (Step 6) serves index.html for unknown paths, so a cold load of a bookmarked room link
 * works.
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
