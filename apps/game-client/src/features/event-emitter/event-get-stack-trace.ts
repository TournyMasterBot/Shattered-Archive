export function getStackTrace(): string | undefined {
  try {
    const err = new Error('listener stack');
    return err.stack;
  } catch {
    return undefined;
  }
}
