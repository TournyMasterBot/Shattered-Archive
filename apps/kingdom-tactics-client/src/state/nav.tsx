import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { ArmyRoster, GameModeId, TerrainChoice } from '@shatteredarchive/kingdom-tactics-engine';

/**
 * Screen navigation store — a tiny React context + `useReducer`, deliberately in place of a
 * router or external state lib (v1 constraint). The client is a handful of full-screen
 * surfaces; `screen` selects which one renders and `matchPayload` carries the setup a match
 * screen needs.
 */
export type Screen = 'menu' | 'army-builder' | 'match' | 'scenario' | 'simulator' | 'online' | 'account';

/** Everything a match screen needs to deterministically seed a match via `buildMatch`. */
export interface MatchStartPayload {
  readonly modeId: GameModeId;
  readonly rosters: readonly ArmyRoster[];
  readonly seed: number;
  /** Board terrain (default 'flat'). */
  readonly terrain?: TerrainChoice;
  /** Two human seats, no AI (local hot-seat). Default false. */
  readonly hotSeat?: boolean;
}

export interface NavState {
  readonly screen: Screen;
  /** Present when `screen === 'match'`; the setup to build/play. */
  readonly matchPayload?: MatchStartPayload;
}

export type NavAction =
  | { readonly type: 'navigate'; readonly screen: Screen }
  | { readonly type: 'start-match'; readonly payload: MatchStartPayload };

function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'navigate':
      return { screen: action.screen };
    case 'start-match':
      return { screen: 'match', matchPayload: action.payload };
    default:
      return state;
  }
}

interface NavContextValue {
  readonly state: NavState;
  readonly navigate: (screen: Screen) => void;
  readonly startMatch: (payload: MatchStartPayload) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(navReducer, { screen: 'menu' });
  const value = useMemo<NavContextValue>(
    () => ({
      state,
      navigate: (screen) => dispatch({ type: 'navigate', screen }),
      startMatch: (payload) => dispatch({ type: 'start-match', payload }),
    }),
    [state],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

/** Access the nav store. Throws if used outside a {@link NavProvider} (a wiring bug). */
export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within a <NavProvider>');
  return ctx;
}
