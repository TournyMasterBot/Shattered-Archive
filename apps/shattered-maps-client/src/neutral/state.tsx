import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { loadAudited, saveAudited } from './persist';
import { initialState, neutralReducer, type NeutralAction, type NeutralState, type NoticeState } from './store';

/** Provider and hook for the neutral viewer's state (the reducer is in store.ts). The audited file and the review log are kept in the browser. */

const bad = (text: string): NoticeState => ({ tone: 'error', text });

interface Ctx {
  state: NeutralState;
  dispatch: Dispatch<NeutralAction>;
}

const NeutralContext = createContext<Ctx | null>(null);

export function NeutralProvider({ children, initial }: { children: ReactNode; initial?: NeutralState }) {
  const [state, dispatch] = useReducer(neutralReducer, initial, (given) => {
    if (given) return given;
    const stored = loadAudited();
    return initialState(stored.audited, stored.log);
  });
  const first = useRef(true);
  useEffect(() => {
    // the first run only mirrors what was just read; later runs are the curator's changes
    if (first.current) {
      first.current = false;
      return;
    }
    if (!saveAudited(state.audited, state.log)) dispatch({ type: 'notice', notice: bad('The browser would not keep the audited file (storage is full or unavailable). Download it now so the work is not lost.') });
  }, [state.audited, state.log]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <NeutralContext.Provider value={value}>{children}</NeutralContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook lives beside its provider, as in the classic editor's store
export function useNeutral(): Ctx {
  const ctx = useContext(NeutralContext);
  if (!ctx) throw new Error('useNeutral must be used inside <NeutralProvider>');
  return ctx;
}
