/**
 * What a global function may hand back across languages: plain data only (string, number, boolean, null, list,
 * dict / object). A function, class instance, Date or cycle has no equivalent in the other languages, so it is
 * dropped to `undefined` (or its JSON form for a Date) rather than leaking an engine-specific object.
 */
export function toPlainData(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? undefined : JSON.parse(json);
  } catch {
    return undefined;
  }
}
