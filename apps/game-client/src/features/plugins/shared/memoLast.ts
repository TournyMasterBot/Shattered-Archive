// apps/game-client/src/features/plugins/shared/memoLast.ts

/**
 * Remember the last argument and its result. For parsers that run on every received
 * line against a config string that changes only when the user edits it: the first
 * call after an edit parses, every later call returns the same array. Callers must
 * treat the result as read-only, since it is shared.
 *
 * Mirrors the mobile app's features/scripts/memo-last.ts.
 */
export function memoLast<A, R>(fn: (arg: A) => R): (arg: A) => R {
  let has = false;
  let lastArg: A;
  let lastResult: R;
  return (arg: A): R => {
    if (has && Object.is(arg, lastArg)) return lastResult;
    lastResult = fn(arg);
    lastArg = arg;
    has = true;
    return lastResult;
  };
}
