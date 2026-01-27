export function shouldTraceDispatch(): boolean {
  try {
    return String(window.localStorage.getItem('shatteredarchive.events.trace') ?? '') === '1';
  } catch {
    return false;
  }
}